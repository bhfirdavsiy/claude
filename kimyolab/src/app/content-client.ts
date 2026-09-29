import { evaluateContentPackCompatibility } from '../runtime/compatibility/content-pack.ts';
import { APP_COMPATIBILITY } from './app-version.ts';
import { buildLearningHubModel, type LearningHubModel } from '../features/learning-hub/model.ts';
import { buildPracticePageModel, type StudentPracticePageModel } from '../features/practice/model.ts';
import {validateExternalLabBindings,bindingsForLearningUnit} from '../integrations/external-labs/registry.ts';
import type {ExternalLabBinding} from '../integrations/external-labs/types.ts';
import type {LabCatalogModel} from '../features/labs/model.ts';

import { sha256Hex, utf8 } from '../domain/content/sha256.ts';
import type { MasteryVersionPolicy } from '../domain/mastery/mastery.ts';
import { EXECUTION_PLAN_PACK_PATH, resolveExecutionPlan } from '../runtime/practice-router/execution-plan.ts';
import { ASSESSMENT_KEY_PACK_PATH, ASSESSMENT_PROMPT_PACK_PATH, isApproved, validateKeyPack, validatePromptPack, type AssessmentKey, type AssessmentPrompt } from '../domain/assessment/model.ts';

type FetchLike=(url:string)=>Promise<{ok:boolean;status:number;json:()=>Promise<any>;text?:()=>Promise<string>;arrayBuffer?:()=>Promise<ArrayBuffer>}>;

export class ContentLoadError extends Error {
  code:string;
  status?:number;
  resource?:string;
  constructor(code:string,options:{status?:number;resource?:string}={}){
    super(code); this.name='ContentLoadError'; this.code=code; this.status=options.status; this.resource=options.resource;
  }
}

/** User-facing message for a content load failure (fail-closed states get an explicit explanation). */
export function contentErrorMessage(error:unknown,fallback:string):string{
  const code=error instanceof ContentLoadError?error.code:undefined;
  if(code==='CONTENT_INTEGRITY_ERROR') return 'Kontent fayli tekshiruvdan o‘tmadi. Sahifani yangilang; muammo takrorlansa, administratorga murojaat qiling.';
  if(code==='APP_VERSION_INCOMPATIBLE'||code==='SCHEMA_VERSION_INCOMPATIBLE') return 'Kontent to‘plami ilova versiyasiga mos emas. Ilovani yangilang.';
  return fallback;
}

interface ContentClientOptions { fetchImpl?:FetchLike; baseUrl?:string }

interface ManifestFile { path:string; checksum:string; size:number }

export class ContentClient {
  private readonly fetchImpl:FetchLike;
  private readonly baseUrl:string;
  private activeVersion?:string;
  private files=new Map<string,ManifestFile>();
  private cache=new Map<string,Promise<any>>();
  private versionPromise?:Promise<string>;
  constructor(options:ContentClientOptions={}){
    const globalFetch=(globalThis as any).fetch as FetchLike|undefined;
    if(!options.fetchImpl&&!globalFetch) throw new ContentLoadError('CONTENT_FETCH_UNAVAILABLE');
    // window.fetch must be called with the global receiver; an unbound method throws "Illegal invocation".
    this.fetchImpl=options.fetchImpl??globalFetch!.bind(globalThis);
    this.baseUrl=(options.baseUrl??'/content').replace(/\/$/,'');
  }

  private async request(url:string){
    let response;
    try{ response=await this.fetchImpl(url); }
    catch{ throw new ContentLoadError('CONTENT_NETWORK_ERROR',{resource:url}); }
    if(!response.ok) throw new ContentLoadError('CONTENT_HTTP_ERROR',{status:response.status,resource:url});
    return response;
  }

  /** Unverified JSON: only for the release pointer and the pack manifest, which are verified structurally. */
  private async json(url:string){
    const response=await this.request(url);
    try{ return await response.json(); }
    catch{ throw new ContentLoadError('CONTENT_JSON_INVALID',{resource:url}); }
  }

  /** Pack data file: raw bytes are hashed and compared with manifest.files[path] before parsing (fail-closed). */
  private packJson(version:string,rel:string):Promise<any>{
    const url=`${this.baseUrl}/${version}/${rel}`;
    const cached=this.cache.get(url);
    if(cached) return cached;
    const pending=(async()=>{
      const entry=this.files.get(rel);
      if(!entry) throw new ContentLoadError('CONTENT_INTEGRITY_ERROR',{resource:url});
      const response=await this.request(url);
      let bytes:Uint8Array;
      try{
        if(typeof response.arrayBuffer==='function') bytes=new Uint8Array(await response.arrayBuffer());
        else if(typeof response.text==='function') bytes=utf8(await response.text());
        else throw new Error('RAW_BODY_UNAVAILABLE');
      }catch{ throw new ContentLoadError('CONTENT_INTEGRITY_ERROR',{resource:url}); }
      if(bytes.length!==entry.size||await sha256Hex(bytes)!==entry.checksum) throw new ContentLoadError('CONTENT_INTEGRITY_ERROR',{resource:url});
      try{ return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
      catch{ throw new ContentLoadError('CONTENT_JSON_INVALID',{resource:url}); }
    })();
    pending.catch(()=>this.cache.delete(url));
    this.cache.set(url,pending);
    return pending;
  }

  private async version(){
    if(this.activeVersion) return this.activeVersion;
    this.versionPromise??=this.resolveVersion().catch((error)=>{this.versionPromise=undefined;throw error;});
    return this.versionPromise;
  }

  private async resolveVersion(){
    const pointer=await this.json(`${this.baseUrl}/manifest.json`);
    if(!pointer||typeof pointer.activeVersion!=='string'||typeof pointer.checksum!=='string'||typeof pointer.manifest!=='string'||!/^[A-Za-z0-9.-]+$/.test(pointer.activeVersion)) throw new ContentLoadError('CONTENT_MANIFEST_INVALID',{resource:`${this.baseUrl}/manifest.json`});
    const manifestUrl=`${this.baseUrl}/${pointer.activeVersion}/manifest.json`;
    const packManifest=await this.json(manifestUrl);
    const compatibility=evaluateContentPackCompatibility(pointer,packManifest,APP_COMPATIBILITY);
    if(compatibility.status==='block') throw new ContentLoadError(compatibility.code,{resource:manifestUrl});
    // The manifest's aggregate checksum must be reproducible from its own file list.
    const files:ManifestFile[]=Array.isArray(packManifest.files)?packManifest.files:[];
    if(!files.length||files.some(f=>!f||typeof f.path!=='string'||!/^[a-f0-9]{64}$/.test(String(f.checksum))||!Number.isInteger(f.size))) throw new ContentLoadError('CONTENT_INTEGRITY_ERROR',{resource:manifestUrl});
    const aggregate=await sha256Hex(utf8(files.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n')));
    if(aggregate!==packManifest.checksum) throw new ContentLoadError('CONTENT_INTEGRITY_ERROR',{resource:manifestUrl});
    this.files=new Map(files.map(f=>[f.path,f]));
    this.manifestCache=packManifest;
    this.activeVersion=compatibility.version; return this.activeVersion;
  }

  private manifestCache?:any;

  async loadLearningHub(learningUnitId:string):Promise<LearningHubModel>{
    const match=learningUnitId.match(/^lu\.(7|8|9|10|11)\.[A-Za-z0-9.-]+$/);
    if(!match) throw new ContentLoadError('LEARNING_UNIT_ID_INVALID');
    const grade=Number(match[1]);
    const version=await this.version();
    const prefix=`${this.baseUrl}/${version}`;
    const [units,theories,practices,mappings,concepts,externalRaw,assessmentPrompts]=await Promise.all([
      this.packJson(version,`learning-units/grade-${grade}.json`),
      this.packJson(version,`theory-activities.json`),
      this.packJson(version,`practice-activities.json`),
      this.packJson(version,`mapping-links.json`),
      this.packJson(version,`concepts.json`),
      this.packJson(version,`external-lab-bindings.json`),
      this.packJson(version,ASSESSMENT_PROMPT_PACK_PATH),
    ]);
    try{return buildLearningHubModel(learningUnitId,{units,theories,practices,mappings,concepts,externalLabs:bindingsForLearningUnit(validateExternalLabBindings(externalRaw),learningUnitId),assessmentPrompts});}
    catch(error){
      const code=error instanceof Error?error.message.split(':')[0]:'CONTENT_MODEL_ERROR';
      throw new ContentLoadError(code,{resource:learningUnitId});
    }
  }

  async loadPractice(practiceActivityId:string):Promise<StudentPracticePageModel>{
    if(!/^practice\.(?:experiment|simulation|trainer|calculation|case)\.[A-Za-z0-9.-]+$/.test(practiceActivityId)) throw new ContentLoadError('PRACTICE_ACTIVITY_ID_INVALID');
    const version=await this.version();
    const prefix=`${this.baseUrl}/${version}`;
    // P1.1 (D8): routing is read from the compiled execution plan — never guessed from which config file
    // happens to contain the activity. Only the plan's own config source is loaded.
    const [packManifest,practices,mappings,planPack,reactions,solutionRules,hydrolysis,electrolysis,manganeseRedox,organic,kinetics,equilibrium]=await Promise.all([
      Promise.resolve(this.manifestCache),
      this.packJson(version,`practice-activities.json`),
      this.packJson(version,`mapping-links.json`),
      this.packJson(version,EXECUTION_PLAN_PACK_PATH),
      this.packJson(version,`chemistry/reactions.json`),
      this.packJson(version,`chemistry/solubility.json`),
      this.packJson(version,`chemistry/hydrolysis.json`),
      this.packJson(version,`chemistry/electrolysis.json`),
      this.packJson(version,`chemistry/manganese-redox.json`),
      this.packJson(version,`chemistry/organic.json`),
      this.packJson(version,`chemistry/kinetics.json`),
      this.packJson(version,`chemistry/equilibrium.json`),
    ]);
    const activity=practices.find((x:any)=>x.id===practiceActivityId);
    if(!activity) throw new ContentLoadError('PRACTICE_ACTIVITY_NOT_FOUND',{resource:practiceActivityId});
    let executionPlan;
    try{executionPlan=resolveExecutionPlan(planPack,practiceActivityId);}
    catch(error){throw new ContentLoadError(error instanceof Error&&error.message==='EXECUTION_PLAN_NOT_FOUND'?'PRACTICE_CONFIG_NOT_FOUND':'EXECUTION_PLAN_INVALID',{resource:practiceActivityId});}
    const configs=await this.packJson(version,`activity-configs/${executionPlan.configSource}.json`);
    const referenceConfig=configs?.[practiceActivityId];
    if(!referenceConfig) throw new ContentLoadError('PRACTICE_CONFIG_NOT_FOUND',{resource:practiceActivityId});
    const mapping=mappings.find((x:any)=>x.practiceActivityId===practiceActivityId&&x.role==='primary')
      ??mappings.find((x:any)=>x.practiceActivityId===practiceActivityId);
    if(!mapping) throw new ContentLoadError('PRACTICE_MAPPING_NOT_FOUND',{resource:practiceActivityId});
    const gradeMatch=String(mapping.learningUnitId).match(/^lu\.(7|8|9|10|11)\./);
    if(!gradeMatch) throw new ContentLoadError('LEARNING_UNIT_ID_INVALID',{resource:mapping.learningUnitId});
    const units=await this.packJson(version,`learning-units/grade-${gradeMatch[1]}.json`);
    const unit=units.find((x:any)=>x.id===mapping.learningUnitId);
    if(!unit) throw new ContentLoadError('LEARNING_UNIT_NOT_FOUND',{resource:mapping.learningUnitId});
    return buildPracticePageModel({
      activity,mapping,unit,executionPlan,referenceConfig,contentVersion:version,
      schemaVersion:String(packManifest.schemaVersion??'0'),
      scoringVersion:String(packManifest.scoringVersion??'0'),
      ...(packManifest.curriculumVersion?{curriculumVersion:String(packManifest.curriculumVersion)}:{}),
      reactions,solutionRules,hydrolysis,electrolysis,manganeseRedox,organic,kinetics,equilibrium,
    });
  }


  async loadCurriculum(){
    const groups=await Promise.all([7,8,9,10,11].map(g=>this.listLearningUnits(g)));
    return groups.flat();
  }

  async loadExternalLabBindings():Promise<ExternalLabBinding[]> {
    const version=await this.version();
    return validateExternalLabBindings(await this.packJson(version,`external-lab-bindings.json`));
  }

  async getExternalLabBinding(bindingId:string):Promise<ExternalLabBinding>{
    const bindings=await this.loadExternalLabBindings();
    const binding=bindings.find(x=>x.id===bindingId);
    if(!binding) throw new ContentLoadError('EXTERNAL_LAB_BINDING_NOT_FOUND',{resource:bindingId});
    return binding;
  }

  async loadLabCatalog():Promise<LabCatalogModel>{
    const version=await this.version(); const prefix=`${this.baseUrl}/${version}`;
    const [practices,mappings,externalRaw,groups,referenceConfigs,guidedConfigs,beta1Configs,beta2Configs,beta2AdvancedConfigs,beta2OrganicConfigs,beta3Configs,beta3AdvancedConfigs]=await Promise.all([
      this.packJson(version,`practice-activities.json`),
      this.packJson(version,`mapping-links.json`),
      this.packJson(version,`external-lab-bindings.json`),
      Promise.all([7,8,9,10,11].map(g=>this.packJson(version,`learning-units/grade-${g}.json`))),
      this.packJson(version,`activity-configs/reference-slices.json`),
      this.packJson(version,`activity-configs/guided-labs.json`),
      this.packJson(version,`activity-configs/beta1.json`),
      this.packJson(version,`activity-configs/beta2-safe.json`),
      this.packJson(version,`activity-configs/beta2-advanced.json`),
      this.packJson(version,`activity-configs/beta2-organic.json`),
      this.packJson(version,`activity-configs/beta3-safe.json`),
      this.packJson(version,`activity-configs/beta3-advanced.json`),
    ]);
    const units=groups.flat(); const unitMap=new Map(units.map((u:any)=>[u.id,u]));
    const configured=new Set<string>();
    const guidedConfigured=new Set(Object.keys(guidedConfigs??{}));
    for(const source of [referenceConfigs,guidedConfigs,beta1Configs,beta2Configs,beta2AdvancedConfigs,beta2OrganicConfigs,beta3Configs,beta3AdvancedConfigs]) for(const id of Object.keys(source??{})) configured.add(id);
    const native=practices.filter((p:any)=>p.type==='experiment').map((activity:any)=>{
      const mapping=mappings.find((x:any)=>x.practiceActivityId===activity.id&&x.role==='primary')??mappings.find((x:any)=>x.practiceActivityId===activity.id);
      const unit:any=mapping?unitMap.get(mapping.learningUnitId):undefined;
      const launchable=configured.has(activity.id);
      const guidedConfig=guidedConfigs?.[activity.id];
      return {kind:'native' as const,id:activity.id,title:activity.title,goal:activity.goal,grade:Number(unit?.grade??0),learningUnitId:String(unit?.id??mapping?.learningUnitId??''),learningUnitTitle:String(unit?.title??''),launchable,executionMode:guidedConfigured.has(activity.id)?'guided':launchable?'engine':'unavailable',...(guidedConfig?.hardening?.status?{hardeningStatus:guidedConfig.hardening.status}:{})};
    }).filter((x:any)=>x.learningUnitId);
    const bindings=validateExternalLabBindings(externalRaw);
    const external=bindings.map(binding=>{
      const learningUnits=binding.learningUnitIds.map(id=>unitMap.get(id)).filter(Boolean).map((u:any)=>({id:u.id,grade:Number(u.grade),title:String(u.title)}));
      return {kind:'external' as const,binding,grades:[...new Set(learningUnits.map((u:any)=>u.grade))],learningUnits};
    });
    return {native,external};
  }

  /**
   * AssessmentContentSource for the canonical evaluator (P1.1). The prompt layer is what was presented;
   * the key layer is fetched only here — at evaluation time, after the learner submitted — never on page
   * load and never into a view model. A server deployment replaces this with server-side evaluation.
   */
  async loadAssessmentForEvaluation(learningUnitId:string):Promise<{version:string;prompts:AssessmentPrompt[];keys:AssessmentKey[]}>{
    const version=await this.version();
    const prompts=validatePromptPack(await this.packJson(version,ASSESSMENT_PROMPT_PACK_PATH));
    const presented=prompts.items.filter(x=>x.learningUnitId===learningUnitId&&isApproved(x));
    const keys=validateKeyPack(await this.packJson(version,ASSESSMENT_KEY_PACK_PATH));
    if(keys.version!==prompts.version) throw new ContentLoadError('ASSESSMENT_KEY_VERSION_MISMATCH',{resource:ASSESSMENT_KEY_PACK_PATH});
    const wanted=new Set(presented.map(x=>x.id));
    return {version:prompts.version,prompts:presented,keys:keys.keys.filter(k=>wanted.has(k.itemId))};
  }

  async getRuntimeVersions(){
    const contentVersion=await this.version();
    const manifest=this.manifestCache;
    // curriculumVersion is part of the mastery context: stage 3 evidence must carry the same context as practice evidence.
    return {contentVersion,assessmentVersion:String(manifest.assessmentVersion??'0.0.0'),schemaVersion:String(manifest.schemaVersion??'0.0.0'),scoringVersion:String(manifest.scoringVersion??'0.0.0'),...(manifest.curriculumVersion?{curriculumVersion:String(manifest.curriculumVersion)}:{})};
  }

  /** Evidence compatibility declared by the active pack; versions not listed are incompatible. */
  async getEvidenceCompatibility():Promise<MasteryVersionPolicy>{
    await this.version();
    const declared=this.manifestCache?.evidenceCompatibility;
    return declared&&typeof declared==='object'?structuredClone(declared):{};
  }

  async loadSearchIndex(){
    const version=await this.version(); const prefix=`${this.baseUrl}/${version}`;
    const [groups,practices,mappings,concepts]=await Promise.all([
      Promise.all([7,8,9,10,11].map(g=>this.packJson(version,`learning-units/grade-${g}.json`))),
      this.packJson(version,`practice-activities.json`),this.packJson(version,`mapping-links.json`),this.packJson(version,`concepts.json`),
    ]);
    const units=groups.flat(); const conceptMap=new Map(concepts.map((x:any)=>[x.id,x])); const unitMap=new Map(units.map((x:any)=>[x.id,x]));
    const out:any[]=[];
    for(const unit of units){const conceptText=(unit.conceptIds??[]).map((id:string)=>{const c:any=conceptMap.get(id);return c?[c.name,...Object.values(c.synonyms??{}).flat()].join(' '):''}).join(' ');out.push({kind:'topic',title:unit.title,description:unit.learningOutcomes?.[0]??unit.chapter??'',href:`/learn/${unit.id}/guide`,grade:unit.grade,searchText:`${unit.chapter??''} ${conceptText}`});}
    for(const activity of practices){const mapping=mappings.find((x:any)=>x.practiceActivityId===activity.id);if(!mapping)continue;const unit:any=unitMap.get(mapping.learningUnitId);out.push({kind:'practice',title:activity.title,description:activity.goal,href:`/practice/${activity.id}`,grade:unit?.grade,searchText:`${activity.type} ${unit?.title??''}`});}
    return out;
  }

  async listLearningUnits(grade:number){
    if(![7,8,9,10,11].includes(grade)) throw new ContentLoadError('GRADE_INVALID');
    const version=await this.version();
    const units=await this.packJson(version,`learning-units/grade-${grade}.json`);
    return units.map((u:any)=>({id:u.id,grade:u.grade,title:u.title,chapter:u.chapter,learningOutcomes:[...(u.learningOutcomes??[])]}));
  }
}
