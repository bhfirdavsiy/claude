// P2.10 — kimyolab.topic-lab-profile.v1 (ADR-P2-011).
//
// A topic lab profile says WHAT a learner may do in one topic's laboratory: the instruction it comes from, the
// apparatus, containers and substances, which action families are allowed, the parameter limits, the procedure
// (order) rules, what can be observed, when the lab is complete, how guidance works and the safety rules.
//
// It is NOT chemistry truth. It never says what a reaction produces: outcomes come only from the chemistry
// authorities named in `chemistry` (ReactionMatcher/IonicEngine via evaluateIonicMixing, ElectrolysisModel, …),
// and an outcome they do not model is UNSUPPORTED_CHEMISTRY.
//
// Derive, don't duplicate: the authored overlay (content-src/topic-lab-profiles.json) holds only what the
// repository does not already state. compileTopicLabProfile() takes the instruction steps, safety text, source refs,
// learning units, activity/config versions, reagent shelf, target reaction, electrolysis query and declared step
// dependencies from the existing content and config.
import {classifyInstructionStep,LAB_ACTION_FAMILIES,type InstructionOperation,type LabActionFamily} from './action-catalog.ts';

export const TOPIC_LAB_PROFILE_SCHEMA='kimyolab.topic-lab-profile.v1';
export const TOPIC_LAB_PROFILE_PACK_PATH='topic-lab-profiles.json';
export const TOPIC_LAB_PROFILE_PACK_SCHEMA='kimyolab.topic-lab-profiles.v1';

/** Where a profile fact comes from. `legacyContent.steps[i]` etc. are the instruction; `config` the activity config. */
export type ProfileSource=string;

export type OrderMode='STRICT'|'FLEXIBLE'|'DEPENDENCY_GRAPH'|'HUMAN_DECISION_REQUIRED';
export const ORDER_MODES:readonly OrderMode[]=['STRICT','FLEXIBLE','DEPENDENCY_GRAPH','HUMAN_DECISION_REQUIRED'];
export type GuidanceLevel=1|2|3|4;

export interface ProfileApparatus { id:string; kind:string; labelKey:string; source:ProfileSource; isContainer:boolean }
export interface ProfileSubstance {
  id:string;
  /** SpeciesRegistry id when the substance is a registered species; null for a mixture or an undeclared sample */
  speciesId:string|null;
  labelKey:string;
  role:'reagent'|'solvent'|'sample';
  source:ProfileSource;
  /** parts of a sample the instruction does not identify (e.g. the impurity of contaminated salt) */
  undeclaredParts:Array<{id:string;description:string;source:ProfileSource;insoluble:boolean|null}>;
  /** the solute part of a sample that the chemistry authority can evaluate (dissolution) */
  soluteSpeciesId:string|null;
}
export interface ProfileQuantityLimit { substanceId:string; value:number; unit:string; source:ProfileSource }
export interface ProcedureStep {
  id:string;
  family:LabActionFamily;
  /** the action's parameters that identify this step (e.g. {substance:'water'}) */
  match:Record<string,string>;
  dependencies:string[];
  required:boolean;
  instructionStep:number|null;
  source:ProfileSource;
}
export interface HumanDecision { question:string; packet:string|null; options:string[]; selected:null }
export interface ObservationTarget {
  id:string;
  labelKey:string;
  /** the authority that produces it — never the profile itself */
  producedBy:'ReactionMatcher'|'ElectrolysisModel'|'INSTRUCTION_TEXT';
  /** for INSTRUCTION_TEXT: the instruction sentence the observation is taken from */
  source:ProfileSource;
  /** the observation kind as stated by the source (gas, precipitate, state-change) */
  kind:string;
  kindSource:ProfileSource;
}
export type CompletionGoal=
  | {kind:'all-required-steps'}
  | {kind:'ionic-target';targetReactionId:string}
  | {kind:'observations';targets:string[]};
export type ChemistryBinding=
  | {authority:'ionic-mixing';reagentShelf:string[];targetReactionId:string;source:ProfileSource;maxSolutionsPerContainer:2}
  | {authority:'electrolysis';query:{electrolyte:string;phase:'aq'|'l';electrode:'inert'|'active'};electrolyteSubstanceId:string;source:ProfileSource}
  | {authority:'dissolution';solventSubstanceId:string;source:ProfileSource};

export interface TopicLabProfile {
  schema:typeof TOPIC_LAB_PROFILE_SCHEMA;
  profileId:string;
  activityId:string;
  activityVersion:string;
  learningUnitIds:string[];
  configSource:string;
  configVersion:string;
  /** fixed: the profile never carries chemistry truth */
  chemistryTruth:false;
  instruction:{
    source:'legacyContent';
    title:string;
    goal:string;
    equipmentText:string;
    materialsText:string;
    safetyText:string;
    steps:Array<{index:number;text:string;operations:InstructionOperation[]}>;
    sourceRefs:Array<{id:string;title:string}>;
    groundedSteps:number[];
  };
  apparatus:ProfileApparatus[];
  substances:ProfileSubstance[];
  initialState:{setUp:string[];contents:Record<string,string[]>};
  allowedFamilies:LabActionFamily[];
  /** apparatus kinds a family needs in THIS topic when the instruction names them (overrides the catalog default) */
  familyApparatus:Partial<Record<LabActionFamily,{kinds:string[];source:ProfileSource}>>;
  limits:{quantities:ProfileQuantityLimit[];electrodes:Array<'inert'|'active'>};
  procedure:{mode:OrderMode;steps:ProcedureStep[];humanDecision:HumanDecision|null;orderSource:ProfileSource};
  observationTargets:ObservationTarget[];
  completionGoal:CompletionGoal;
  guidance:{levels:GuidanceLevel[];defaultLevel:GuidanceLevel;revealsFinalAnswer:false};
  safety:{virtualOnly:true;notes:Array<{text:string;source:ProfileSource}>;forbiddenFamilies:LabActionFamily[]};
  chemistry:ChemistryBinding;
  gaps:Array<{code:string;detail:string}>;
}

const FAMILIES=new Set(LAB_ACTION_FAMILIES.map(d=>d.family));
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(text);

/** Every reason a profile breaks the v1 contract (empty = valid). Fail closed: a profile with problems is refused. */
export function topicLabProfileProblems(raw:unknown):string[]{
  const p=raw as TopicLabProfile, out:string[]=[];
  if(!p||typeof p!=='object') return ['PROFILE_NOT_OBJECT'];
  if(p.schema!==TOPIC_LAB_PROFILE_SCHEMA) out.push('SCHEMA');
  for(const k of ['profileId','activityId','activityVersion','configSource','configVersion'] as const) if(!text(p[k])) out.push(`FIELD:${k}`);
  if(p.chemistryTruth!==false) out.push('CHEMISTRY_TRUTH_MUST_BE_FALSE');
  if(!strings(p.learningUnitIds)||!p.learningUnitIds.length) out.push('LEARNING_UNITS');
  if(!p.instruction||p.instruction.source!=='legacyContent'||!Array.isArray(p.instruction.steps)) out.push('INSTRUCTION');
  const apparatus=new Set((p.apparatus??[]).map(a=>a.id));
  const containers=new Set((p.apparatus??[]).filter(a=>a.isContainer).map(a=>a.id));
  const substances=new Set((p.substances??[]).map(s=>s.id));
  for(const a of p.apparatus??[]) if(!text(a.id)||!text(a.kind)||!text(a.labelKey)||!text(a.source)) out.push(`APPARATUS:${String(a?.id)}`);
  for(const s of p.substances??[]) if(!text(s.id)||!text(s.labelKey)||!text(s.source)||!['reagent','solvent','sample'].includes(s.role)||!Array.isArray(s.undeclaredParts)) out.push(`SUBSTANCE:${String(s?.id)}`);
  if(!Array.isArray(p.allowedFamilies)||!p.allowedFamilies.length) out.push('ALLOWED_FAMILIES');
  for(const f of p.allowedFamilies??[]) if(!FAMILIES.has(f)) out.push(`FAMILY_UNKNOWN:${f}`);
  for(const f of p.safety?.forbiddenFamilies??[]) if((p.allowedFamilies??[]).includes(f)) out.push(`FAMILY_ALLOWED_AND_FORBIDDEN:${f}`);
  if(p.safety?.virtualOnly!==true) out.push('SAFETY_VIRTUAL_ONLY');
  const kinds=new Set((p.apparatus??[]).map(a=>a.kind));
  for(const [f,rule] of Object.entries(p.familyApparatus??{})){ if(!FAMILIES.has(f as LabActionFamily)) out.push(`FAMILY_APPARATUS_UNKNOWN:${f}`); for(const k of rule?.kinds??[]) if(!kinds.has(k)) out.push(`FAMILY_APPARATUS_KIND_MISSING:${f}:${k}`); if(!text(rule?.source)) out.push(`FAMILY_APPARATUS_SOURCE:${f}`); }
  for(const id of p.initialState?.setUp??[]) if(!apparatus.has(id)) out.push(`INITIAL_SETUP_UNKNOWN:${id}`);
  for(const [c,list] of Object.entries(p.initialState?.contents??{})){ if(!containers.has(c)) out.push(`INITIAL_CONTAINER_UNKNOWN:${c}`); for(const s of list) if(!substances.has(s)) out.push(`INITIAL_SUBSTANCE_UNKNOWN:${s}`); }
  for(const q of p.limits?.quantities??[]) if(!substances.has(q.substanceId)||!(q.value>0)||!text(q.unit)||!text(q.source)) out.push(`LIMIT:${String(q?.substanceId)}`);
  if(!ORDER_MODES.includes(p.procedure?.mode)) out.push('ORDER_MODE');
  const stepIds=new Set((p.procedure?.steps??[]).map(s=>s.id));
  for(const s of p.procedure?.steps??[]){
    if(!text(s.id)||!FAMILIES.has(s.family)||!strings(s.dependencies)) out.push(`STEP:${String(s?.id)}`);
    if(!(p.allowedFamilies??[]).includes(s.family)) out.push(`STEP_FAMILY_NOT_ALLOWED:${s.id}`);
    for(const d of s.dependencies??[]) if(!stepIds.has(d)) out.push(`STEP_DEPENDENCY_UNKNOWN:${s.id}->${d}`);
  }
  // dependencies only where the mode declares them: an unordered (human-decision/flexible) profile carries none
  if((p.procedure?.mode==='HUMAN_DECISION_REQUIRED'||p.procedure?.mode==='FLEXIBLE')&&(p.procedure.steps??[]).some(s=>s.dependencies.length)) out.push('ORDER_DEPENDENCIES_WITHOUT_DECLARED_ORDER');
  if(p.procedure?.mode==='HUMAN_DECISION_REQUIRED'){
    const d=p.procedure.humanDecision;
    if(!d||!text(d.question)||d.selected!==null) out.push('HUMAN_DECISION_PRESELECTED_OR_MISSING');
  }
  if(p.procedure?.mode==='STRICT'&&hasCycle(p.procedure.steps??[])) out.push('ORDER_CYCLE');
  if(p.procedure?.mode&&p.procedure.mode!=='HUMAN_DECISION_REQUIRED'&&!text(p.procedure.orderSource)) out.push('ORDER_SOURCE');
  for(const t of p.observationTargets??[]) if(!text(t.id)||!['ReactionMatcher','ElectrolysisModel','INSTRUCTION_TEXT'].includes(t.producedBy)||!text(t.source)) out.push(`OBSERVATION_TARGET:${String(t?.id)}`);
  const g=p.guidance;
  if(!g||!Array.isArray(g.levels)||!g.levels.includes(g.defaultLevel)||g.revealsFinalAnswer!==false) out.push('GUIDANCE');
  if(!p.completionGoal||!['all-required-steps','ionic-target','observations'].includes(p.completionGoal.kind)) out.push('COMPLETION_GOAL');
  if(p.completionGoal?.kind==='observations') for(const t of p.completionGoal.targets) if(!(p.observationTargets??[]).some(o=>o.id===t)) out.push(`COMPLETION_TARGET_UNKNOWN:${t}`);
  const c=p.chemistry as ChemistryBinding|undefined;
  if(!c||!['ionic-mixing','electrolysis','dissolution'].includes(c.authority)) out.push('CHEMISTRY_BINDING');
  return out;
}

function hasCycle(steps:ProcedureStep[]){
  const deps=new Map(steps.map(s=>[s.id,s.dependencies]));
  const state=new Map<string,number>();
  const visit=(id:string):boolean=>{ const st=state.get(id); if(st===1) return true; if(st===2) return false; state.set(id,1); const c=(deps.get(id)??[]).some(visit); state.set(id,2); return c; };
  return steps.some(s=>visit(s.id));
}

export function assertTopicLabProfile(raw:unknown):TopicLabProfile{
  const problems=topicLabProfileProblems(raw);
  if(problems.length) throw new Error(`TOPIC_LAB_PROFILE_INVALID:${problems.join(',')}`);
  return raw as TopicLabProfile;
}

/** The authored part of a profile (content-src/topic-lab-profiles.json). */
export interface TopicLabProfileOverlay {
  profileId:string;
  activityId:string;
  groundedSteps:number[];
  apparatus:ProfileApparatus[];
  substances:Array<Omit<ProfileSubstance,'speciesId'|'soluteSpeciesId'|'undeclaredParts'>&{speciesId?:string|null;soluteSpeciesId?:string|null;undeclaredParts?:ProfileSubstance['undeclaredParts']}>;
  /** 'config.reagentShelf' derives one substance per shelf species */
  substancesFrom?:'config.reagentShelf';
  initialState:{setUp:string[];contents:Record<string,string[]>};
  allowedFamilies:LabActionFamily[];
  familyApparatus?:Partial<Record<LabActionFamily,{kinds:string[];source:ProfileSource}>>;
  limits:{quantities:ProfileQuantityLimit[]};
  procedure:{mode:OrderMode;orderSource:ProfileSource;stepMap?:Record<string,{family:LabActionFamily;match:Record<string,string>;instructionStep:number|null}>;steps?:Array<Omit<ProcedureStep,'dependencies'>&{dependencies?:string[]}>;humanDecision?:{question:string;options:string[]}|null};
  observationTargets:ObservationTarget[];
  completionGoal:{kind:'all-required-steps'}|{kind:'ionic-target'}|{kind:'observations';targets:string[]};
  guidance:{levels:GuidanceLevel[];defaultLevel:GuidanceLevel};
  safety:{notes:Array<{text:string;source:ProfileSource}>;forbiddenFamilies:LabActionFamily[]};
  chemistry:{authority:'ionic-mixing'}|{authority:'electrolysis';electrolyteSubstanceId:string}|{authority:'dissolution';solventSubstanceId:string};
  gaps:Array<{code:string;detail:string}>;
}

export interface ProfileSources {
  activity:{id:string;version:string;title:string;goal:string;sourceRefs?:Array<{id:string;title:string}>;legacyContent?:{equipment?:string;materials?:string;safety?:string;steps?:string[]}};
  config:any;
  configSource:string;
  learningUnitIds:string[];
  /** P2.9 decision packets (activityId → packet path) for order questions that are still open */
  orderDecisionPackets:Record<string,string>;
  species:{byId(id:string):unknown};
}

/** overlay + repository facts → a full v1 profile. Throws on any contradiction (fail closed). */
export function compileTopicLabProfile(overlay:TopicLabProfileOverlay,src:ProfileSources):TopicLabProfile{
  const {activity,config}=src;
  if(overlay.activityId!==activity.id) throw new Error(`TOPIC_LAB_PROFILE_ACTIVITY_MISMATCH:${overlay.profileId}`);
  const legacy=activity.legacyContent??{};
  const steps=(legacy.steps??[]).map((t,index)=>({index,text:t,operations:classifyInstructionStep(t)}));
  const substances:ProfileSubstance[]=overlay.substances.map(s=>({speciesId:null,soluteSpeciesId:null,undeclaredParts:[],...s} as ProfileSubstance));
  if(overlay.substancesFrom==='config.reagentShelf'){
    if(!Array.isArray(config.reagentShelf)) throw new Error(`TOPIC_LAB_PROFILE_SHELF_MISSING:${overlay.profileId}`);
    for(const speciesId of config.reagentShelf as string[]) substances.push({id:speciesId.replace(/^species\./,''),speciesId,labelKey:`${speciesId}.name`,role:'reagent',source:'config.reagentShelf',undeclaredParts:[],soluteSpeciesId:null});
  }
  for(const s of substances){
    if(s.speciesId&&!src.species.byId(s.speciesId)) throw new Error(`TOPIC_LAB_PROFILE_SPECIES_UNKNOWN:${s.speciesId}`);
    if(s.soluteSpeciesId&&!src.species.byId(s.soluteSpeciesId)) throw new Error(`TOPIC_LAB_PROFILE_SPECIES_UNKNOWN:${s.soluteSpeciesId}`);
  }
  // procedure: declared dependencies come from the config (reference slice scenario); never from array position
  let procedureSteps:ProcedureStep[]=[];
  if(overlay.procedure.stepMap){
    const declared=config?.scenario?.steps;
    if(!Array.isArray(declared)||declared.some((s:any)=>!Array.isArray(s.dependencies))) throw new Error(`TOPIC_LAB_PROFILE_DEPENDENCIES_NOT_DECLARED:${overlay.profileId}`);
    procedureSteps=declared.map((s:any)=>{
      const m=overlay.procedure.stepMap![s.actionType];
      if(!m) throw new Error(`TOPIC_LAB_PROFILE_STEP_UNMAPPED:${s.actionType}`);
      return {id:s.id,family:m.family,match:{...m.match},dependencies:[...s.dependencies],required:s.mode==='required',instructionStep:m.instructionStep,source:`config.scenario.steps[${s.id}]`};
    });
  }else{
    procedureSteps=(overlay.procedure.steps??[]).map(s=>({...s,dependencies:[...(s.dependencies??[])]}));
  }
  const packet=src.orderDecisionPackets[activity.id]??null;
  const humanDecision=overlay.procedure.mode==='HUMAN_DECISION_REQUIRED'?{question:overlay.procedure.humanDecision?.question??'',packet,options:[...(overlay.procedure.humanDecision?.options??[])],selected:null as null}:null;
  let chemistry:ChemistryBinding;
  if(overlay.chemistry.authority==='ionic-mixing'){
    if(!Array.isArray(config.reagentShelf)||!text(config.reactionId)) throw new Error(`TOPIC_LAB_PROFILE_IONIC_CONFIG:${overlay.profileId}`);
    chemistry={authority:'ionic-mixing',reagentShelf:[...config.reagentShelf],targetReactionId:config.reactionId,source:`config(${src.configSource})`,maxSolutionsPerContainer:2};
  }else if(overlay.chemistry.authority==='electrolysis'){
    if(!config.query||!text(config.query.electrolyte)) throw new Error(`TOPIC_LAB_PROFILE_ELECTROLYSIS_CONFIG:${overlay.profileId}`);
    chemistry={authority:'electrolysis',query:{...config.query},electrolyteSubstanceId:overlay.chemistry.electrolyteSubstanceId,source:`config(${src.configSource}).query`};
  }else{
    chemistry={authority:'dissolution',solventSubstanceId:overlay.chemistry.solventSubstanceId,source:'IonicEngine.dissociate (chemistry/solubility.json)'};
  }
  const completionGoal:CompletionGoal=overlay.completionGoal.kind==='ionic-target'
    ?{kind:'ionic-target',targetReactionId:(chemistry as any).targetReactionId}
    :overlay.completionGoal.kind==='observations'?{kind:'observations',targets:[...overlay.completionGoal.targets]}:{kind:'all-required-steps'};
  const safetyNotes=[...(legacy.safety?[{text:legacy.safety,source:'legacyContent.safety'}]:[]),...(Array.isArray(config.safetyNotes)?config.safetyNotes.map((t:string)=>({text:t,source:'config.safetyNotes'})):[]),...overlay.safety.notes];
  const profile:TopicLabProfile={
    schema:TOPIC_LAB_PROFILE_SCHEMA,
    profileId:overlay.profileId,
    activityId:activity.id,
    activityVersion:activity.version,
    learningUnitIds:[...src.learningUnitIds],
    configSource:src.configSource,
    configVersion:String(config.version),
    chemistryTruth:false,
    instruction:{source:'legacyContent',title:activity.title,goal:activity.goal,equipmentText:legacy.equipment??'',materialsText:legacy.materials??'',safetyText:legacy.safety??'',steps,sourceRefs:(activity.sourceRefs??[]).map(r=>({id:r.id,title:r.title})),groundedSteps:[...overlay.groundedSteps]},
    apparatus:overlay.apparatus.map(a=>({...a})),
    substances,
    initialState:{setUp:[...overlay.initialState.setUp],contents:Object.fromEntries(Object.entries(overlay.initialState.contents).map(([k,v])=>[k,[...v]]))},
    allowedFamilies:[...overlay.allowedFamilies],
    familyApparatus:Object.fromEntries(Object.entries(overlay.familyApparatus??{}).map(([k,v])=>[k,{kinds:[...v!.kinds],source:v!.source}])),
    limits:{quantities:overlay.limits.quantities.map(q=>({...q})),electrodes:chemistry.authority==='electrolysis'?[chemistry.query.electrode]:[]},
    procedure:{mode:overlay.procedure.mode,steps:procedureSteps,humanDecision,orderSource:overlay.procedure.orderSource},
    observationTargets:overlay.observationTargets.map(t=>({...t})),
    completionGoal,
    guidance:{levels:[...overlay.guidance.levels],defaultLevel:overlay.guidance.defaultLevel,revealsFinalAnswer:false},
    safety:{virtualOnly:true,notes:safetyNotes,forbiddenFamilies:[...overlay.safety.forbiddenFamilies]},
    chemistry,
    gaps:overlay.gaps.map(g=>({...g})),
  };
  return assertTopicLabProfile(profile);
}
