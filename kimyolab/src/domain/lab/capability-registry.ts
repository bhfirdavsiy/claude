// P2.11 — the capability registry (ADR-P2-012): what KimyoLab can actually execute, DERIVED from the existing
// contracts and engine data — never a second hand-written list.
//
//   actions      ← LAB_ACTION_FAMILIES (kind, domainHandler, checker, apparatus) + HANDLER_SEMANTICS (the runtime's own
//                  declaration of what each handler is and which authorities it may consult)
//   authorities  ← the engine data: ReactionMatcher records (reactants, products, condition dimensions, observation
//                  kinds), IonicEngine dissociation rules, ElectrolysisModel records, school lab models (step-bound),
//                  qualitative tests
//   species      ← SpeciesRegistry, each formula with the authorities that know it
//
// It answers the future Content Studio question
//   instruction operation → supported capability → runtime authority
// without anyone choosing an engine: resolveOperation() picks the authority from the data, or says why none applies.
import {familyKind,LAB_ACTION_FAMILIES,type InstructionOperation,type LabActionFamily,type LabOperationKind} from './action-catalog.ts';
import {HANDLER_SEMANTICS,type HandlerType} from './lab-runtime.ts';
import {parseConditionVocabulary} from '../chemistry/condition-vocabulary.ts';

export const CAPABILITY_REGISTRY_SCHEMA='kimyolab.capability-registry.v1';
/** bump on any change of the registry's shape or of how a capability is resolved */
export const CAPABILITY_REGISTRY_VERSION='1.1.0';

export type AuthorityId='ReactionMatcher'|'IonicEngine'|'ElectrolysisModel'|'SchoolLabModel'|'QualitativeTest'|'INSTRUCTION_TEXT'|'PROCEDURE';
export type ResolutionStatus=
  |'SUPPORTED'            // a handler exists and a reaction record has EXACTLY these reactants (one formula: a
                          // single-reactant record)
  |'PROCEDURE_ONLY'       // deterministic procedure; no chemistry is decided
  |'AUTHORITY_AT_RUNTIME' // a chemistry handler exists, but the step names no formula: which authority (if any) covers it
                          // is decided at run time from the substances actually present — NOT verified here
  |'AUTHORITY_REQUIRED'   // a handler exists, but the substances are not known to its authorities → fail closed
  |'UNSUPPORTED_ACTION'   // a state/observation action with no handler
  |'LEARNER_RESPONSE'     // not a state transition; judged only by a checker (or not at all)
  |'CONTROL'|'SAFETY_RULE'|'AMBIGUOUS'|'UNMAPPED';

export interface RegistryData {
  reactions:unknown; solutionRules:unknown; species:unknown; electrolysis?:unknown;
  conditionVocabulary?:unknown; schoolLabModels?:unknown; qualitativeTests?:unknown;
}

export interface ActionCapability {
  family:LabActionFamily; kind:LabOperationKind;
  handler:HandlerType|'NONE';
  authorities:string[];
  procedureOnly:boolean;
  checker:string|null;
  apparatusRequirements:string[];
  /** the profile authority under which the handler has a consequence (elsewhere it fails closed) */
  requiresProfileAuthority:string|null;
}

export interface CapabilityRegistry {
  schema:typeof CAPABILITY_REGISTRY_SCHEMA;
  version:typeof CAPABILITY_REGISTRY_VERSION;
  actions:ActionCapability[];
  authorities:{
    ReactionMatcher:{records:number;reactionIds:string[];formulas:string[];reactantSets:Array<{reactionId:string;reactants:string[];conditionTags:string[]}>;conditionDimensions:string[];modelObservationKinds:string[]};
    IonicEngine:{dissociationFormulas:string[];insolubleFormulas:string[]};
    ElectrolysisModel:{queries:Array<{electrolyte:string;phase:string;electrode:string}>;modelObservationKinds:string[]};
    SchoolLabModel:{models:string[];scope:'STEP_BOUND_ONLY'};
    QualitativeTest:{tests:string[];reagents:string[];samples:string[]};
  };
  species:Array<{speciesId:string;formula:string;phase:string|null;authorities:AuthorityId[]}>;
}

const arr=(v:any,key:string):any[]=>Array.isArray(v)?v:Array.isArray(v?.[key])?v[key]:[];
const uniq=(xs:string[])=>[...new Set(xs)].sort((a,b)=>a.localeCompare(b,'en'));

export function buildCapabilityRegistry(data:RegistryData):CapabilityRegistry{
  const reactions=arr(data.reactions,'reactions');
  const rules=data.solutionRules as any;
  const electro=arr(data.electrolysis,'records');
  const school=arr(data.schoolLabModels,'models');
  const qual=arr(data.qualitativeTests,'tests');
  const species=arr(data.species,'species');
  const vocabulary=data.conditionVocabulary?parseConditionVocabulary(data.conditionVocabulary):undefined;
  const rmFormulas=uniq(reactions.flatMap((r:any)=>[...r.reactants,...r.products].map((x:any)=>x.formula)));
  const dims=uniq(reactions.flatMap((r:any)=>(r.conditions?.tags??[]).map((t:string)=>vocabulary?.terms[t]?.dimension??`unknown:${t}`)));
  const ionicFormulas=uniq((rules?.dissociation??[]).map((d:any)=>d.formula));
  const insoluble=uniq(rules?.insoluble??[]);
  const electrolytes=uniq(electro.map((r:any)=>r.electrolyte));
  const qualFormulas=uniq(qual.flatMap((t:any)=>[t.reagent,t.product,...(t.supportedSamples??[])]));
  const actions:ActionCapability[]=LAB_ACTION_FAMILIES.map(d=>{
    const sem=HANDLER_SEMANTICS[d.family];
    return {family:d.family,kind:d.kind,handler:d.domainHandler&&sem?sem.type:'NONE',authorities:sem?.authorities??[],procedureOnly:Boolean(d.domainHandler&&sem?.type==='PROCEDURE'&&!sem.authorities.some(a=>a!=='INSTRUCTION_TEXT')),checker:d.checker,apparatusRequirements:[...d.apparatusRequirements],requiresProfileAuthority:sem?.requiresProfileAuthority??null};
  });
  return {
    schema:CAPABILITY_REGISTRY_SCHEMA,version:CAPABILITY_REGISTRY_VERSION,actions,
    authorities:{
      ReactionMatcher:{records:reactions.length,reactionIds:uniq(reactions.map((r:any)=>r.id)),formulas:rmFormulas,reactantSets:reactions.map((r:any)=>({reactionId:r.id,reactants:uniq(r.reactants.map((x:any)=>x.formula)),conditionTags:[...(r.conditions?.tags??[])]})).sort((a:any,b:any)=>a.reactionId.localeCompare(b.reactionId,'en')),conditionDimensions:dims,modelObservationKinds:uniq(reactions.flatMap((r:any)=>(r.observations??[]).map((o:any)=>o.type)))},
      IonicEngine:{dissociationFormulas:ionicFormulas,insolubleFormulas:insoluble},
      ElectrolysisModel:{queries:electro.map((r:any)=>({electrolyte:r.electrolyte,phase:r.phase,electrode:r.electrode})),modelObservationKinds:electro.length?['deposit','gas']:[]},
      SchoolLabModel:{models:uniq(school.map((m:any)=>m.id)),scope:'STEP_BOUND_ONLY'},
      QualitativeTest:{tests:uniq(qual.map((t:any)=>t.id)),reagents:uniq(qual.map((t:any)=>t.reagent)),samples:uniq(qual.flatMap((t:any)=>t.supportedSamples??[]))},
    },
    species:species.map((s:any)=>{
      const auth:AuthorityId[]=[];
      if(rmFormulas.includes(s.formula)) auth.push('ReactionMatcher');
      if(ionicFormulas.includes(s.formula)||insoluble.includes(s.formula)) auth.push('IonicEngine');
      if(electrolytes.includes(s.formula)) auth.push('ElectrolysisModel');
      if(qualFormulas.includes(s.formula)) auth.push('QualitativeTest');
      return {speciesId:s.id,formula:s.formula,phase:s.phase??null,authorities:auth};
    }).sort((a:any,b:any)=>a.speciesId.localeCompare(b.speciesId,'en')),
  };
}

/** The formulas WRITTEN in an instruction text (P2.11 coverage, P2.12 Content Studio): multi-element formulas and the
 *  single-element symbols used in the instruction corpus. Uzbek names are never turned into formulas. */
export const FORMULA_TOKEN=/\b(?:[A-Z][a-z]?\d*){2,}\b|\b(?:Mg|Zn|Cu|Fe|Al|Ag|Na|Ca|K|S|C|P)\b(?=[\s,.;)]|$)/g;
export const formulasInText=(text:string)=>[...new Set<string>(String(text).match(FORMULA_TOKEN)??[])].sort();

/** formula → the species and the authorities that know it (unknown stays explicit, never guessed) */
export function resolveSubstance(registry:CapabilityRegistry,formula:string){
  const hits=registry.species.filter(s=>s.formula===formula);
  return {formula,speciesId:hits.length===1?hits[0]!.speciesId:null,ambiguous:hits.length>1,authorities:uniq(hits.flatMap(h=>h.authorities)) as AuthorityId[],status:hits.length?'KNOWN':'UNKNOWN_SUBSTANCE'};
}

/** instruction operation (+ the formulas it involves) → capability status and the authority that would run it. */
export function resolveOperation(registry:CapabilityRegistry,op:Pick<InstructionOperation,'family'|'status'>,formulas:string[]=[]):{status:ResolutionStatus;family:LabActionFamily|null;authority:string|null;reason:string;basis?:'NO_FORMULA_IN_STEP'|'PART_OF_RECORD'|'FORMULA_KNOWN_ONLY'}{
  if(op.status==='AMBIGUOUS') return {status:'AMBIGUOUS',family:null,authority:null,reason:'no context rule resolved the verb'};
  if(op.status==='UNMAPPED_OPERATION'||!op.family) return {status:'UNMAPPED',family:null,authority:null,reason:'verb not in the lexicon'};
  const kind=familyKind(op.family);
  if(kind==='LEARNER_RESPONSE') { const a=registry.actions.find(x=>x.family===op.family)!; return {status:'LEARNER_RESPONSE',family:op.family,authority:a.checker?'checker':null,reason:a.checker?`checker: ${a.checker}`:'no checker: never judged'}; }
  if(kind==='CONTROL') return {status:'CONTROL',family:op.family,authority:null,reason:'lab-level control'};
  if(kind==='SAFETY_RULE') return {status:'SAFETY_RULE',family:op.family,authority:null,reason:'a prohibition, carried as a safety note'};
  const a=registry.actions.find(x=>x.family===op.family)!;
  if(a.handler==='NONE') return {status:'UNSUPPORTED_ACTION',family:op.family,authority:null,reason:'no safe handler'};
  if(a.procedureOnly) return {status:'PROCEDURE_ONLY',family:op.family,authority:'PROCEDURE',reason:'deterministic procedure; no chemistry decided'};
  // a chemistry handler: the first of its authorities that knows every formula involved
  const chem=a.authorities.filter(x=>x!=='INSTRUCTION_TEXT');
  if(!formulas.length) return {status:'AUTHORITY_AT_RUNTIME',basis:'NO_FORMULA_IN_STEP',family:op.family,authority:chem.join('|')||'PROCEDURE',reason:`handler exists; no formula in the step, so the authority is chosen from the substances at run time (not verified here)${a.requiresProfileAuthority?` (only under a ${a.requiresProfileAuthority} profile; elsewhere it fails closed)`:''}`};
  // P2.11 closeout: an authority SUPPORTS an operation only when it models exactly this operation:
  //   ReactionMatcher — a record whose reactant set is exactly these formulas (a single-formula record for one formula);
  //                     formulas that are only PART of a record's reactants → AUTHORITY_AT_RUNTIME (the other reagent
  //                     comes from the runtime state); merely appearing somewhere in a record is never support
  //   IonicEngine / ElectrolysisModel — knowing a formula (a dissociation rule, an electrolyte record) is not support for
  //                     the step: what it meets (the other reagent, often named only in Uzbek), the phase and the electrode
  //                     come from the runtime state → AUTHORITY_AT_RUNTIME, never SUPPORTED from the step text
  const key=uniq(formulas).join('+');
  const sets=registry.authorities.ReactionMatcher.reactantSets;
  let atRuntime:string|null=null; let basis:'PART_OF_RECORD'|'FORMULA_KNOWN_ONLY'='FORMULA_KNOWN_ONLY';
  for(const auth of chem){
    if(auth==='ReactionMatcher'){
      const exact=sets.filter(r=>r.reactants.join('+')===key);
      if(exact.length) return {status:'SUPPORTED',family:op.family,authority:auth,reason:`record ${exact.map(h=>h.reactionId).join(', ')}${exact.some(h=>h.conditionTags.length)?` (requires: ${uniq(exact.flatMap(h=>h.conditionTags)).join(', ')})`:''}`};
      const partial=sets.filter(r=>formulas.every(f=>r.reactants.includes(f)));
      if(partial.length&&!atRuntime) basis='PART_OF_RECORD';
      if(partial.length&&!atRuntime) atRuntime=`${formulas.join(' + ')} ${formulas.length>1?'are':'is'} part of ${partial.length} record(s) (${partial.slice(0,3).map(h=>h.reactionId).join(', ')}${partial.length>3?', …':''}); the other reagent comes from the runtime state`;
      continue;
    }
    if(auth==='IonicEngine'&&formulas.length===1&&registry.authorities.IonicEngine.dissociationFormulas.includes(formulas[0]!)&&!atRuntime) atRuntime=`IonicEngine dissociates ${formulas[0]}; what it meets is decided from the runtime state`;
    if(auth==='ElectrolysisModel'&&formulas.length===1&&registry.authorities.ElectrolysisModel.queries.some(q=>q.electrolyte===formulas[0])&&!atRuntime) atRuntime=`ElectrolysisModel has a ${formulas[0]} record; phase and electrode are decided from the runtime query`;
  }
  if(atRuntime) return {status:'AUTHORITY_AT_RUNTIME',basis,family:op.family,authority:chem.join('|'),reason:atRuntime};
  return {status:'AUTHORITY_REQUIRED',family:op.family,authority:null,reason:`no authority of this handler models ${formulas.join(' + ')} (fails closed)`};
}

/** registry ↔ runtime consistency: every implemented family declares its semantics and vice versa */
export function registryProblems(registry:CapabilityRegistry):string[]{
  const out:string[]=[];
  for(const d of LAB_ACTION_FAMILIES){
    const sem=HANDLER_SEMANTICS[d.family];
    if(d.domainHandler&&!sem) out.push(`HANDLER_WITHOUT_SEMANTICS:${d.family}`);
    if(!d.domainHandler&&sem) out.push(`SEMANTICS_WITHOUT_HANDLER:${d.family}`);
  }
  if(registry.version!==CAPABILITY_REGISTRY_VERSION) out.push('VERSION');
  return out;
}
