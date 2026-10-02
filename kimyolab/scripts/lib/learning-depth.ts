// P2.0 — learning depth & coverage baseline. MEASUREMENT ONLY: nothing here changes content, chemistry, answers,
// mappings, renderers, mastery or release. Every number is computed from the repository; every classification rule
// is written down below (and in docs/roadmap/PROGRESS_MODEL.md) so that it can be checked, disputed and re-run.
//
// Core rule: runtime READY is not pedagogical depth. An activity is classified by what the LEARNER can do in the
// real browser path (buildPracticeUiModel / registry renderer intents → ReferencePracticeSession), not by its name.
import fs from 'node:fs';
import path from 'node:path';
import {loadSources} from '../learning-readiness.ts';
import {compileReadiness,itemVerdicts} from './readiness-compile.ts';
import {deriveActivityExecutionPlan,CONFIG_SOURCE_NAMES} from '../../src/runtime/practice-router/execution-plan.ts';
import {launchDecision} from '../../src/domain/readiness/readiness.ts';
import {effectiveApprovalState} from '../../src/runtime/governance/approvals.ts';
import {buildMasteryView} from '../../src/domain/mastery/view.ts';
import {ContentClient} from '../../src/app/content-client.ts';
import {ReferencePracticeSession} from '../../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../../src/features/practice/ui-model.ts';
import {answerValue} from '../../src/features/practice/form-question.ts';
import {isPracticeResultComplete} from '../../src/runtime/learning-orchestrator/selectors.ts';
import {diskFetch} from '../pilot-status.ts';
import {uiPathCanSucceed} from '../renderer-foundation-readiness.ts';
import {RENDERER_CATALOG} from '../../src/renderers/catalog.ts';
import {releaseEntries} from './release.ts';
import {buildKbReports} from './chemistry-kb.ts';
import {parseReviewRegister,reviewStateOf} from '../../src/domain/chemistry/kb-review.ts';
import {classifyTheoryDepth} from '../../src/domain/theory/structured-theory.ts';
import {collectStructuredTheory,loadSourceRegistry} from './structured-theory.ts';
import {activityBlackSwan} from './model-interaction.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?readJson(root,rel):fallback;
const pct=(n:number,d:number)=>d?Math.round(1000*n/d)/10:0;
const uniq=<T>(xs:T[])=>[...new Set(xs)];

export type PracticeDepth='NONE'|'STATIC_CHECK'|'GUIDED'|'MODEL_BASED';
export type Interaction='NONE'|'FORM'|'SCRIPTED'|'MODEL_INTERACTIVE';
export type TheoryDepth='NONE'|'MINIMAL'|'STRUCTURED';
export type AssessmentDepth='NONE'|'DRAFT'|'REVIEW_PENDING'|'APPROVED';
export type MasteryDepth='UNREACHABLE'|'PARTIAL'|'REACHABLE';
export type GovernanceDepth='UNREVIEWED'|'REVIEW_PENDING'|'APPROVED'|'RELEASED';
export const ORDER={theory:['NONE','MINIMAL','STRUCTURED'],practice:['NONE','STATIC_CHECK','GUIDED','MODEL_BASED'],assessment:['NONE','DRAFT','REVIEW_PENDING','APPROVED'],mastery:['UNREACHABLE','PARTIAL','REACHABLE'],interaction:['NONE','FORM','SCRIPTED','MODEL_INTERACTIVE'],governance:['UNREVIEWED','REVIEW_PENDING','APPROVED','RELEASED']} as const;
/** Normalized 0..1 level of a dimension (documented in PROGRESS_MODEL.md). */
export const level=(dim:keyof typeof ORDER,v:string)=>{ const o=ORDER[dim] as readonly string[]; return (o.indexOf(v))/(o.length-1); };

// ------------------------------------------------------------------ which domain module serves which capability
// Grounded by test: every module named here is imported by the runtime file that serves the capability.
export const CAPABILITY_MODULES:Record<string,{runtimeFile:string;modules:string[]}>={
  'beta2-advanced|electrolysis-experiment':{runtimeFile:'src/runtime/beta2/advanced.ts',modules:['electrolysis-model']},
  'beta2-advanced|hydrolysis-experiment':{runtimeFile:'src/runtime/beta2/advanced.ts',modules:['hydrolysis-model','hydrolysis-trial']},
  'beta2-advanced|manganese-redox-simulation':{runtimeFile:'src/runtime/beta2/advanced.ts',modules:['manganese-redox-model']},
  'beta2-advanced|ionic-equation-trainer':{runtimeFile:'src/runtime/beta2/advanced.ts',modules:['ionic-engine']},
  'beta2-organic|*':{runtimeFile:'src/runtime/beta2/organic.ts',modules:['organic-knowledge']},
  'beta3-advanced|electron-configuration':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['electron-configuration']},
  'beta3-advanced|bounded-choice':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:[]},
  'beta3-advanced|nuclear-conservation':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['nuclear-equation']},
  'beta3-advanced|hydrolysis':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['hydrolysis-model','hydrolysis-trial']},
  'beta3-advanced|reaction-rate':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['kinetics-model']},
  'beta3-advanced|kinetics-factor':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['kinetics-model']},
  'beta3-advanced|equal-rates':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:[]},
  'beta3-advanced|equilibrium-shift':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['equilibrium-model']},
  'beta3-advanced|medium-redox':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['manganese-redox-model']},
  'beta3-advanced|gas-total-moles':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['gas-laws']},
  'beta3-advanced|ideal-gas-pressure':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['gas-laws']},
  'beta3-advanced|molar-normal':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['stoichiometry']},
  'beta3-advanced|faraday-mass':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['faraday-model']},
  'beta3-advanced|electrolysis':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['electrolysis-model']},
  'beta3-advanced|ionic-equation':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['ionic-engine']},
  'beta3-advanced|redox-balance':{runtimeFile:'src/runtime/beta3/advanced.ts',modules:['redox-balancer']},
  'reference-slice|slice.7.12.relative-mass':{runtimeFile:'src/runtime/reference-slices/calculation-adapter.ts',modules:['formula-parser']},
  'reference-slice|slice.7.11.valency-formula':{runtimeFile:'src/runtime/reference-slices/trainer-adapter.ts',modules:['formula-parser']},
  'reference-slice|slice.7.07.atom-builder':{runtimeFile:'src/runtime/reference-slices/simulation-adapter.ts',modules:['atom']},
  'reference-slice|slice.8.16.chloride-precipitation':{runtimeFile:'src/runtime/reference-slices/ionic-practice.ts',modules:['ionic-mixing']},
  'reference-slice|slice.7.03.separation':{runtimeFile:'src/runtime/reference-slices/experiment-adapter.ts',modules:[]},
  'reference-slice|slice.7.18.air-pollution':{runtimeFile:'src/runtime/reference-slices/case-adapter.ts',modules:[]},
};
/** Transitive modules a capability's direct module relies on (reported, not counted as separate exposure). */
const MODULE_DEPENDS:Record<string,string[]>={'ionic-mixing':['reaction-matcher','ionic-engine','species-registry'],'atom':['periodic-table'],'hydrolysis-trial':['hydrolysis-model']};
/** Support modules (types, numerics, governance) — not learner-facing chemistry engines. */
const SUPPORT_MODULES=new Set(['types','rational','quantity','kb-review','condition-vocabulary','ionic-equation','species-registry']);
const MODEL_DATA:Record<string,string>={'reaction-matcher':'reactions.json','ionic-engine':'reactions.json','ionic-mixing':'reactions.json','hydrolysis-model':'hydrolysis.json','hydrolysis-trial':'hydrolysis.json','electrolysis-model':'electrolysis.json','kinetics-model':'kinetics.json','equilibrium-model':'equilibrium.json','manganese-redox-model':'manganese-redox.json','organic-knowledge':'organic.json','species-registry':'species.json'};

export function modulesOf(runtime:string,capability:string,activityId:string,guidedMap:Record<string,unknown>):string[]{
  const direct=CAPABILITY_MODULES[`${runtime}|${capability}`]??CAPABILITY_MODULES[`${runtime}|*`];
  if(direct) return direct.modules;
  if(runtime==='generic'&&capability==='generic.experiment'&&guidedMap[activityId]) return ['reaction-matcher'];
  return [];
}

function modelRecordCount(root:string,module:string):number|null{
  const f=MODEL_DATA[module]; if(!f) return null;
  const d=readOptional(root,`content-src/chemistry/${f}`,null); if(!d) return 0;
  if(Array.isArray(d)) return d.length;
  if(Array.isArray(d.records)) return d.records.length;
  if(Array.isArray(d.molecules)) return d.molecules.length+(d.reactions?.length??0);
  return null;
}

// ------------------------------------------------------------------ can the learner actually succeed?

/** Commands the rendered legacy UI can send, with values from the config or — if the config has none — the value the
 *  engine itself computed and reports as `expected` (the domain model's answer). Never a guessed value. */
async function legacyCanSucceed(model:any):Promise<{verdict:string;detail:string;answerSource:string;wrongInput?:string;tokenAnswer?:string|null}>{
  const ui:any=buildPracticeUiModel(model);
  const c=model.referenceConfig;
  const run=async(commands:any[])=>{ const s=new ReferencePracticeSession(model,{now:()=>'2026-01-01T00:00:00.000Z'}); let r:any; for(const x of commands) r=await s.apply(x); return r; };
  const ok=(r:any)=>Boolean(r)&&isPracticeResultComplete(model.type,r)&&(r.evidence??[]).some((e:any)=>(e.score??0)>0&&e.achieved!==false&&e.correct!==false);
  const expectedOf=(r:any)=>{ if(r?.expected!==undefined) return r.expected; try{ return JSON.parse(r?.serializedState??'{}').expected; }catch{ return undefined; } };
  const coerce=(v:any,t:string)=>t==='number'?Number(v):t==='boolean'?(v===true||v==='true'):String(v);
  let commands:any[]=[];let source='config';
  if(ui.kind==='experiment') commands=ui.controls.map((x:any)=>({kind:'experiment-action',action:{type:x.action}}));
  else if(ui.kind==='simulation') commands=ui.controls.map((x:any)=>({kind:'simulation-action',action:{field:x.field,value:coerce(c.targetState?.[x.field]??c.expected??c.targetMedium??c.expectedMedium??c.initialState?.[x.field]??'',x.valueType)}}));
  else if(ui.kind==='trainer') commands=[{kind:'trainer-answer',answer:String(c.acceptedAnswers?.[0]??c.expectedFormula??'')}];
  else if(ui.kind==='calculation') commands=ui.steps.map((s:any)=>({kind:'calculation-response',response:{stepId:s.id,value:Number((c.steps??[]).find((x:any)=>x.id===s.id)?.value??0),unit:s.unit}}));
  else if(ui.kind==='case') commands=[{kind:'case-submit',value:{evidenceIds:(c.allowedEvidenceIds??[]).slice(0,c.minEvidenceSelections??1),decision:(c.decisionKeywords??[]).join(' '),justification:[...(c.scientificKeywords??[]),...(c.reasoningKeywords??[])].join(' ')}}];
  // P2.1: a closed-domain field is a CHOICE — the learner can only send one of its options, so the solver must find
  // the answer among the rendered choices (a missing option = CANNOT_SUCCEED) and send it the way the form does
  const questionOf=(cmd:any)=>ui.kind==='simulation'?ui.controls.find((x:any)=>x.field===cmd.action?.field)?.question:ui.kind==='trainer'?ui.question:undefined;
  const viaForm=(cmds:any[])=>cmds.map((cmd:any)=>{
    const q=questionOf(cmd); if(q?.input?.kind!=='choice') return cmd;
    const raw=cmd.kind==='trainer-answer'?cmd.answer:cmd.action.value;
    const i=q.input.choices.findIndex((ch:any)=>ch.value===String(raw));
    const value=answerValue(q,String(i));
    return cmd.kind==='trainer-answer'?{...cmd,answer:value===null?'':String(value)}:{...cmd,action:{...cmd.action,value:value??''}};
  });
  commands=viaForm(commands);
  let r:any;
  try{ r=await run(commands); }catch(e:any){ return {verdict:'ERROR',detail:String(e?.message),answerSource:source}; }
  if(!ok(r)){
    const exp=expectedOf(r);
    if(exp!==undefined){
      source='engine-expected';
      if(ui.kind==='simulation') commands=ui.controls.map((x:any)=>({kind:'simulation-action',action:{field:x.field,value:coerce(exp,x.valueType)}}));
      else if(ui.kind==='trainer') commands=[{kind:'trainer-answer',answer:String(exp)}];
      else if(ui.kind==='calculation'&&exp&&typeof exp==='object') commands=[{kind:'calculation-response',response:{stepId:exp.stepId,value:exp.value,unit:exp.unit}}];
      commands=viaForm(commands);
      try{ r=await run(commands); }catch(e:any){ return {verdict:'ERROR',detail:String(e?.message),answerSource:source}; }
    }
  }
  // robustness probe: an answer the learner might plausibly type that is not the expected token must give feedback,
  // not crash the session (a crash is a hidden dead end in the browser)
  let wrongInput='NOT_APPLICABLE';
  if(ui.kind==='simulation'||ui.kind==='trainer'){
    const probe=ui.kind==='simulation'?ui.controls.map((x:any)=>({kind:'simulation-action',action:{field:x.field,value:coerce(x.valueType==='number'?-12345:'noto‘g‘ri-javob',x.valueType)}})):[{kind:'trainer-answer',answer:'noto‘g‘ri-javob'}];
    try{ await run(probe); wrongInput='FEEDBACK'; }catch(e:any){ wrongInput=`THROWS:${String(e?.message).split(':')[0]}`; }
  }
  // the value the learner must TYPE: an ASCII identifier-like token (e.g. "acidic", "forward") in a free-text field
  // means an Uzbek learner has to guess an untranslated code word
  // P2.1: a generic trainer's acceptedAnswers are authored Uzbek LEARNER answers ("asos"/"ishqor"), not internal codes
  const authoredAnswers=ui.kind==='trainer'&&Array.isArray(c.acceptedAnswers);
  const typed=commands.filter((x:any)=>questionOf(x)?.input?.kind!=='choice'&&!(authoredAnswers&&x.kind==='trainer-answer')).map((x:any)=>x.action?.value??x.answer).filter((v:any)=>typeof v==='string');
  const tokenAnswer=typed.find((v:string)=>/^[a-z][a-z_-]{2,}$/.test(v)&&v!=='true'&&v!=='false')??null;
  return {verdict:ok(r)?'CAN_SUCCEED':'CANNOT_SUCCEED',detail:`${ui.kind}: ${commands.length} command(s); complete=${Boolean(r)&&isPracticeResultComplete(model.type,r)}`,answerSource:source,wrongInput,tokenAnswer};
}

// ------------------------------------------------------------------ activity classification

function blackSwanPass(root:string,capability:string,activityId:string):{pass:boolean;evidence:string}{
  // P2.5 (ADR-P2-006): the reaction-mixing renderer is judged PER ACTIVITY — the activity's own shelf must reach ≥2
  // distinct integrity-clean modeled outcomes in the real domain. Binding a new activity to the renderer can never
  // inherit the reference activity's evidence.
  if(capability==='ionic-precipitation'){ const r=activityBlackSwan(root,activityId); return r?{pass:r.pass,evidence:r.evidence}:{pass:false,evidence:'no reagent shelf in the activity config'}; }
  const file={'atom-builder':'reports/reference-renderer-atom.json','hydrolysis-medium':'reports/reference-renderer-hydrolysis.json','ionic-precipitation':'reports/reference-renderer-ionic-precipitation.json'}[capability];
  const r=file?readOptional(root,file,null):null;
  if(!r) return {pass:false,evidence:'no reference-renderer report'};
  const distinct=typeof r.distinctOutcomes==='number'?r.distinctOutcomes:uniq((r.blackSwan?.probes??[]).map((p:any)=>JSON.stringify(p.domain))).length;
  return {pass:r.modelBased===true&&distinct>=2,evidence:`modelBased=${r.modelBased}; distinct modeled outcomes=${distinct}`};
}

/**
 * Practice depth — from what the learner can do, never from the activity name:
 *   MODEL_BASED  registry renderer whose learner choices reach a domain model with ≥2 distinct modeled outcomes (black-swan)
 *   GUIDED       a prescribed multi-step sequence whose steps are grounded in domain state (reaction KB / model)
 *   STATIC_CHECK form answers checked against one expected value (trainer, calculation, case, one-field "simulations")
 *                or a procedural click-through with no domain state
 *   NONE         not routable / not launchable / the learner cannot succeed
 */
export function classifyActivity(input:{uiKind:string;runtime:string;capability:string;registry:boolean;blackSwan:boolean;hardening:string|null;modules:string[];steps:number}):{depth:PracticeDepth;interaction:Interaction;reason:string}{
  if(input.registry) return input.blackSwan?{depth:'MODEL_BASED',interaction:'MODEL_INTERACTIVE',reason:'registry renderer: learner choice → domain model → ≥2 distinct modeled outcomes (black-swan PASS)'}:{depth:'GUIDED',interaction:'SCRIPTED',reason:'registry renderer without black-swan evidence — counted as guided, not model-based'};
  if(input.uiKind==='experiment'){
    const grounded=input.hardening?.startsWith('CHEMISTRY_BASELINED')||input.modules.length>0;
    return grounded&&input.steps>=2
      ?{depth:'GUIDED',interaction:'SCRIPTED',reason:`prescribed ${input.steps}-step sequence grounded in domain state (${input.hardening??input.modules.join(',')}); learner makes no chemical choice`}
      :{depth:'STATIC_CHECK',interaction:'SCRIPTED',reason:`procedural click-through (${input.steps} step(s)) with no domain state${input.hardening?` (${input.hardening})`:''}`};
  }
  const kind=input.uiKind==='simulation'?'one-field form “simulation”':input.uiKind==='trainer'?'single answer':input.uiKind==='calculation'?'numeric step answers':'evidence selection + keyword rubric';
  return {depth:'STATIC_CHECK',interaction:'FORM',reason:`${kind} checked against ${input.modules.length?`a domain-model value (${input.modules.join(',')})`:'a config value'}`};
}

// ------------------------------------------------------------------ localization facts

const ID_LIKE=/^[a-z0-9]+(?:[ -.][a-z0-9]+)*$/;
function uiLabelDebt(model:any){
  const ui:any=model.executionPlan.rendererRequirement?null:buildPracticeUiModel(model);
  if(!ui) return {rawIdLabels:[],englishOnlyLabels:[]};
  const labels:string[]=ui.kind==='experiment'?ui.controls.map((c:any)=>c.label):ui.kind==='simulation'?ui.controls.map((c:any)=>c.label):ui.kind==='calculation'?ui.steps.map((s:any)=>s.label):ui.kind==='case'?ui.evidenceOptions.map((o:any)=>o.label):[];
  // P2.1: in addition to the P2.0 rule, a label that is exactly an id or its mechanical humanization is a raw id
  const ids:string[]=ui.kind==='experiment'?ui.controls.map((c:any)=>c.action):ui.kind==='simulation'?ui.controls.map((c:any)=>c.field):ui.kind==='calculation'?ui.steps.map((s:any)=>s.id):ui.kind==='case'?ui.evidenceOptions.map((o:any)=>o.id):[];
  const derived=new Set(ids.flatMap(id=>[id,id.replaceAll('-',' '),id.replace(/([A-Z])/g,' $1').trim()]));
  const raw=labels.filter(l=>ID_LIKE.test(l)||/\bstep \d+\b|guided step/.test(l)||derived.has(l));
  const english=labels.filter(l=>/^[A-Za-z ]+$/.test(l)&&/\b(the|add|select|record|observe|mix|heat|filter|rate|field|value|step)\b/i.test(l));
  return {rawIdLabels:uniq(raw),englishOnlyLabels:uniq(english),localizationMissing:uniq(ui.localizationMissing??[])};
}

export function hardcodedUzbek(root:string){
  const dirs=['src/features','src/app','src/renderers'];
  const files:string[]=[];
  for(const d of dirs){ const walk=(p:string)=>{ for(const e of fs.readdirSync(path.join(root,p),{withFileTypes:true})){ const rel=`${p}/${e.name}`; if(e.isDirectory()) walk(rel); else if(rel.endsWith('.ts')) files.push(rel); } }; if(fs.existsSync(path.join(root,d))) walk(d); }
  const rows=files.sort().map(f=>{ const s=fs.readFileSync(path.join(root,f),'utf8'); const lits=s.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*?\1/g)??[]; const uz=lits.filter(l=>/[‘’ʻ]|\b(va|uchun|bilan|hozircha|mavzu|faoliyat|javob|tushuncha)\b/.test(l)); return {file:f,uzbekLiterals:uz.length}; }).filter(r=>r.uzbekLiterals>0);
  return {files:rows.length,literals:rows.reduce((n,r)=>n+r.uzbekLiterals,0),byFile:rows};
}

// ------------------------------------------------------------------ the baseline

export async function buildLearningDepth(root:string){
  const src=loadSources(root);
  const {pack}=compileReadiness(src);
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const theories=readJson(root,'content-src/theory-activities.json') as any[];
  const structuredTheories=collectStructuredTheory(root); const sourceRegistry=loadSourceRegistry(root);
  const conceptsRaw=readJson(root,'content-src/concepts.json');
  const concepts=Array.isArray(conceptsRaw)?conceptsRaw:conceptsRaw.concepts??[];
  const guidedMap=readOptional(root,'content-src/chemistry/guided-step-reaction-map.json',{});
  const hardening=new Map((readOptional(root,'reports/guided-lab-hardening.json',{rows:[]}).rows??[]).map((r:any)=>[r.id,r.status]));
  const registryReport=readOptional(root,'reports/renderer-registry.json',{renderers:[]});
  const client=new ContentClient({fetchImpl:diskFetch(root) as any,baseUrl:'/content'});
  const releases=new Map(releaseEntries(root,src).map(e=>[e.activityId,e]));
  const verdicts=itemVerdicts(src);
  const kb=buildKbReports(root);
  const chemReg=parseReviewRegister(kb.kb.register);
  const provenanceDebt=new Set(kb.gate.pending.filter(p=>p.startsWith('SOURCE_NOT_ACCEPTABLE:')).map(p=>p.slice('SOURCE_NOT_ACCEPTABLE:'.length)));
  const pilotIds=new Set(src.pilot.learningUnits.map((u:any)=>u.id));
  const matrix=readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]});

  // ---- activities
  const activities:any[]=[];
  for(const a of [...src.activities].sort((x:any,y:any)=>x.id.localeCompare(y.id))){
    const route=deriveActivityExecutionPlan(a,configs);
    const readiness=pack.activities.find(x=>x.activityId===a.id)!;
    const cfg:any=route.ok?(configs as any)[route.plan.configSource]?.[a.id]:null;
    const learningUnits=uniq(src.mappings.filter((m:any)=>m.practiceActivityId===a.id).map((m:any)=>m.learningUnitId)).sort() as string[];
    const base={activityId:a.id,type:a.type,learningUnits,runtime:route.ok?route.plan.runtime:null,capability:route.ok?route.plan.capability:null,runtimeReadiness:readiness.runtime,content:readiness.content};
    if(!route.ok||!launchDecision(readiness).allowed){
      activities.push({...base,depth:'NONE',interaction:'NONE',reason:route.ok?`not launchable (${readiness.runtime})`:`not routable (${route.error.code})`,canSucceed:'NOT_LAUNCHABLE',modules:[],renderer:{kind:'none',capability:null},accessibility:null,localization:{rawIdLabels:[],englishOnlyLabels:[]}});
      continue;
    }
    const requirement=route.plan.rendererRequirement;
    let model:any;
    try{ model=await client.loadPractice(a.id); }catch(e:any){ activities.push({...base,depth:'NONE',interaction:'NONE',reason:`content path refuses it (${e?.code??e?.message})`,canSucceed:'NOT_LAUNCHABLE',modules:[],renderer:{kind:'none',capability:null},accessibility:null,localization:{rawIdLabels:[],englishOnlyLabels:[]}}); continue; }
    const ui:any=requirement?{kind:'registry'}:buildPracticeUiModel(model);
    const modules=modulesOf(route.plan.runtime,route.plan.capability,a.id,guidedMap);
    const bs=requirement?blackSwanPass(root,requirement.capability,a.id):{pass:false,evidence:''};
    const steps=ui.kind==='experiment'?ui.controls.length:0;
    const cls=classifyActivity({uiKind:ui.kind,runtime:route.plan.runtime,capability:route.plan.capability,registry:Boolean(requirement),blackSwan:bs.pass,hardening:(hardening.get(a.id) as string)??null,modules,steps});
    const success=requirement?{...(await uiPathCanSucceed(client,a.id)),answerSource:'renderer-intents'}:await legacyCanSucceed(model);
    const depth=success.verdict==='CAN_SUCCEED'?cls.depth:'NONE';
    const reg=requirement?(registryReport.renderers??[]).find((r:any)=>r.capability===requirement.capability):null;
    activities.push({...base,depth,interaction:cls.interaction,reason:depth==='NONE'?`learner cannot succeed: ${success.detail}`:cls.reason,classifiedDepth:cls.depth,
      canSucceed:success.verdict,canSucceedDetail:success.detail,answerSource:success.answerSource,wrongInput:(success as any).wrongInput??'NOT_APPLICABLE',expectsUntranslatedToken:(success as any).tokenAnswer??null,
      modules,blackSwan:requirement?bs:null,steps,
      renderer:requirement?{kind:'registry',capability:requirement.capability}:{kind:'legacy',capability:null,uiKind:ui.kind},
      accessibility:reg?{source:'renderer contract',...reg.accessibility}:{source:'legacy UI — not verified',keyboard:'UNKNOWN',screenReader:'UNKNOWN',nonColor:'UNKNOWN',reducedMotion:'UNKNOWN',nonVisualAlternative:'UNKNOWN',declaredProfile:a.accessibilityProfile??[]},
      localization:uiLabelDebt(model),
      hardening:hardening.get(a.id)??null,configKeys:cfg?Object.keys(cfg).sort():[]});
  }
  const byId=new Map(activities.map(x=>[x.activityId,x]));

  // ---- learning units
  const units=src.units.map((u:any)=>{
    const maps=src.mappings.filter((m:any)=>m.learningUnitId===u.id);
    const acts=uniq(maps.map((m:any)=>m.practiceActivityId)).map(id=>byId.get(id)).filter(Boolean) as any[];
    const primary=byId.get(maps.find((m:any)=>m.role==='primary')?.practiceActivityId);
    const theoryIds=uniq(maps.map((m:any)=>m.theoryActivityId).filter(Boolean));
    const theory=theories.find(t=>theoryIds.includes(t.id));
    const blocks=theory?.explanationBlocks??[];
    const text=(t:string)=>blocks.filter((b:any)=>b.type===t).map((b:any)=>String(b.text??'')).join(' ');
    const theoryChecks={
      sectionExists:Boolean(theory),
      conceptExplanation:blocks.some((b:any)=>/explanation|concept-summary/.test(b.type)&&String(b.text??'').length>=300),
      workedExample:blocks.some((b:any)=>/example/.test(b.type)),
      misconception:(theory?.misconceptionCheckIds??[]).length>0||blocks.some((b:any)=>/misconception/.test(b.type)),
      summary:blocks.some((b:any)=>b.type==='summary'),
      conceptSummaryChars:text('concept-summary').length,
      blockTypes:uniq(blocks.map((b:any)=>b.type)).sort(),
    };
    // P2.3: the one depth rule (src/domain/theory/structured-theory.ts): STRUCTURED only for a complete AND sourced,
    // human-authored structured entry. Legacy explanationBlocks alone are MINIMAL whatever their block types say.
    const structuredEntry=theory?structuredTheories.find(c=>c.entry.theoryId===theory.id)?.entry:undefined;
    const theoryDepth:TheoryDepth=classifyTheoryDepth(theory,structuredEntry,sourceRegistry).depth as TheoryDepth;
    const succeeding=acts.filter(x=>x.canSucceed==='CAN_SUCCEED');
    const practice:PracticeDepth=succeeding.reduce((best:PracticeDepth,x:any)=>ORDER.practice.indexOf(x.depth)>ORDER.practice.indexOf(best)?x.depth:best,'NONE' as PracticeDepth);
    const interaction:Interaction=succeeding.reduce((best:Interaction,x:any)=>ORDER.interaction.indexOf(x.interaction)>ORDER.interaction.indexOf(best)?x.interaction:best,'NONE' as Interaction);
    const items=verdicts.filter((v:any)=>v.item.learningUnitId===u.id&&v.verdict.lifecycle!=='RETIRED');
    const approved=items.filter((v:any)=>v.verdict.lifecycle==='APPROVED');
    const unitReadiness=pack.units?.find(x=>x.learningUnitId===u.id);
    const availability=unitReadiness?.assessment.status??'NONE';
    const assessment:AssessmentDepth=!items.length?'NONE':approved.length?'APPROVED':items.some((v:any)=>v.verdict.lifecycle==='REVIEW_PENDING')?'REVIEW_PENDING':'DRAFT';
    const outcomeIds=(u.learningOutcomes??[]).map((_:string,i:number)=>`${u.id}#o${i+1}`);
    const outcomesCovered=uniq(items.flatMap((v:any)=>v.item.outcomeIds??[]));
    const outcomesCoveredApproved=uniq(approved.flatMap((v:any)=>v.item.outcomeIds??[]));
    // mastery: the real rule (buildMasteryView) with the best possible evidence, today's assessment availability
    const best=buildMasteryView({learningUnitId:u.id,conceptIds:u.conceptIds,mastery:u.conceptIds.map((c:string)=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})) as any,countedEvidence:[{id:'e',conceptId:u.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:'2026-01-01T00:00:00.000Z'}] as any,attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:availability as any}).band;
    const blockReasons:string[]=[];
    if(!items.length) blockReasons.push('NO_ASSESSMENT');
    else if(availability!=='AVAILABLE') blockReasons.push('ASSESSMENT_NOT_APPROVED');
    if(!succeeding.length) blockReasons.push('PRACTICE_INCOMPLETE');
    if(!pilotIds.has(u.id)) blockReasons.push('MASTERY_UI_PILOT_ONLY');
    const masteredReachable=best==='MASTERED'&&succeeding.length>0;
    const mastery:MasteryDepth=masteredReachable?'REACHABLE':succeeding.length?'PARTIAL':'UNREACHABLE';
    // governance (human decisions only; runtime availability is NOT a release)
    const rel=primary?releases.get(primary.activityId):undefined;
    const allActApproved=acts.length>0&&acts.every(x=>x.content==='APPROVED');
    const anyDecision=acts.some(x=>x.content!=='REVIEW_PENDING')||items.some((v:any)=>v.verdict.review.chemistry!=='pending'||v.verdict.review.didactic!=='pending');
    const governance:GovernanceDepth=rel?.releaseState==='RELEASED'?'RELEASED':allActApproved&&(assessment==='NONE'||assessment==='APPROVED')?'APPROVED':anyDecision?'REVIEW_PENDING':'UNREVIEWED';
    const actIds=new Set(acts.map(x=>x.activityId));
    const chem=kb.assertions.filter(x=>x.affectedActivities.some(id=>actIds.has(id)));
    const row=(matrix.rows??[]).find((r:any)=>r.learningUnitId===u.id);
    return {
      learningUnitId:u.id,grade:u.grade,topic:u.title,chapter:u.chapter??null,conceptIds:u.conceptIds,outcomeIds,
      theory:{id:theory?.id??null,depth:theoryDepth,checks:theoryChecks},
      practiceActivities:maps.map((m:any)=>({activityId:m.practiceActivityId,role:m.role,depth:byId.get(m.practiceActivityId)?.depth??'NONE',interaction:byId.get(m.practiceActivityId)?.interaction??'NONE',canSucceed:byId.get(m.practiceActivityId)?.canSucceed??'UNKNOWN'})).sort((x:any,y:any)=>x.role.localeCompare(y.role)||x.activityId.localeCompare(y.activityId)),
      assessmentItems:items.map((v:any)=>v.item.id),
      assessment:{depth:assessment,items:items.length,approved:approved.length,outcomes:outcomeIds.length,outcomesCovered:outcomesCovered.length,outcomesCoveredApproved:outcomesCoveredApproved.length,cognitiveDemand:items.length?'UNRECORDED':null,runtimeAvailable:availability==='AVAILABLE',availability},
      rendererRequirements:uniq(acts.map(x=>x.renderer?.capability).filter(Boolean)).sort(),
      runtimeReadiness:{primary:primary?.runtimeReadiness??null,activities:acts.length,ready:acts.filter(x=>x.runtimeReadiness==='READY').length,canSucceed:succeeding.length},
      contentReview:{activitiesApproved:acts.filter(x=>x.content==='APPROVED').length,activities:acts.length,theory:theory?.lifecycleStatus??null},
      releaseState:{primary:rel?.releaseState??'DECISION_MISSING',runtimeAvailable:primary?.runtimeReadiness==='READY',note:'runtime availability (grandfathered lifecycle) is not a human release'},
      masteryReachable:masteredReachable,
      mastery:{depth:mastery,bestBand:best,blockReasons},
      dimensions:{theory:theoryDepth,practice,assessment,mastery,interaction,governance},
      governance:{
        chemistryDependencies:{total:chem.length,approved:chem.filter(x=>reviewStateOf(x,chemReg.records).state==='approved').length},
        assessmentReviews:{items:items.length,chemistryApproved:items.filter((v:any)=>v.verdict.review.chemistry==='approved').length,didacticApproved:items.filter((v:any)=>v.verdict.review.didactic==='approved').length},
        activityReview:primary?.content??null,
        releaseDecision:rel?.releaseState??'DECISION_MISSING',
        pilotSignoff:pilotIds.has(u.id)?(row?.signoff??'NONE'):'NOT_A_PILOT',
      },
      provenanceDebt:{assertionsWithoutAcceptableSource:chem.filter(x=>provenanceDebt.has(x.id)).length,category:'PROVENANCE_DEBT — sources to cite, not missing learning content'},
    };
  });

  // ---- engines
  const moduleFiles=fs.readdirSync(path.join(root,'src/domain/chemistry')).filter(f=>f.endsWith('.ts')).map(f=>f.replace(/\.ts$/,'')).sort();
  const engines=moduleFiles.filter(m=>!SUPPORT_MODULES.has(m)).map(m=>{
    const direct=activities.filter(x=>x.modules?.includes(m));
    const viaDeps=activities.filter(x=>!x.modules?.includes(m)&&x.modules?.some((d:string)=>(MODULE_DEPENDS[d]??[]).includes(m)));
    const users=[...direct,...viaDeps];
    return {module:m,file:`src/domain/chemistry/${m}.ts`,modelRecords:modelRecordCount(root,m),
      usedByActivities:users.length,usedByLearningUnits:uniq(users.flatMap(x=>x.learningUnits)).length,
      browserExposed:users.some(x=>x.canSucceed==='CAN_SUCCEED'),
      rendererExposed:users.some(x=>x.renderer?.kind==='registry'),
      exposedAs:uniq(users.map(x=>x.interaction)).sort(),
      status:!users.length?'UNUSED':users.every(x=>x.interaction!=='MODEL_INTERACTIVE')?'FORM_OR_SCRIPT_ONLY':'MODEL_INTERACTIVE'};
  });

  // ---- renderers
  const renderer={
    registryRendered:activities.filter(x=>x.renderer?.kind==='registry').length,
    legacyRendered:activities.filter(x=>x.renderer?.kind==='legacy').length,
    noRendererRequired:0,
    rendererMissingOrUnlaunchable:activities.filter(x=>x.renderer?.kind==='none').length,
    modelBasedRenderers:RENDERER_CATALOG.map(c=>{ const xs=activities.filter(x=>x.renderer?.capability===c.id&&x.depth==='MODEL_BASED'); return {capability:c.id,activities:xs.map(x=>x.activityId),learningUnits:uniq(xs.flatMap(x=>x.learningUnits)).sort()}; }),
    nextCandidates:(()=>{
      const groups=new Map<string,any[]>();
      for(const x of activities.filter(x=>x.renderer?.kind==='legacy')) for(const m of (x.modules.length?x.modules:['(no domain model)'])) groups.set(m,[...(groups.get(m)??[]),x]);
      return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([m,xs])=>{
        const records=modelRecordCount(root,m);
        const capability=RENDERER_CATALOG.find(c=>(c.id==='hydrolysis-medium'&&m.startsWith('hydrolysis'))||(c.id==='ionic-precipitation'&&['reaction-matcher','ionic-engine','ionic-mixing'].includes(m))||(c.id==='atom-builder'&&m==='atom'))?.id??null;
        const choice=m==='(no domain model)'?false:records===null?'computed model (inputs are learner-choosable parameters)':records>=2;
        return {module:m,existingDomainModel:m!=='(no domain model)',modelRecords:records,realLearnerChoicePossible:choice,currentUiExposesModel:false,currentBrowserLimitation:uniq(xs.map(x=>x.interaction)).join('/'),
          rendererReuse:capability,affectedActivities:xs.map(x=>x.activityId),affectedLearningUnits:uniq(xs.flatMap(x=>x.learningUnits)).sort(),
          knownBlocker:m==='electrolysis-model'?'1 modeled record — black-swan FAIL (P1.7/P1.8)':records!==null&&records<2?'fewer than 2 modeled records':m==='(no domain model)'?'no domain model to expose':null};
      });
    })(),
  };

  // ---- labs (experiments) + external
  const labs=activities.filter(x=>x.type==='experiment');
  const labClass=(x:any)=>x.canSucceed==='CANNOT_SUCCEED'||x.canSucceed==='ERROR'?'broken':x.depth==='MODEL_BASED'?'model-based':x.depth==='GUIDED'?'guided':x.depth==='STATIC_CHECK'?'static':'not-launchable';
  const external=readOptional(root,'content-src/external-lab-bindings.json',[]);
  const labsReport={
    total:labs.length,byClass:Object.fromEntries(['model-based','guided','static','broken','not-launchable'].map(k=>[k,labs.filter(x=>labClass(x)===k).length])),
    pendingReview:labs.filter(x=>x.content!=='APPROVED').length,
    canSucceed:labs.filter(x=>x.canSucceed==='CAN_SUCCEED').length,cannotSucceed:labs.filter(x=>x.canSucceed==='CANNOT_SUCCEED'||x.canSucceed==='ERROR').length,notLaunchable:labs.filter(x=>x.canSucceed==='NOT_LAUNCHABLE').length,
    rows:labs.map(x=>({activityId:x.activityId,class:labClass(x),canSucceed:x.canSucceed,hardening:x.hardening,content:x.content})),
    external:{bindings:Array.isArray(external)?external.length:0,placements:(Array.isArray(external)?external:[]).reduce((n:number,b:any)=>n+(b.learningUnitIds?.length??0),0),depth:'UNKNOWN — provider-hosted, no evidence (evidencePolicy none); local assessment required'},
  };

  // ---- accessibility
  const launchable=activities.filter(x=>x.canSucceed!=='NOT_LAUNCHABLE');
  const a11y=Object.fromEntries(['keyboard','screenReaderSummary','nonColorCues','reducedMotion','nonVisualAlternative'].map(k=>[k,{verified:launchable.filter(x=>x.accessibility?.source==='renderer contract'&&x.accessibility[k]&&x.accessibility[k]!=='UNKNOWN').length,unknown:launchable.filter(x=>x.accessibility?.source!=='renderer contract').length}]));

  // ---- localization
  const localeDirs=fs.existsSync(path.join(root,'content-src/locales'))?fs.readdirSync(path.join(root,'content-src/locales')).sort():[];
  const targets=['uz-Latn','uz-Cyrl','ru'];
  const localization={
    targets,
    contentLanguage:'uz-Latn (all learning units, theory and activities are authored in Uzbek Latin; no per-locale content packs exist)',
    catalogs:Object.fromEntries(targets.map(t=>[t,localeDirs.includes(t.toLowerCase())?fs.readdirSync(path.join(root,'content-src/locales',t.toLowerCase())).filter(f=>f.endsWith('.json')).sort():[]])),
    learningUnitTitles:Object.fromEntries(targets.map(t=>[t,t==='uz-Latn'?units.length:0])),
    rawIdLabels:{activities:activities.filter(x=>x.localization?.rawIdLabels?.length).length,examples:activities.filter(x=>x.localization?.rawIdLabels?.length).slice(0,5).map(x=>({activityId:x.activityId,labels:x.localization.rawIdLabels.slice(0,3)}))},
    untranslatedAnswerTokens:{activities:activities.filter(x=>x.expectsUntranslatedToken).length,examples:activities.filter(x=>x.expectsUntranslatedToken).slice(0,8).map(x=>({activityId:x.activityId,expected:x.expectsUntranslatedToken}))},
    englishOnlyLabels:{activities:activities.filter(x=>x.localization?.englishOnlyLabels?.length).length,examples:activities.filter(x=>x.localization?.englishOnlyLabels?.length).slice(0,5).map(x=>({activityId:x.activityId,labels:x.localization.englishOnlyLabels.slice(0,3)}))},
    hardcodedUzbekUi:hardcodedUzbek(root),
  };

  return {activities,units,engines,renderer,labs:labsReport,accessibility:a11y,localization,chemistry:{assertions:kb.assertions.length,approved:kb.assertions.filter(x=>reviewStateOf(x,chemReg.records).state==='approved').length,provenanceDebt:provenanceDebt.size}};
}

export {pct,uniq};
