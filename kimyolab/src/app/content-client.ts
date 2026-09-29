import { evaluateContentPackCompatibility } from '../runtime/compatibility/content-pack.ts';
import { APP_COMPATIBILITY } from './app-version.ts';
import { buildLearningHubModel, type LearningHubModel } from '../features/learning-hub/model.ts';
import { buildPracticePageModel, type StudentPracticePageModel } from '../features/practice/model.ts';
import {validateExternalLabBindings,bindingsForLearningUnit} from '../integrations/external-labs/registry.ts';
import type {ExternalLabBinding} from '../integrations/external-labs/types.ts';
import type {LabCatalogModel} from '../features/labs/model.ts';

type FetchLike=(url:string)=>Promise<{ok:boolean;status:number;json:()=>Promise<any>}>;

export class ContentLoadError extends Error {
  code:string;
  status?:number;
  resource?:string;
  constructor(code:string,options:{status?:number;resource?:string}={}){
    super(code); this.name='ContentLoadError'; this.code=code; this.status=options.status; this.resource=options.resource;
  }
}

interface ContentClientOptions { fetchImpl?:FetchLike; baseUrl?:string }

export class ContentClient {
  private readonly fetchImpl:FetchLike;
  private readonly baseUrl:string;
  private activeVersion?:string;
  private cache=new Map<string,any>();
  constructor(options:ContentClientOptions={}){
    const globalFetch=(globalThis as any).fetch as FetchLike|undefined;
    if(!options.fetchImpl&&!globalFetch) throw new ContentLoadError('CONTENT_FETCH_UNAVAILABLE');
    this.fetchImpl=options.fetchImpl??globalFetch!;
    this.baseUrl=(options.baseUrl??'/content').replace(/\/$/,'');
  }

  private async json(url:string){
    if(this.cache.has(url)) return this.cache.get(url);
    let response;
    try{ response=await this.fetchImpl(url); }
    catch{ throw new ContentLoadError('CONTENT_NETWORK_ERROR',{resource:url}); }
    if(!response.ok) throw new ContentLoadError('CONTENT_HTTP_ERROR',{status:response.status,resource:url});
    let value;
    try{ value=await response.json(); }
    catch{ throw new ContentLoadError('CONTENT_JSON_INVALID',{resource:url}); }
    this.cache.set(url,value); return value;
  }

  private async version(){
    if(this.activeVersion) return this.activeVersion;
    const pointer=await this.json(`${this.baseUrl}/manifest.json`);
    if(!pointer||typeof pointer.activeVersion!=='string'||typeof pointer.checksum!=='string'||typeof pointer.manifest!=='string') throw new ContentLoadError('CONTENT_MANIFEST_INVALID',{resource:`${this.baseUrl}/manifest.json`});
    const packManifest=await this.json(`${this.baseUrl}/${pointer.activeVersion}/manifest.json`);
    const compatibility=evaluateContentPackCompatibility(pointer,packManifest,APP_COMPATIBILITY);
    if(compatibility.status==='block') throw new ContentLoadError(compatibility.code,{resource:`${this.baseUrl}/${pointer.activeVersion}/manifest.json`});
    this.activeVersion=compatibility.version; return this.activeVersion;
  }

  async loadLearningHub(learningUnitId:string):Promise<LearningHubModel>{
    const match=learningUnitId.match(/^lu\.(7|8|9|10|11)\.[A-Za-z0-9.-]+$/);
    if(!match) throw new ContentLoadError('LEARNING_UNIT_ID_INVALID');
    const grade=Number(match[1]);
    const version=await this.version();
    const prefix=`${this.baseUrl}/${version}`;
    const [units,theories,practices,mappings,concepts,externalRaw,assessmentBank]=await Promise.all([
      this.json(`${prefix}/learning-units/grade-${grade}.json`),
      this.json(`${prefix}/theory-activities.json`),
      this.json(`${prefix}/practice-activities.json`),
      this.json(`${prefix}/mapping-links.json`),
      this.json(`${prefix}/concepts.json`),
      this.json(`${prefix}/external-lab-bindings.json`),
      this.json(`${prefix}/assessment-items.json`),
    ]);
    try{return buildLearningHubModel(learningUnitId,{units,theories,practices,mappings,concepts,externalLabs:bindingsForLearningUnit(validateExternalLabBindings(externalRaw),learningUnitId),assessmentBank});}
    catch(error){
      const code=error instanceof Error?error.message.split(':')[0]:'CONTENT_MODEL_ERROR';
      throw new ContentLoadError(code,{resource:learningUnitId});
    }
  }

  async loadPractice(practiceActivityId:string):Promise<StudentPracticePageModel>{
    if(!/^practice\.(?:experiment|simulation|trainer|calculation|case)\.[A-Za-z0-9.-]+$/.test(practiceActivityId)) throw new ContentLoadError('PRACTICE_ACTIVITY_ID_INVALID');
    const version=await this.version();
    const prefix=`${this.baseUrl}/${version}`;
    const [packManifest,practices,mappings,referenceConfigs,guidedConfigs,beta1Configs,beta2Configs,beta2AdvancedConfigs,beta2OrganicConfigs,beta3Configs,beta3AdvancedConfigs,reactions,solutionRules,hydrolysis,electrolysis,manganeseRedox,organic,kinetics,equilibrium]=await Promise.all([
      this.json(`${prefix}/manifest.json`),
      this.json(`${prefix}/practice-activities.json`),
      this.json(`${prefix}/mapping-links.json`),
      this.json(`${prefix}/activity-configs/reference-slices.json`),
      this.json(`${prefix}/activity-configs/guided-labs.json`),
      this.json(`${prefix}/activity-configs/beta1.json`),
      this.json(`${prefix}/activity-configs/beta2-safe.json`),
      this.json(`${prefix}/activity-configs/beta2-advanced.json`),
      this.json(`${prefix}/activity-configs/beta2-organic.json`),
      this.json(`${prefix}/activity-configs/beta3-safe.json`),
      this.json(`${prefix}/activity-configs/beta3-advanced.json`),
      this.json(`${prefix}/chemistry/reactions.json`),
      this.json(`${prefix}/chemistry/solubility.json`),
      this.json(`${prefix}/chemistry/hydrolysis.json`),
      this.json(`${prefix}/chemistry/electrolysis.json`),
      this.json(`${prefix}/chemistry/manganese-redox.json`),
      this.json(`${prefix}/chemistry/organic.json`),
      this.json(`${prefix}/chemistry/kinetics.json`),
      this.json(`${prefix}/chemistry/equilibrium.json`),
    ]);
    const activity=practices.find((x:any)=>x.id===practiceActivityId);
    if(!activity) throw new ContentLoadError('PRACTICE_ACTIVITY_NOT_FOUND',{resource:practiceActivityId});
    const referenceConfig=referenceConfigs?.[practiceActivityId]??guidedConfigs?.[practiceActivityId]??beta1Configs?.[practiceActivityId]??beta2Configs?.[practiceActivityId]??beta2AdvancedConfigs?.[practiceActivityId]??beta2OrganicConfigs?.[practiceActivityId]??beta3Configs?.[practiceActivityId]??beta3AdvancedConfigs?.[practiceActivityId];
    const configFamily=referenceConfigs?.[practiceActivityId]?'reference':guidedConfigs?.[practiceActivityId]?'guided':beta1Configs?.[practiceActivityId]?'beta1':beta2Configs?.[practiceActivityId]?'beta2':beta2AdvancedConfigs?.[practiceActivityId]?'beta2-advanced':beta2OrganicConfigs?.[practiceActivityId]?'beta2-organic':beta3Configs?.[practiceActivityId]?'beta3':beta3AdvancedConfigs?.[practiceActivityId]?'beta3-advanced':undefined;
    if(!referenceConfig||!configFamily) throw new ContentLoadError('PRACTICE_CONFIG_NOT_FOUND',{resource:practiceActivityId});
    const mapping=mappings.find((x:any)=>x.practiceActivityId===practiceActivityId&&x.role==='primary')
      ??mappings.find((x:any)=>x.practiceActivityId===practiceActivityId);
    if(!mapping) throw new ContentLoadError('PRACTICE_MAPPING_NOT_FOUND',{resource:practiceActivityId});
    const gradeMatch=String(mapping.learningUnitId).match(/^lu\.(7|8|9|10|11)\./);
    if(!gradeMatch) throw new ContentLoadError('LEARNING_UNIT_ID_INVALID',{resource:mapping.learningUnitId});
    const units=await this.json(`${prefix}/learning-units/grade-${gradeMatch[1]}.json`);
    const unit=units.find((x:any)=>x.id===mapping.learningUnitId);
    if(!unit) throw new ContentLoadError('LEARNING_UNIT_NOT_FOUND',{resource:mapping.learningUnitId});
    return buildPracticePageModel({
      activity,mapping,unit,configFamily,referenceConfig,contentVersion:version,
      schemaVersion:String(packManifest.schemaVersion??'0'),
      scoringVersion:String(packManifest.scoringVersion??'0'),
      reactions,solutionRules,hydrolysis,electrolysis,manganeseRedox,organic,kinetics,equilibrium,
    });
  }


  async loadCurriculum(){
    const groups=await Promise.all([7,8,9,10,11].map(g=>this.listLearningUnits(g)));
    return groups.flat();
  }

  async loadExternalLabBindings():Promise<ExternalLabBinding[]> {
    const version=await this.version();
    return validateExternalLabBindings(await this.json(`${this.baseUrl}/${version}/external-lab-bindings.json`));
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
      this.json(`${prefix}/practice-activities.json`),
      this.json(`${prefix}/mapping-links.json`),
      this.json(`${prefix}/external-lab-bindings.json`),
      Promise.all([7,8,9,10,11].map(g=>this.json(`${prefix}/learning-units/grade-${g}.json`))),
      this.json(`${prefix}/activity-configs/reference-slices.json`),
      this.json(`${prefix}/activity-configs/guided-labs.json`),
      this.json(`${prefix}/activity-configs/beta1.json`),
      this.json(`${prefix}/activity-configs/beta2-safe.json`),
      this.json(`${prefix}/activity-configs/beta2-advanced.json`),
      this.json(`${prefix}/activity-configs/beta2-organic.json`),
      this.json(`${prefix}/activity-configs/beta3-safe.json`),
      this.json(`${prefix}/activity-configs/beta3-advanced.json`),
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

  async getRuntimeVersions(){
    const contentVersion=await this.version();
    const manifest=await this.json(`${this.baseUrl}/${contentVersion}/manifest.json`);
    return {contentVersion,assessmentVersion:String(manifest.assessmentVersion??'0.0.0'),schemaVersion:String(manifest.schemaVersion??'0.0.0'),scoringVersion:String(manifest.scoringVersion??'0.0.0')};
  }

  async loadSearchIndex(){
    const version=await this.version(); const prefix=`${this.baseUrl}/${version}`;
    const [groups,practices,mappings,concepts]=await Promise.all([
      Promise.all([7,8,9,10,11].map(g=>this.json(`${prefix}/learning-units/grade-${g}.json`))),
      this.json(`${prefix}/practice-activities.json`),this.json(`${prefix}/mapping-links.json`),this.json(`${prefix}/concepts.json`),
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
    const units=await this.json(`${this.baseUrl}/${version}/learning-units/grade-${grade}.json`);
    return units.map((u:any)=>({id:u.id,grade:u.grade,title:u.title,chapter:u.chapter,learningOutcomes:[...(u.learningOutcomes??[])]}));
  }
}
