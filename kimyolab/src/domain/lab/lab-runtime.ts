// P2.10 — the guided dynamic lab runtime (ADR-P2-011).
//
//   applyLabAction(state, action, topicProfile) → {nextState, chemistryEvents, observations, procedural,
//                                                  guidance, evidenceCandidate, unsupported, error}
//
// The runtime ORCHESTRATES the existing chemistry authorities; it never decides an outcome itself:
//   ionic-mixing  → evaluateIonicMixing (ReactionMatcher + IonicEngine + SpeciesRegistry), recomputed from the
//                   accumulated engine actions, so the lab state never duplicates engine truth;
//   electrolysis  → ElectrolysisModel.resolve(query);
//   dissolution   → IonicEngine.dissociate(formula) (the solubility data), plus the instruction's own sentences
//                   for the purely procedural observations (filtrate, crystals) — marked INSTRUCTION_TEXT.
// Anything the authority does not model is UNSUPPORTED_CHEMISTRY: no observation is invented, nothing is shown as
// happening. Rejections happen HERE, at the domain boundary — hiding a button is never the only guard.
//
// The state is plain JSON, every transition is a pure function of (state, action, profile, domain), and only
// accepted actions enter `actionLog`, so replay(profile, log) reproduces the state exactly and RESET is simply the
// profile's initial state (no reverse chemistry).
import {evaluateIonicMixing,type IonicAction,type IonicDomain,type IonicMixingState} from '../chemistry/ionic-mixing.ts';
import type {ElectrolysisModel} from '../chemistry/electrolysis-model.ts';
import type {IonicEngine} from '../chemistry/ionic-engine.ts';
import type {SpeciesRegistry} from '../chemistry/species-registry.ts';
import type {Observation} from '../chemistry/types.ts';
import {classifyMatch,type ReactionMatcher} from '../chemistry/reaction-matcher.ts';
import {familyDefinition,LAB_ACTION_FAMILIES,type LabActionFamily} from './action-catalog.ts';
import type {GuidanceLevel,InstructionTrial,ProcedureStep,ProfileHeating,TopicLabProfile} from './topic-lab-profile.ts';

export const LAB_STATE_SCHEMA='kimyolab.lab-state.v1';

export interface LabAction { family:LabActionFamily|string; params?:Record<string,string|number> }

export interface ContentEntry {
  substanceId:string;
  speciesId:string|null;
  /** aq / s / l / g, or null when no authority states it */
  phase:string|null;
  form:'liquid'|'solution'|'solid-sample'|'dissolved'|'suspended-solid'|'crystals'|'solid'|'gas';
  amount:{value:number;unit:string}|null;
  /** the authority or instruction sentence that put this entry into this form */
  source:string;
}
export interface ContainerState {
  id:string;
  contents:ContentEntry[];
  /** physical phases present (derived from contents) */
  phases:string[];
  /** not modeled by any authority in these labs: kept explicit instead of a guessed value */
  temperature:{modeled:false}|{modeled:true;state:'room'|'heated'};
  pH:{modeled:false};
  precipitates:Array<{reactionId:string;source:'ReactionMatcher'}>;
  /** gases an authority produced here (ElectrolysisModel at an electrode, ReactionMatcher from a record), or collected */
  gases:Array<{product:string;electrode?:'anode'|'cathode';reactionId?:string;source:'ElectrolysisModel'|'ReactionMatcher';collected?:boolean;collectedFrom?:string}>;
  deposits:Array<{product:string;electrode:'anode'|'cathode';source:'ElectrolysisModel'}>;
  /** ionic-mixing: the solutions in this container, in order (at most two are modeled) */
  solutions:string[];
  mixed:null|{outcome:'reaction'|'no-reaction'|'not-modeled';reactionId:string|null;coverageCode:string|null};
  /** P2.11: heating stated by the procedure (HEAT/STOP_HEAT); null = not heated. A condition for ReactionMatcher, not a
   *  measured temperature (there is no thermal model) */
  heating:null|ProfileHeating['level'];
  /** P2.11: SEAL (procedure fact) */
  sealed:boolean;
  /** P2.11 reaction-matcher: every evaluated pair of learner-added substances and the authority's answer, with the
   *  conditions it was evaluated under (a not-modeled pair is re-evaluated only when the conditions change) */
  reactions:Array<{pair:string;outcome:'reaction'|'no-reaction'|'not-modeled';reactionId:string|null;code:string|null;conditions:string}>;
}
export interface LabObservation {
  id:string;
  target:string;
  container:string|null;
  kind:string;
  /** the observation data exactly as the authority returned it (never rewritten) */
  data:Observation|Record<string,unknown>|null;
  producedBy:'ReactionMatcher'|'ElectrolysisModel'|'IonicEngine'|'INSTRUCTION_TEXT'|'PROCEDURE';
  /** derived from producedBy (observationGrounding): MODEL_BASED only for a chemistry authority */
  grounding:ObservationGrounding;
  source:string;
}
/** P2.10 closeout — the black-swan line: only an observation that a chemistry authority computed or looked up is
 *  MODEL_BASED. An instruction sentence (INSTRUCTION_TEXT) or a procedural fact (PROCEDURE) is never model chemistry,
 *  in a report, in a count or in the learner's "Nega?" source line. */
export type ObservationGrounding='MODEL_BASED'|'INSTRUCTION_TEXT'|'PROCEDURE';
const MODEL_AUTHORITIES:ReadonlySet<LabObservation['producedBy']>=new Set(['ReactionMatcher','ElectrolysisModel','IonicEngine']);
export function observationGrounding(o:Pick<LabObservation,'producedBy'>):ObservationGrounding{
  return MODEL_AUTHORITIES.has(o.producedBy)?'MODEL_BASED':o.producedBy==='INSTRUCTION_TEXT'?'INSTRUCTION_TEXT':'PROCEDURE';
}

export interface LabState {
  schema:typeof LAB_STATE_SCHEMA;
  profileId:string;
  setUp:string[];
  containers:Record<string,ContainerState>;
  connections:Array<{kind:'electric';container:string}>;
  current:{on:boolean;container:string|null};
  observations:LabObservation[];
  observedTargets:string[];
  completedSteps:string[];
  actionLog:LabAction[];
  engine:{ionicActions:IonicAction[]};
  complete:boolean;
}

export type LabErrorCode=
  |'ACTION_UNKNOWN'|'ACTION_NOT_ALLOWED_IN_TOPIC'|'UNSAFE_ACTION'|'PARAMETER_INVALID'|'APPARATUS_NOT_SET_UP'
  |'STATE_PRECONDITION_UNMET'|'PROCEDURE_BLOCKED'|'QUANTITY_LIMIT'|'PROFILE_MISMATCH'
  /** P2.11 closeout: the family is in the topic, but the instruction does not state it for THIS trial / combination */
  |'ACTION_NOT_IN_INSTRUCTION_SCOPE';
export type GuidanceCategory='recommended'|'possible'|'unavailable'|'unsupported'|'procedural-dependency';

export interface LabActionResult {
  status:'accepted'|'rejected'|'unsupported';
  nextState:LabState;
  chemistryEvents:Array<{type:string;authority:string;detail:Record<string,unknown>}>;
  observations:LabObservation[];
  procedural:{completedStep:string|null;blockedBy:string[];reason:string|null};
  guidance:{category:GuidanceCategory;code:string};
  evidenceCandidate:null|{kind:'observation'|'answer'|'completion';id:string;persisted:false;detail:Record<string,unknown>};
  unsupported:null|{code:UnsupportedCode;detail:string};
  error:null|{code:LabErrorCode;detail:string};
}

export interface LabDomain {
  species:SpeciesRegistry;
  ionicEngine:IonicEngine;
  /** present when the profile's authority is ionic-mixing */
  ionic?:IonicDomain;
  /** present when the profile's authority is electrolysis */
  electrolysis?:ElectrolysisModel;
  /** P2.11: the general reaction authority (reaction-matcher topics) */
  matcher?:ReactionMatcher;
}

/** P2.11 — what each implemented handler IS and which authorities it may consult. The capability registry reads this
 *  (it is declared once, next to the handlers); a test keeps it equal to the catalog's domainHandler flags. */
export type HandlerType='PROCEDURE'|'CHEMISTRY'|'OBSERVATION'|'CHECKER';
/** `requiresProfileAuthority`: the handler has a chemical consequence only under that profile authority; under any other
 *  it fails closed (UNSUPPORTED_CHEMISTRY) — and the coverage report keeps such an experiment BLOCKED. */
export const HANDLER_SEMANTICS:Readonly<Partial<Record<LabActionFamily,{type:HandlerType;authorities:string[];requiresProfileAuthority?:'reaction-matcher'}>>>=Object.freeze({
  SETUP_APPARATUS:{type:'PROCEDURE',authorities:[]},
  ADD_SUBSTANCE:{type:'CHEMISTRY',authorities:['ReactionMatcher','IonicEngine','ElectrolysisModel']},
  MIX:{type:'CHEMISTRY',authorities:['ReactionMatcher','IonicEngine']},
  HEAT:{type:'CHEMISTRY',authorities:['ReactionMatcher'],requiresProfileAuthority:'reaction-matcher'},
  PASS_GAS:{type:'CHEMISTRY',authorities:['ReactionMatcher'],requiresProfileAuthority:'reaction-matcher'},
  ELECTRIC_CURRENT:{type:'CHEMISTRY',authorities:['ElectrolysisModel']},
  STOP_HEAT:{type:'PROCEDURE',authorities:[]},
  TRANSFER:{type:'PROCEDURE',authorities:['ReactionMatcher']},
  COLLECT_GAS:{type:'PROCEDURE',authorities:[]},
  SEAL:{type:'PROCEDURE',authorities:[]},
  WAIT:{type:'PROCEDURE',authorities:[]},
  FILTER:{type:'PROCEDURE',authorities:['INSTRUCTION_TEXT']},
  EVAPORATE:{type:'PROCEDURE',authorities:['INSTRUCTION_TEXT']},
  WASH:{type:'PROCEDURE',authorities:[]},
  OBSERVE:{type:'OBSERVATION',authorities:['ReactionMatcher','ElectrolysisModel','IonicEngine','INSTRUCTION_TEXT']},
  RECORD:{type:'CHECKER',authorities:['IonicEngine']},
});

const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));

function emptyContainer(id:string):ContainerState{
  return {id,contents:[],phases:[],temperature:{modeled:false},pH:{modeled:false},precipitates:[],gases:[],deposits:[],solutions:[],mixed:null,heating:null,sealed:false,reactions:[]};
}

/** RESET: the profile's initial state. Deterministic; nothing is "undone" chemically. */
export function createLabState(profile:TopicLabProfile):LabState{
  const containers:Record<string,ContainerState>={};
  for(const a of profile.apparatus) if(a.isContainer) containers[a.id]=emptyContainer(a.id);
  const state:LabState={schema:LAB_STATE_SCHEMA,profileId:profile.profileId,setUp:[...profile.initialState.setUp],containers,connections:[],current:{on:false,container:null},observations:[],observedTargets:[],completedSteps:[],actionLog:[],engine:{ionicActions:[]},complete:false};
  for(const [c,list] of Object.entries(profile.initialState.contents)) for(const s of list){ const sub=profile.substances.find(x=>x.id===s)!; state.containers[c]!.contents.push({substanceId:s,speciesId:sub.speciesId,phase:null,form:'liquid',amount:null,source:'profile.initialState'}); }
  return state;
}

const paramText=(a:LabAction,k:string)=>typeof a.params?.[k]==='string'?String(a.params[k]):null;
const matches=(step:ProcedureStep,action:LabAction)=>step.family===action.family&&Object.entries(step.match).every(([k,v])=>String(action.params?.[k]??'')===v);
// ---- P2.11 closeout: instruction scope (fixed trials) ------------------------------------------------------------
/** the profile substances a learner put into a container (products and passed gases are not instruction substances) */
function addedSet(state:LabState,profile:TopicLabProfile,container:string|null):string[]{
  const c=container?state.containers[container]:undefined;
  if(!c) return [];
  return [...new Set(c.contents.filter(e=>profile.substances.some(s=>s.id===e.substanceId)&&!e.source.startsWith('ReactionMatcher')&&!e.source.startsWith('PASS_GAS')).map(e=>e.substanceId))].sort();
}
/** the container an action's scope is judged on: COLLECT_GAS → its gas source (`from`, or the only source) */
function scopeContainer(state:LabState,action:LabAction):string|null{
  if(action.family==='COLLECT_GAS'){ const from=paramText(action,'from'); if(from) return from; const src=gasSources(state,paramText(action,'container')??''); return src.length===1?src[0]!:null; }
  if(action.family==='TRANSFER'||action.family==='PASS_GAS') return paramText(action,'from');
  return paramText(action,'container');
}
/** the instruction trials an action belongs to. With no trials (the topic itself is the scope) → null. */
function trialsForAction(state:LabState,action:LabAction,profile:TopicLabProfile):InstructionTrial[]|null{
  const trials=profile.procedure.trials;
  if(!trials?.length) return null;
  const family=action.family as LabActionFamily;
  let set=addedSet(state,profile,scopeContainer(state,action));
  if(family==='ADD_SUBSTANCE'){ const sub=paramText(action,'substance'); if(sub) set=[...new Set([...set,sub])].sort(); }
  if(family==='TRANSFER') set=[...new Set([...set,...addedSet(state,profile,paramText(action,'to'))])].sort();
  const consistent=trials.filter(t=>set.every(x=>t.substances.includes(x)));
  // ADD: the resulting combination must be one trial's; a container action: EVERY trial its contents can still belong to
  // must state the family (an empty container cannot tell its trial yet → the state preconditions decide)
  if(family==='ADD_SUBSTANCE'||family==='TRANSFER') return consistent.filter(t=>t.families.includes(family));
  if(!set.length) return trials.filter(t=>t.families.includes(family));
  return consistent.length&&consistent.every(t=>t.families.includes(family))?consistent:[];
}
function scopePrecheck(state:LabState,action:LabAction,profile:TopicLabProfile):Precheck|null{
  const t=trialsForAction(state,action,profile);
  if(t===null||t.length) return null;
  return {category:'unavailable',code:'ACTION_NOT_IN_INSTRUCTION_SCOPE',detail:action.family==='ADD_SUBSTANCE'||action.family==='TRANSFER'?'COMBINATION_NOT_IN_INSTRUCTION':'NOT_STATED_FOR_THIS_TRIAL'};
}
/** the procedure step an action completes; a trial-bound step only for an action inside that trial */
const stepFor=(profile:TopicLabProfile,action:LabAction,state:LabState)=>profile.procedure.steps.find(s=>{
  if(!matches(s,action)) return false;
  if(!s.trial) return true;
  const t=trialsForAction(state,action,profile);
  return t!==null&&t.some(x=>x.id===s.trial);
});
const ORDERED=(p:TopicLabProfile)=>p.procedure.mode==='STRICT'||p.procedure.mode==='DEPENDENCY_GRAPH';

function phasesOf(c:ContainerState){
  const set=new Set<string>();
  for(const e of c.contents){ if(e.form==='liquid'||e.form==='solution'||e.form==='dissolved') set.add('liquid'); else set.add('solid'); }
  if(c.precipitates.length) set.add('solid');
  if(c.gases.length) set.add('gas');
  return [...set].sort();
}

/** UNSUPPORTED_CHEMISTRY: the authority does not model it · ACTION_UNSUPPORTED: no handler for a state/observation action ·
 *  LEARNER_RESPONSE_CHECKER_MISSING: a learner response with no checker (never judged, never "missing chemistry") */
export type UnsupportedCode='UNSUPPORTED_CHEMISTRY'|'ACTION_UNSUPPORTED'|'LEARNER_RESPONSE_CHECKER_MISSING';
const UNSUPPORTED_CODES:ReadonlySet<string>=new Set<UnsupportedCode>(['UNSUPPORTED_CHEMISTRY','ACTION_UNSUPPORTED','LEARNER_RESPONSE_CHECKER_MISSING']);
interface Precheck { category:GuidanceCategory; code:LabErrorCode|UnsupportedCode; detail:string; blockedBy?:string[] }

/** The ONE place that decides whether an action may run in this state (used by apply AND by availability). */
export function precheckLabAction(state:LabState,action:LabAction,profile:TopicLabProfile,opts:{learnerTextPending?:boolean}={}):Precheck|null{
  const definition=familyDefinition(action.family as LabActionFamily);
  if(!definition) return {category:'unavailable',code:'ACTION_UNKNOWN',detail:String(action.family)};
  if(profile.safety.forbiddenFamilies.includes(definition.family)) return {category:'unavailable',code:'UNSAFE_ACTION',detail:definition.family};
  if(!profile.allowedFamilies.includes(definition.family)) return {category:'unavailable',code:'ACTION_NOT_ALLOWED_IN_TOPIC',detail:definition.family};
  if(!definition.domainHandler) return definition.kind==='LEARNER_RESPONSE'
    ?{category:'unsupported',code:'LEARNER_RESPONSE_CHECKER_MISSING',detail:`no checker for ${definition.family}`}
    :{category:'unsupported',code:'ACTION_UNSUPPORTED',detail:`no domain handler for ${definition.family}`};
  // typed parameters: every value must come from the profile
  for(const param of definition.parameters){
    const v=action.params?.[param.name];
    if(param.valuesFrom==='learner-text'&&opts.learnerTextPending) continue;   // availability: the text is typed in step 3
    if(v===undefined||v===''){ if(param.required) return {category:'unavailable',code:'PARAMETER_INVALID',detail:`${param.name} missing`}; continue; }
    const ok=param.valuesFrom==='profile.apparatus'?profile.apparatus.some(a=>a.id===v)
      :param.valuesFrom==='profile.containers'?profile.apparatus.some(a=>a.isContainer&&a.id===v)
      :param.valuesFrom==='profile.substances'?profile.substances.some(s=>s.id===v)
      :param.valuesFrom==='profile.observationTargets'?profile.observationTargets.some(t=>t.id===v)
      :param.valuesFrom==='profile.limits'?typeof v==='number'&&v>0
      :typeof v==='string';
    if(!ok) return {category:'unavailable',code:'PARAMETER_INVALID',detail:`${param.name}=${String(v)}`};
  }
  // P2.11 closeout: the instruction's own trials bound the action (a fixed trial is never turned into a sandbox)
  const scope=scopePrecheck(state,action,profile);
  if(scope) return scope;
  // declared order (STRICT / DEPENDENCY_GRAPH only): the step's declared dependencies must be complete
  const step=stepFor(profile,action,state);
  if(step&&ORDERED(profile)&&!state.completedSteps.includes(step.id)){
    const open=step.dependencies.filter(d=>!state.completedSteps.includes(d));
    if(open.length) return {category:'procedural-dependency',code:'PROCEDURE_BLOCKED',detail:'STEP_DEPENDENCY_UNMET',blockedBy:open};
  }
  return statePrecondition(state,action,profile);
}

const isSetUp=(state:LabState,id:string)=>state.setUp.includes(id);
const apparatusOfKind=(profile:TopicLabProfile,kind:string)=>profile.apparatus.filter(a=>a.kind===kind).map(a=>a.id);
function needKinds(state:LabState,profile:TopicLabProfile,kinds:string[]):Precheck|null{
  for(const kind of kinds){
    const ids=apparatusOfKind(profile,kind);
    if(!ids.length) return {category:'unavailable',code:'APPARATUS_NOT_SET_UP',detail:`${kind} not in this topic`};
    if(!ids.some(id=>isSetUp(state,id))) return {category:'unavailable',code:'APPARATUS_NOT_SET_UP',detail:kind};
  }
  return null;
}

function statePrecondition(state:LabState,action:LabAction,profile:TopicLabProfile):Precheck|null{
  const container=paramText(action,'container'), c=container?state.containers[container]:undefined;
  const chem=profile.chemistry;
  // apparatus: the topic's own rule (instruction-sourced) or the catalog default
  const family=action.family as LabActionFamily;
  const kinds=(profile.familyApparatus[family]?.kinds??familyDefinition(family)!.apparatusRequirements).filter(k=>k!=='container');
  const missing=needKinds(state,profile,kinds); if(missing) return missing;
  switch(action.family){
    case 'SETUP_APPARATUS':{
      const id=paramText(action,'apparatus')!;
      if(isSetUp(state,id)) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_SET_UP'};
      return null;
    }
    case 'ADD_SUBSTANCE':{
      if(!c||!isSetUp(state,container!)) return {category:'unavailable',code:'APPARATUS_NOT_SET_UP',detail:String(container)};
      const sub=paramText(action,'substance')!;
      const limit=profile.limits.quantities.find(q=>q.substanceId===sub);
      const quantity=typeof action.params?.quantity==='number'?action.params.quantity:null;
      if(limit&&quantity!==null&&quantity>limit.value) return {category:'unavailable',code:'QUANTITY_LIMIT',detail:`${sub} ≤ ${limit.value} ${limit.unit}`};
      if(limit&&c.contents.some(e=>e.substanceId===sub)) return {category:'unavailable',code:'QUANTITY_LIMIT',detail:`${sub}: ${limit.value} ${limit.unit} already added`};
      if(!limit&&quantity!==null) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'no quantity is declared for this substance'};
      if(chem.authority==='ionic-mixing'){
        if(!chem.reagentShelf.includes(profile.substances.find(s=>s.id===sub)?.speciesId??'')) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'not on the reagent shelf'};
        if(c.mixed) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'CONTAINER_ALREADY_MIXED'};
        if(c.solutions.length>=chem.maxSolutionsPerContainer&&!c.solutions.includes(sub)) return {category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:'MIXTURE_OF_MORE_THAN_TWO_SOLUTIONS_NOT_MODELED'};
      }
      if(chem.authority==='electrolysis'&&sub!==chem.electrolyteSubstanceId) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'not the electrolyte of this cell'};
      if(chem.authority==='electrolysis'&&profile.apparatus.find(a=>a.id===container)?.kind!=='electrolysis-cell') return {category:'unavailable',code:'PARAMETER_INVALID',detail:'electrolyte goes into the electrolysis cell'};
      return null;
    }
    case 'MIX':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(chem.authority==='ionic-mixing'){
        if(c.mixed) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_MIXED'};
        if(c.solutions.length<2) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'MIX_NEEDS_TWO_SOLUTIONS'};
        return null;
      }
      const hasSolvent=c.contents.some(e=>e.form==='liquid');
      const hasSample=c.contents.some(e=>e.form==='solid-sample');
      if(!hasSolvent||!hasSample) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'MIX_NEEDS_SOLVENT_AND_SAMPLE'};
      return null;
    }
    case 'FILTER':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      // FILTER only once an insoluble solid is present (a suspension or a precipitate)
      if(!c.contents.some(e=>e.form==='suspended-solid')&&!c.precipitates.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_INSOLUBLE_SOLID'};
      return null;
    }
    case 'EVAPORATE':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(!c.contents.some(e=>e.form==='dissolved')||c.contents.some(e=>e.form==='suspended-solid')) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NEEDS_CLEAR_SOLUTION'};
      return null;
    }
    case 'ELECTRIC_CURRENT':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(state.current.on) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'CURRENT_ALREADY_ON'};
      if(chem.authority!=='electrolysis'||!c.contents.some(e=>e.substanceId===chem.electrolyteSubstanceId)) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_ELECTROLYTE'};
      return null;
    }
    case 'OBSERVE':{
      const target=paramText(action,'target')!;
      if(state.observedTargets.includes(target)) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_OBSERVED'};
      return null;
    }
    case 'RECORD':{
      if(chem.authority!=='ionic-mixing') return {category:'unsupported',code:'LEARNER_RESPONSE_CHECKER_MISSING',detail:'no checker for this record'};
      if(!c||c.mixed?.outcome!=='reaction') return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_OBSERVED_REACTION'};
      return null;
    }
    case 'WASH':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(!c.contents.length&&!c.solutions.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_EMPTY'};
      return null;
    }
    case 'HEAT':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      // heating has a chemical consequence only where a condition-aware authority evaluates it; elsewhere fail closed
      if(chem.authority!==HANDLER_SEMANTICS.HEAT!.requiresProfileAuthority) return {category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:'HEATING_NOT_ORCHESTRATED'};
      if(!c.contents.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'CONTAINER_EMPTY'};
      if(c.heating) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_HEATED'};
      return null;
    }
    case 'STOP_HEAT':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(!c.heating) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NOT_HEATED'};
      return null;
    }
    case 'SEAL':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(c.sealed) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'ALREADY_SEALED'};
      return null;
    }
    case 'TRANSFER':
    case 'PASS_GAS':{
      const from=paramText(action,'from')!, to=paramText(action,'to')!;
      if(from===to) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'SAME_CONTAINER'};
      const f=state.containers[from]!, t=state.containers[to]!;
      if(action.family==='TRANSFER') return f.contents.length?null:{category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'SOURCE_EMPTY'};
      if(chem.authority!==HANDLER_SEMANTICS.PASS_GAS!.requiresProfileAuthority) return {category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:'GAS_REACTION_NOT_ORCHESTRATED'};
      if(!f.gases.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_GAS_IN_SOURCE'};
      if(!t.contents.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'TARGET_EMPTY'};
      return null;
    }
    case 'COLLECT_GAS':{
      if(!c) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'container'};
      if(profile.apparatus.find(a=>a.id===container)?.kind!=='gas-collection-vessel') return {category:'unavailable',code:'PARAMETER_INVALID',detail:'NOT_A_GAS_COLLECTION_VESSEL'};
      const sources=gasSources(state,container!);
      const from=paramText(action,'from');
      if(!sources.length) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_GAS_TO_COLLECT'};
      if(from&&!sources.includes(from)) return {category:'unavailable',code:'STATE_PRECONDITION_UNMET',detail:'NO_GAS_IN_SOURCE'};
      if(!from&&sources.length>1) return {category:'unavailable',code:'PARAMETER_INVALID',detail:'GAS_SOURCE_REQUIRED'};
      return null;
    }
  }
  return null;
}

/** containers (other than `except`) holding a gas an authority produced and that is not yet collected */
export function gasSources(state:LabState,except:string):string[]{
  return Object.values(state.containers).filter(x=>x.id!==except&&x.gases.some(g=>!g.collected&&!g.collectedFrom)).map(x=>x.id).sort();
}

function ionicState(domain:LabDomain,profile:TopicLabProfile,actions:IonicAction[]):IonicMixingState{
  if(profile.chemistry.authority!=='ionic-mixing'||!domain.ionic) throw new Error('LAB_DOMAIN_MISSING:ionic');
  return evaluateIonicMixing(domain.ionic,{shelf:profile.chemistry.reagentShelf,targetReactionId:profile.chemistry.targetReactionId,actions});
}

const FORM_BY_PHASE:Readonly<Record<string,ContentEntry['form']>>={s:'solid',aq:'solution',l:'liquid',g:'gas'};

/** P2.11 reaction-matcher: the ACTUAL conditions of a container, in condition-vocabulary dimensions. Heating comes from
 *  the procedure; an acid concentration only when the instruction declares it for a substance present (conflicting
 *  declarations → unstated). Nothing else is assumed: an unstated dimension never satisfies a record's requirement. */
function actualConditions(c:ContainerState,profile:TopicLabProfile):Record<string,string>{
  const dims:Record<string,string>={temperature:c.heating??'room',ignition:'absent'};
  const declared=new Map<string,Set<string>>();
  for(const e of c.contents){ const sub=profile.substances.find(x=>x.id===e.substanceId); for(const d of sub?.declaredConditions??[]){ if(!declared.has(d.dimension)) declared.set(d.dimension,new Set()); declared.get(d.dimension)!.add(d.value); } }
  for(const [dim,values] of declared) if(values.size===1) dims[dim]=[...values][0]!;
  return dims;
}

/** P2.11 reaction-matcher: evaluate every pair of learner-added substances in a container under its actual conditions.
 *  Products are recorded (with the record that produced them) but never re-evaluated — no invented reaction chains.
 *  Returns what this evaluation changed. */
function reactInContainer(c:ContainerState,profile:TopicLabProfile,domain:LabDomain,observe:(o:Omit<LabObservation,'id'|'grounding'>)=>void){
  if(!domain.matcher) throw new Error('LAB_DOMAIN_MISSING:matcher');
  const dims=actualConditions(c,profile);
  const condKey=JSON.stringify(Object.entries(dims).sort());
  const reagents=[...new Map(c.contents.filter(e=>e.speciesId&&!e.source.startsWith('ReactionMatcher')).map(e=>[(domain.species.byId(e.speciesId!) as any)?.formula as string,e])).keys()].filter(Boolean).sort();
  const events:LabActionResult['chemistryEvents']=[]; let modeled=0; const notModeled:string[]=[];
  for(let i=0;i<reagents.length;i++) for(let j=i+1;j<reagents.length;j++){
    const pair=`${reagents[i]}+${reagents[j]}`;
    const prior=c.reactions.find(r=>r.pair===pair);
    if(prior&&(prior.outcome!=='not-modeled'||prior.conditions===condKey)) continue;
    const m=domain.matcher.match({reactants:[{formula:reagents[i]!},{formula:reagents[j]!}],conditions:{dimensions:{...dims}},conditionPolicy:'require-record-conditions'});
    const entry=m.modeled
      ?{pair,outcome:(classifyMatch(m)==='MODELED_NO_REACTION'?'no-reaction':'reaction') as 'reaction'|'no-reaction',reactionId:m.reaction.id,code:null,conditions:condKey}
      :{pair,outcome:'not-modeled' as const,reactionId:null,code:m.code,conditions:condKey};
    c.reactions=[...c.reactions.filter(r=>r.pair!==pair),entry];
    events.push({type:'reaction',authority:'ReactionMatcher',detail:{pair,conditions:dims,outcome:entry.outcome,reactionId:entry.reactionId,code:entry.code}});
    if(!m.modeled){ notModeled.push(m.code); continue; }
    modeled++;
    const r=m.reaction, source=`chemistry/reactions.json#${r.id}`;
    if(entry.outcome==='no-reaction'){ observe({target:'reaction',container:c.id,kind:'no-reaction',data:null,producedBy:'ReactionMatcher',source}); continue; }
    const gasObserved=(r.observations??[]).some(o=>o.type==='gas');
    for(const prod of r.products){
      const sp=domain.species.byFormula(prod.formula)[0] as any;
      const phase=prod.phase??sp?.phase??null;
      // a gas is a product the record says is evolved (observation type gas) AND whose species is gaseous
      if(gasObserved&&phase==='g'){ if(!c.gases.some(g=>g.product===prod.formula&&g.reactionId===r.id)) c.gases.push({product:prod.formula,reactionId:r.id,source:'ReactionMatcher'}); continue; }
      if(!c.contents.some(e=>e.source===`ReactionMatcher:${r.id}`&&e.speciesId===(sp?.id??null)&&e.substanceId===prod.formula)) c.contents.push({substanceId:prod.formula,speciesId:sp?.id??null,phase,form:phase?FORM_BY_PHASE[phase]??'solid':'solid',amount:null,source:`ReactionMatcher:${r.id}`});
    }
    for(const o of r.observations??[]){ if(o.type==='precipitate') c.precipitates.push({reactionId:r.id,source:'ReactionMatcher'}); observe({target:'reaction',container:c.id,kind:o.type,data:clone(o),producedBy:'ReactionMatcher',source}); }
  }
  return {events,modeled,notModeled,evaluated:events.length};
}

function isComplete(state:LabState,profile:TopicLabProfile,domain:LabDomain):boolean{
  const g=profile.completionGoal;
  if(g.kind==='reactions'){
    const done=new Set(Object.values(state.containers).flatMap(c=>c.reactions.filter(r=>r.outcome==='reaction').map(r=>r.reactionId)));
    const collected=Object.values(state.containers).some(c=>c.gases.some(x=>x.collectedFrom));
    return g.reactionIds.every(id=>done.has(id))&&(!g.gasCollected||collected);
  }
  if(g.kind==='all-required-steps') return profile.procedure.steps.filter(s=>s.required).every(s=>state.completedSteps.includes(s.id));
  if(g.kind==='observations') return g.targets.every(t=>state.observedTargets.includes(t));
  return ionicState(domain,profile,state.engine.ionicActions).achieved;
}

const instructionSentence=(profile:TopicLabProfile,target:string)=>profile.observationTargets.find(t=>t.id===target);

/** Bind the chemistry authorities once; the returned functions are pure over (state, action, profile). */
export function createLabRuntime(domain:LabDomain){
  function reject(state:LabState,pre:Precheck):LabActionResult{
    const unsupported=UNSUPPORTED_CODES.has(pre.code);
    return {status:unsupported?'unsupported':'rejected',nextState:clone(state),chemistryEvents:[],observations:[],procedural:{completedStep:null,blockedBy:pre.blockedBy??[],reason:pre.code==='PROCEDURE_BLOCKED'?pre.detail:null},
      guidance:{category:pre.category,code:pre.code==='PROCEDURE_BLOCKED'?'STEP_DEPENDENCY_UNMET':pre.detail},evidenceCandidate:null,
      unsupported:unsupported?{code:pre.code as UnsupportedCode,detail:pre.detail}:null,
      error:unsupported?null:{code:pre.code as LabErrorCode,detail:pre.detail}};
  }

  function applyLabAction(state:LabState,action:LabAction,profile:TopicLabProfile):LabActionResult{
    if(state.profileId!==profile.profileId) return reject(state,{category:'unavailable',code:'PROFILE_MISMATCH',detail:`${state.profileId} != ${profile.profileId}`});
    const pre=precheckLabAction(state,action,profile);
    if(pre) return reject(state,pre);
    // the step is identified on the state BEFORE the action (e.g. the gas source before it is collected)
    const step=stepFor(profile,action,state);
    const next=clone(state);
    const events:LabActionResult['chemistryEvents']=[];
    const observations:LabObservation[]=[];
    let evidence:LabActionResult['evidenceCandidate']=null;
    const container=paramText(action,'container');
    const c=container?next.containers[container]:undefined;
    const chem=profile.chemistry;
    const observe=(o:Omit<LabObservation,'id'|'grounding'>)=>{ const ob:LabObservation={...o,grounding:observationGrounding(o),id:`obs.${next.observations.length+observations.length+1}`}; observations.push(ob); };
    // P2.11 reaction-matcher: the container whose contents or conditions this action changed (evaluated after the switch)
    let contact:ContainerState|null=null;
    let procedureCode:string|null=null;

    switch(action.family){
      case 'SETUP_APPARATUS': next.setUp.push(paramText(action,'apparatus')!); break;
      case 'ADD_SUBSTANCE':{
        const subId=paramText(action,'substance')!, sub=profile.substances.find(s=>s.id===subId)!;
        const limit=profile.limits.quantities.find(q=>q.substanceId===subId);
        const amount=limit?{value:typeof action.params?.quantity==='number'?action.params.quantity:limit.value,unit:limit.unit}:null;
        if(chem.authority==='ionic-mixing'){
          if(!c!.solutions.includes(subId)) c!.solutions.push(subId);
          if(!c!.contents.some(e=>e.substanceId===subId)) c!.contents.push({substanceId:subId,speciesId:sub.speciesId,phase:'aq',form:'solution',amount,source:'IonicEngine.dissociate (shelf validated by resolveShelf)'});
        }else if(chem.authority==='reaction-matcher'){
          // the substance enters with its registered phase; the authority then evaluates every new pair under the
          // container's actual conditions (no reaction is decided here)
          const species=sub.speciesId?domain.species.byId(sub.speciesId) as any:null;
          const phase=species?.phase??null;
          if(!c!.contents.some(e=>e.substanceId===subId)) c!.contents.push({substanceId:subId,speciesId:sub.speciesId,phase,form:phase?FORM_BY_PHASE[phase]??'solid':'solid',amount,source:sub.source});
          contact=c!;
        }else if(sub.role==='sample'){
          c!.contents.push({substanceId:subId,speciesId:sub.speciesId,phase:null,form:'solid-sample',amount,source:sub.source});
        }else if(chem.authority==='electrolysis'){
          c!.contents.push({substanceId:subId,speciesId:sub.speciesId,phase:chem.query.phase,form:'solution',amount,source:chem.source});
        }else{
          const species=sub.speciesId?domain.species.byId(sub.speciesId) as any:null;
          c!.contents.push({substanceId:subId,speciesId:sub.speciesId,phase:species?.phase??null,form:'liquid',amount,source:sub.source});
        }
        break;
      }
      case 'MIX':{
        if(chem.authority==='ionic-mixing'){
          const [a,b]=c!.solutions;
          const ia:IonicAction[]=[{type:'selectReagent',payload:{slot:'A',speciesId:profile.substances.find(s=>s.id===a)!.speciesId!}},{type:'selectReagent',payload:{slot:'B',speciesId:profile.substances.find(s=>s.id===b)!.speciesId!}},{type:'mix'}];
          next.engine.ionicActions.push(...ia);
          const engine=ionicState(domain,profile,next.engine.ionicActions);
          const mix=engine.current;
          if(!mix) throw new Error('LAB_IONIC_MIX_MISSING');
          c!.mixed={outcome:mix.outcome,reactionId:mix.reactionId,coverageCode:mix.coverageCode};
          events.push({type:'mix',authority:'evaluateIonicMixing',detail:{outcome:mix.outcome,reactionId:mix.reactionId,coverageCode:mix.coverageCode}});
          if(mix.outcome==='not-modeled'){
            next.actionLog.push(clone(action));
            next.complete=isComplete(next,profile,domain);
            return {status:'unsupported',nextState:next,chemistryEvents:events,observations:[],procedural:{completedStep:null,blockedBy:[],reason:null},guidance:{category:'unsupported',code:mix.coverageCode??'REACTION_NOT_MODELED'},evidenceCandidate:null,unsupported:{code:'UNSUPPORTED_CHEMISTRY',detail:mix.coverageCode??'REACTION_NOT_MODELED'},error:null};
          }
          if(mix.outcome==='reaction'&&mix.observations?.some(o=>o.type==='precipitate')) c!.precipitates.push({reactionId:mix.reactionId!,source:'ReactionMatcher'});
          for(const o of mix.observations??[]) observe({target:'mix',container,kind:o.type,data:clone(o),producedBy:'ReactionMatcher',source:`chemistry/reactions.json#${mix.reactionId}`});
          if(mix.outcome==='no-reaction') observe({target:'mix',container,kind:'no-reaction',data:null,producedBy:'ReactionMatcher',source:`chemistry/reactions.json#${mix.reactionId}`});
          break;
        }
        // dissolution: the solute part of the sample dissolves only when the solubility data models it
        const sample=c!.contents.find(e=>e.form==='solid-sample')!;
        const sub=profile.substances.find(s=>s.id===sample.substanceId)!;
        const solute=sub.soluteSpeciesId?domain.species.byId(sub.soluteSpeciesId) as any:null;
        const dissociation=solute?domain.ionicEngine.dissociate(solute.formula):{modeled:false as const};
        if(!dissociation.modeled) return reject(state,{category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:'DISSOLUTION_NOT_MODELED'});
        events.push({type:'dissolve',authority:'IonicEngine.dissociate',detail:{formula:solute.formula,ions:(dissociation as any).ions}});
        c!.contents=c!.contents.filter(e=>e!==sample);
        c!.contents.push({substanceId:sample.substanceId,speciesId:sub.soluteSpeciesId,phase:'aq',form:'dissolved',amount:null,source:'IonicEngine.dissociate (chemistry/solubility.json)'});
        for(const part of sub.undeclaredParts) if(part.insoluble) c!.contents.push({substanceId:part.id,speciesId:null,phase:null,form:'suspended-solid',amount:null,source:part.source});
        observe({target:'dissolved',container,kind:'dissolved',data:{formula:solute.formula},producedBy:'IonicEngine',source:'chemistry/solubility.json'});
        const turbid=instructionSentence(profile,'turbid');
        if(turbid&&sub.undeclaredParts.some(p=>p.insoluble)) observe({target:'turbid',container,kind:turbid.kind,data:null,producedBy:'INSTRUCTION_TEXT',source:turbid.source});
        break;
      }
      case 'FILTER':{
        const receiver=profile.apparatus.find(a=>a.kind==='receiver');
        if(!receiver) return reject(state,{category:'unavailable',code:'APPARATUS_NOT_SET_UP',detail:'receiver'});
        const r=next.containers[receiver.id]!;
        r.contents.push(...c!.contents.filter(e=>e.form==='dissolved'||e.form==='liquid'||e.form==='solution'));
        c!.contents=c!.contents.filter(e=>e.form==='suspended-solid');
        const t=instructionSentence(profile,'filtrate');
        events.push({type:'filtered',authority:'PROCEDURE',detail:{from:container,to:receiver.id}});
        if(t) observe({target:'filtrate',container:receiver.id,kind:t.kind,data:null,producedBy:'INSTRUCTION_TEXT',source:t.source});
        break;
      }
      case 'EVAPORATE':{
        const t=instructionSentence(profile,'crystals');
        c!.contents=c!.contents.filter(e=>e.form!=='liquid').map(e=>e.form==='dissolved'?{...e,phase:null,form:'crystals' as const,source:t?.source??'PROCEDURE'}:e);
        c!.temperature={modeled:true,state:'heated'};
        events.push({type:'evaporated',authority:'PROCEDURE',detail:{container}});
        if(t) observe({target:'crystals',container,kind:t.kind,data:null,producedBy:'INSTRUCTION_TEXT',source:t.source});
        break;
      }
      case 'ELECTRIC_CURRENT':{
        if(chem.authority!=='electrolysis'||!domain.electrolysis) throw new Error('LAB_DOMAIN_MISSING:electrolysis');
        const model=domain.electrolysis.resolve(chem.query);
        if(!model.modeled) return reject(state,{category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:model.code});
        next.current={on:true,container};
        next.connections.push({kind:'electric',container:container!});
        c!.deposits.push({product:model.cathode.product,electrode:'cathode',source:'ElectrolysisModel'});
        c!.gases.push({product:model.anode.product,electrode:'anode',source:'ElectrolysisModel'});
        events.push({type:'electrolysis',authority:'ElectrolysisModel',detail:{query:chem.query,cathode:model.cathode.product,anode:model.anode.product}});
        break;
      }
      case 'OBSERVE':{
        const target=paramText(action,'target')!;
        const t=profile.observationTargets.find(x=>x.id===target)!;
        if(t.producedBy==='ElectrolysisModel'){
          if(chem.authority!=='electrolysis'||!domain.electrolysis) throw new Error('LAB_DOMAIN_MISSING:electrolysis');
          if(!next.current.on){
            // nothing happens without current: an honest consequence, not a rejection and not an observation
            return {status:'accepted',nextState:(next.actionLog.push(clone(action)),next),chemistryEvents:[],observations:[],procedural:{completedStep:null,blockedBy:[],reason:null},guidance:{category:'possible',code:'NO_PROCESS_YET'},evidenceCandidate:null,unsupported:null,error:null};
          }
          const model=domain.electrolysis.resolve(chem.query);
          if(!model.modeled) return reject(state,{category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:model.code});
          const side=target==='cathode'?model.cathode:target==='anode'?model.anode:null;
          if(!side) return reject(state,{category:'unsupported',code:'UNSUPPORTED_CHEMISTRY',detail:`no model output for ${target}`});
          observe({target,container:next.current.container,kind:t.kind,data:{product:side.product,observation:side.observation},producedBy:'ElectrolysisModel',source:`chemistry/electrolysis.json#${chem.query.electrolyte}|${chem.query.phase}|${chem.query.electrode}`});
          next.observedTargets.push(target);
          evidence={kind:'observation',id:`${profile.activityId}.dynamic.${target}`,persisted:false,detail:{target,product:side.product}};
          break;
        }
        // instruction-text targets: observable once the action that produces them has happened
        const produced=next.observations.some(o=>o.target===target);
        if(!produced) return {status:'accepted',nextState:(next.actionLog.push(clone(action)),next),chemistryEvents:[],observations:[],procedural:{completedStep:null,blockedBy:[],reason:null},guidance:{category:'possible',code:'NOTHING_TO_OBSERVE_YET'},evidenceCandidate:null,unsupported:null,error:null};
        next.observedTargets.push(target);
        evidence={kind:'observation',id:`${profile.activityId}.dynamic.${target}`,persisted:false,detail:{target}};
        break;
      }
      case 'RECORD':{
        const [a,b]=c!.solutions;
        const equation=String(action.params?.text??'');
        const before=ionicState(domain,profile,next.engine.ionicActions);
        const ia:IonicAction[]=[{type:'selectReagent',payload:{slot:'A',speciesId:profile.substances.find(s=>s.id===a)!.speciesId!}},{type:'selectReagent',payload:{slot:'B',speciesId:profile.substances.find(s=>s.id===b)!.speciesId!}},{type:'mix'},{type:'writeEquation',payload:{equation}}];
        const after=ionicState(domain,profile,[...next.engine.ionicActions,...ia]);
        if(after.rejected) return reject(state,{category:'unavailable',code:after.rejected==='EQUATION_SYNTAX'?'PARAMETER_INVALID':'STATE_PRECONDITION_UNMET',detail:after.rejected});
        next.engine.ionicActions.push(...ia);
        const attempt=after.equations.at(-1)!;
        events.push({type:'equation',authority:'IonicEngine.netIonicEquation + compareNetIonic',detail:{reactionId:attempt.reactionId,correct:attempt.correct,n:attempt.n}});
        evidence={kind:'answer',id:`${profile.activityId}.dynamic.equation.${attempt.n}`,persisted:false,detail:{reactionId:attempt.reactionId,correct:attempt.correct,previouslySolved:before.solved.includes(attempt.reactionId)}};
        break;
      }
      case 'WASH':{
        next.containers[container!]=emptyContainer(container!);
        break;
      }
      case 'HEAT':{
        c!.heating=profile.limits.heating?.level??'heated';
        c!.temperature={modeled:true,state:'heated'};
        events.push({type:'heating',authority:'PROCEDURE',detail:{container,level:c!.heating,source:profile.limits.heating?.source??'catalog default (instruction states no level)'}});
        contact=c!;
        break;
      }
      case 'STOP_HEAT':{
        // heating ends; later evaluations use room conditions (no cooling model, nothing is reversed)
        c!.heating=null; c!.temperature={modeled:true,state:'room'};
        events.push({type:'heating-stopped',authority:'PROCEDURE',detail:{container}});
        break;
      }
      case 'SEAL':{ c!.sealed=true; events.push({type:'sealed',authority:'PROCEDURE',detail:{container}}); break; }
      case 'WAIT':{ procedureCode='NO_TIME_MODEL'; break; }
      case 'TRANSFER':{
        const from=next.containers[paramText(action,'from')!]!, to=next.containers[paramText(action,'to')!]!;
        to.contents.push(...from.contents); to.precipitates.push(...from.precipitates);
        from.contents=[]; from.precipitates=[];
        events.push({type:'transferred',authority:'PROCEDURE',detail:{from:from.id,to:to.id}});
        if(chem.authority==='reaction-matcher') contact=to;
        break;
      }
      case 'PASS_GAS':{
        const from=next.containers[paramText(action,'from')!]!, to=next.containers[paramText(action,'to')!]!;
        for(const g of from.gases){
          const sp=domain.species.byFormula(g.product)[0] as any;
          if(!to.contents.some(e=>e.substanceId===`gas:${g.product}`)) to.contents.push({substanceId:`gas:${g.product}`,speciesId:sp?.id??null,phase:'g',form:'gas',amount:null,source:`PASS_GAS:${from.id}`});
        }
        events.push({type:'gas-passed',authority:'PROCEDURE',detail:{from:from.id,to:to.id,gases:from.gases.map(g=>g.product)}});
        contact=to;
        break;
      }
      case 'COLLECT_GAS':{
        const sourceId=paramText(action,'from')??gasSources(next,container!)[0]!;
        const source=next.containers[sourceId]!;
        for(const g of source.gases.filter(x=>!x.collected&&!x.collectedFrom)){
          g.collected=true;
          c!.gases.push({product:g.product,...(g.reactionId?{reactionId:g.reactionId}:{}),source:g.source,collectedFrom:sourceId});
          observe({target:'gas-collected',container,kind:'gas-collected',data:{product:g.product,from:sourceId},producedBy:'PROCEDURE',source:`collected from ${sourceId}; gas identity from ${g.source}${g.reactionId?`#${g.reactionId}`:''}`});
        }
        break;
      }
    }
    if(contact){
      const r=reactInContainer(contact,profile,domain,observe);
      events.push(...r.events);
      // the physical action happened; if nothing it brought into contact is modeled, say so (no outcome is shown)
      if(!r.modeled&&(r.notModeled.length||action.family==='HEAT')){
        for(const k of Object.keys(next.containers)) next.containers[k]!.phases=phasesOf(next.containers[k]!);
        next.observations.push(...observations);
        if(step&&!next.completedSteps.includes(step.id)) next.completedSteps.push(step.id);
        next.actionLog.push(clone(action));
        next.complete=isComplete(next,profile,domain);
        const detail=r.notModeled[0]??'HEATING_EFFECT_NOT_MODELED';
        return {status:'unsupported',nextState:next,chemistryEvents:events,observations,procedural:{completedStep:step&&!state.completedSteps.includes(step.id)?step.id:null,blockedBy:[],reason:null},guidance:{category:'unsupported',code:detail},evidenceCandidate:null,unsupported:{code:'UNSUPPORTED_CHEMISTRY',detail},error:null};
      }
      if(r.modeled&&!evidence){ const obs=observations.find(o=>o.producedBy==='ReactionMatcher'); if(obs) evidence={kind:'observation',id:`${profile.activityId}.dynamic.${obs.source.split('#')[1]??'reaction'}`,persisted:false,detail:{container:obs.container,kind:obs.kind}}; }
    }
    for(const k of Object.keys(next.containers)) next.containers[k]!.phases=phasesOf(next.containers[k]!);
    next.observations.push(...observations);
    let completedStep:string|null=null;
    if(step&&!next.completedSteps.includes(step.id)){ next.completedSteps.push(step.id); completedStep=step.id; }
    next.actionLog.push(clone(action));
    const wasComplete=state.complete;
    next.complete=isComplete(next,profile,domain);
    if(next.complete&&!wasComplete) evidence={kind:'completion',id:`${profile.activityId}.dynamic.complete`,persisted:false,detail:{goal:profile.completionGoal.kind,completionScope:profile.completionScope.kind,...(evidence?{last:evidence}:{})}};
    const recommended=completedStep!==null;
    return {status:'accepted',nextState:next,chemistryEvents:events,observations,procedural:{completedStep,blockedBy:[],reason:null},guidance:{category:recommended?'recommended':'possible',code:next.complete?'COMPLETE':procedureCode??(recommended?'STEP_DONE':'ACCEPTED')},evidenceCandidate:evidence,unsupported:null,error:null};
  }

  /** Deterministic replay: the same profile + the same accepted actions → the same state. */
  function replay(profile:TopicLabProfile,actions:readonly LabAction[]):LabState{
    let state=createLabState(profile);
    for(const a of actions){
      const r=applyLabAction(state,a,profile);
      if(r.status==='rejected') throw new Error(`LAB_REPLAY_DIVERGED:${r.error?.code}`);
      state=r.nextState;
    }
    return state;
  }

  return {applyLabAction,replay,reset:createLabState,availableActions:(state:LabState,profile:TopicLabProfile)=>availableActions(state,profile),guidance:(state:LabState,profile:TopicLabProfile,level:GuidanceLevel)=>guidanceFor(state,profile,level)};
}

export interface ActionOption { action:LabAction; category:GuidanceCategory; code:string|null; blockedBy:string[]; step:string|null; instructionStep:number|null }

/** Every concrete action of the topic in this state, classified. The object → action → parameter UI reads this. */
export function availableActions(state:LabState,profile:TopicLabProfile):ActionOption[]{
  const out:ActionOption[]=[];
  const containers=profile.apparatus.filter(a=>a.isContainer).map(a=>a.id);
  const push=(action:LabAction)=>{
    const pre=precheckLabAction(state,action,profile,{learnerTextPending:true});
    const step=stepFor(profile,action,state)??null;
    let category:GuidanceCategory=pre?pre.category:'possible';
    if(!pre&&step&&!state.completedSteps.includes(step.id)) category='recommended';
    out.push({action,category,code:pre?(pre.code==='PROCEDURE_BLOCKED'?'STEP_DEPENDENCY_UNMET':pre.detail):null,blockedBy:pre?.blockedBy??[],step:step?.id??null,instructionStep:step?.instructionStep??null});
  };
  for(const def of LAB_ACTION_FAMILIES){
    if(!profile.allowedFamilies.includes(def.family)) continue;
    const params=def.parameters.filter(p=>p.required);
    if(params.some(p=>p.valuesFrom==='learner-text')){ for(const c of containers) push({family:def.family,params:{container:c,text:''}}); continue; }
    const names=params.map(p=>p.name);
    if(names.join()==='apparatus') for(const a of profile.apparatus) push({family:def.family,params:{apparatus:a.id}});
    else if(names.join()==='container') for(const c of containers){
      // COLLECT_GAS: with several gas sources the learner chooses which one (one option per source, never a guess)
      const sources=def.family==='COLLECT_GAS'&&profile.apparatus.find(a=>a.id===c)?.kind==='gas-collection-vessel'?gasSources(state,c):[];
      if(sources.length>1) for(const f of sources) push({family:def.family,params:{container:c,from:f}});
      else push({family:def.family,params:{container:c}});
    }
    else if(names.join()==='target') for(const t of profile.observationTargets) push({family:def.family,params:{target:t.id}});
    else if(names.join()==='substance,container') for(const s of profile.substances) for(const c of containers) push({family:def.family,params:{substance:s.id,container:c}});
    else if(names.join()==='from,to') for(const f of containers) for(const t of containers) if(f!==t) push({family:def.family,params:{from:f,to:t}});
    else if(!names.length) push({family:def.family,params:{}});
  }
  return out;
}

export interface GuidanceView {
  level:GuidanceLevel;
  goal:string;
  /** level ≥ 2: the families that can run now (no parameters) */
  possibleFamilies:LabActionFamily[];
  /** level ≥ 3: the instruction's next actions; `ordered` false when the order is not declared */
  recommended:Array<{action:LabAction;step:string|null}>;
  ordered:boolean;
  orderDecisionOpen:boolean;
  /** level 4: the instruction sentence behind each recommendation and why blocked steps are blocked */
  instructionText:string[];
  blocked:Array<{step:string;blockedBy:string[]}>;
  /** guidance never contains an outcome or an answer */
  revealsAnswer:false;
}

export function guidanceFor(state:LabState,profile:TopicLabProfile,level:GuidanceLevel):GuidanceView{
  if(!profile.guidance.levels.includes(level)) throw new Error(`LAB_GUIDANCE_LEVEL_INVALID:${level}`);
  const options=availableActions(state,profile);
  const possible=[...new Set(options.filter(o=>o.category==='possible'||o.category==='recommended').map(o=>o.action.family as LabActionFamily))];
  const recommended=options.filter(o=>o.category==='recommended').map(o=>({action:{family:o.action.family,params:Object.fromEntries(Object.entries(o.action.params??{}).filter(([k])=>k!=='text'))},step:o.step}));
  const blocked=profile.procedure.steps.filter(s=>!state.completedSteps.includes(s.id)&&s.dependencies.some(d=>!state.completedSteps.includes(d))).map(s=>({step:s.id,blockedBy:s.dependencies.filter(d=>!state.completedSteps.includes(d))}));
  const instructionText=[...new Set(recommended.map(r=>profile.procedure.steps.find(s=>s.id===r.step)?.instructionStep).filter((i):i is number=>typeof i==='number'))].map(i=>profile.instruction.steps[i]?.text??'').filter(Boolean);
  return {
    level,
    goal:profile.instruction.goal,
    possibleFamilies:level>=2?possible:[],
    recommended:level>=3?recommended:[],
    ordered:ORDERED(profile),
    orderDecisionOpen:profile.procedure.mode==='HUMAN_DECISION_REQUIRED',
    instructionText:level>=4?instructionText:[],
    blocked:level>=4?blocked:[],
    revealsAnswer:false,
  };
}
