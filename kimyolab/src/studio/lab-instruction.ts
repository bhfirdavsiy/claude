// P2.12 — virtual laboratory instruction lane (ADR-P2-013 §5). "Yo‘riqnomada nima bo‘lsa — tizimda o‘sha."
//
//   instruction text → classifyInstructionStep → resolveOperation (capability registry) → topic lab profile preview
//
// The author types (or starts from) the instruction; the Studio never asks the author to pick an engine, a handler, an
// action family or a chemistry authority, and never asks for a temperature, a time, a quantity, an apparatus, a colour
// or an observation the instruction does not state. Ambiguous verbs keep family null; learner responses and safety
// statements are never chemistry. A lab VIEW exists only where a canonical topic lab profile already exists and the
// instruction is the one that profile was authored from — otherwise the Studio says so instead of improvising one.
import {classifyInstructionStep,familyKind,type InstructionOperation} from '../domain/lab/action-catalog.ts';
import {formulasInText,resolveOperation,type CapabilityRegistry,type ResolutionStatus} from '../domain/lab/capability-registry.ts';
import {deriveCompletionScope,topicLabProfileProblems,type TopicLabProfile} from '../domain/lab/topic-lab-profile.ts';
import type {StudioFinding} from './pdf-excerpt.ts';

export interface LabInstructionPayload {
  goal:string;
  equipment:string;
  materials:string;
  safety:string;
  steps:string[];
}

export function emptyInstruction():LabInstructionPayload{ return {goal:'',equipment:'',materials:'',safety:'',steps:[]}; }

/** Starting from an existing canonical instruction (legacyContent) — copied, never linked for writing. */
export function instructionFromLegacy(goal:string,legacy:{equipment?:string;materials?:string;safety?:string;steps?:string[]}):LabInstructionPayload{
  return {goal:goal??'',equipment:legacy.equipment??'',materials:legacy.materials??'',safety:legacy.safety??'',steps:[...(legacy.steps??[])]};
}

/** Author text → steps: one step per non-empty line; numbering the author typed ("1." / "1)") is not part of the step. */
export function stepsFromText(text:string):string[]{
  return String(text??'').split(/\r?\n/).map(l=>l.replace(/^\s*\d+\s*[.)]\s*/,'').trim()).filter(Boolean);
}

export interface AnalyzedOperation {
  step:number;
  verb:string;
  /** internal; never shown to the author */
  family:InstructionOperation['family'];
  status:InstructionOperation['status'];
  resolution:ResolutionStatus;
  /** the author-facing Uzbek explanation key */
  messageKey:string;
  severity:StudioFinding['severity'];
}

/** what each resolution means for the author (plain Uzbek; content-src/locales/uz-latn/content-studio.json) */
const RESOLUTION_MESSAGE:Record<ResolutionStatus,{key:string;severity:StudioFinding['severity']}>={
  SUPPORTED:{key:'studio.lab.op-supported',severity:'READY'},
  AUTHORITY_AT_RUNTIME:{key:'studio.lab.op-runtime',severity:'READY'},
  PROCEDURE_ONLY:{key:'studio.lab.op-procedure',severity:'READY'},
  AUTHORITY_REQUIRED:{key:'studio.lab.op-no-chemistry-model',severity:'UNSUPPORTED'},
  UNSUPPORTED_ACTION:{key:'studio.lab.op-no-model',severity:'UNSUPPORTED'},
  LEARNER_RESPONSE:{key:'studio.lab.op-learner-response',severity:'READY'},
  CONTROL:{key:'studio.lab.op-control',severity:'READY'},
  SAFETY_RULE:{key:'studio.lab.op-safety',severity:'READY'},
  AMBIGUOUS:{key:'studio.lab.op-ambiguous',severity:'ATTENTION'},
  UNMAPPED:{key:'studio.lab.op-unmapped',severity:'ATTENTION'},
};

/** Every operation of the instruction, resolved with the SAME registry function the P2.11 coverage uses. */
export function analyzeInstruction(draft:LabInstructionPayload,registry:CapabilityRegistry):AnalyzedOperation[]{
  const out:AnalyzedOperation[]=[];
  draft.steps.forEach((text,step)=>{
    for(const op of classifyInstructionStep(text)){
      const chem=op.family&&registry.actions.find(a=>a.family===op.family)?.handler==='CHEMISTRY';
      const r=resolveOperation(registry,op,chem?formulasInText(text):[]);
      const m=RESOLUTION_MESSAGE[r.status];
      out.push({step,verb:op.verb,family:op.family,status:op.status,resolution:r.status,messageKey:m.key,severity:m.severity});
    }
  });
  return out;
}

const norm=(s:string)=>String(s??'').replace(/\s+/g,' ').trim();
/** Is the draft the instruction the canonical profile was authored from (steps, equipment, materials, safety)? */
export function sameInstruction(draft:LabInstructionPayload,profile:TopicLabProfile):boolean{
  const i=profile.instruction;
  return draft.steps.length===i.steps.length&&draft.steps.every((s,k)=>norm(s)===norm(i.steps[k]!.text))
    &&norm(draft.equipment)===norm(i.equipmentText)&&norm(draft.materials)===norm(i.materialsText)&&norm(draft.safety)===norm(i.safetyText);
}

export interface LabPreview {
  /** the profile the learner view would use; null when no canonical profile carries this instruction */
  profile:TopicLabProfile|null;
  state:'PROFILE_PREVIEW'|'INSTRUCTION_CHANGED'|'NO_PROFILE';
  problems:string[];
}

/** The preview profile: the canonical profile's own contract, with the instruction re-derived from the draft text and
 *  the completion scope recomputed from it. A changed instruction never gets a silently re-used profile. */
export function previewProfile(draft:LabInstructionPayload,canonical:TopicLabProfile|null):LabPreview{
  if(!canonical) return {profile:null,state:'NO_PROFILE',problems:[]};
  if(!sameInstruction(draft,canonical)) return {profile:null,state:'INSTRUCTION_CHANGED',problems:[]};
  const p:TopicLabProfile=JSON.parse(JSON.stringify(canonical));
  p.instruction.steps=draft.steps.map((text,index)=>({index,text,operations:classifyInstructionStep(text)}));
  p.instruction.equipmentText=draft.equipment; p.instruction.materialsText=draft.materials; p.instruction.safetyText=draft.safety;
  p.completionScope=deriveCompletionScope(p.instruction.steps,p.allowedFamilies,p.procedure.steps,p.procedure.trials??[]);
  return {profile:p,state:'PROFILE_PREVIEW',problems:topicLabProfileProblems(p)};
}

/** Author-facing findings for a lab instruction draft. Nothing here asks for a fact the instruction does not state. */
export function validateInstruction(draft:LabInstructionPayload,target:{learningUnitId:string|null},ops:readonly AnalyzedOperation[],preview:LabPreview):StudioFinding[]{
  const out:StudioFinding[]=[];
  if(!target.learningUnitId) out.push({severity:'MISSING',code:'TOPIC_MISSING',messageKey:'studio.check.topic-missing',field:'topic'});
  if(!draft.steps.length) out.push({severity:'MISSING',code:'STEPS_MISSING',messageKey:'studio.check.steps-missing',field:'steps'});
  const seen=new Set<string>();
  for(const o of ops){ if(o.severity==='READY') continue; const k=`${o.messageKey}`; if(seen.has(k)) continue; seen.add(k); out.push({severity:o.severity,code:`OPERATION_${o.resolution}`,messageKey:o.messageKey,field:'steps'}); }
  if(preview.state==='NO_PROFILE') out.push({severity:'UNSUPPORTED',code:'NO_LAB_PROFILE',messageKey:'studio.check.no-lab-profile'});
  if(preview.state==='INSTRUCTION_CHANGED') out.push({severity:'ATTENTION',code:'INSTRUCTION_CHANGED',messageKey:'studio.check.instruction-changed'});
  if(preview.profile){
    if(preview.problems.length) out.push({severity:'MISSING',code:'PROFILE_INCOMPLETE',messageKey:'studio.check.profile-incomplete'});
    if(preview.profile.completionScope.kind==='PARTIAL_INSTRUCTION') out.push({severity:'ATTENTION',code:'PARTIAL_INSTRUCTION',messageKey:'studio.check.partial-instruction'});
    // a source/model conflict recorded on the profile stays a conflict; the Studio never picks a side
    if(preview.profile.gaps.some(g=>g.code==='SOURCE_CONFLICT_REVIEW_REQUIRED')) out.push({severity:'CONFLICT',code:'SOURCE_CONFLICT_REVIEW_REQUIRED',messageKey:'studio.check.source-conflict'});
  }
  return out;
}

/** The lab facts a publish candidate carries for its reviewers — recomputed by `studio:check` from the repository. */
export function labDerived(draft:LabInstructionPayload,registry:CapabilityRegistry,canonical:TopicLabProfile|null):Record<string,unknown>{
  const pv=previewProfile(draft,canonical);
  return {previewState:pv.state,operations:analyzeInstruction(draft,registry).map(o=>({step:o.step,verb:o.verb,resolution:o.resolution})),completionScope:pv.profile?pv.profile.completionScope:null,profileGaps:pv.profile?pv.profile.gaps.map(g=>g.code):[],profileId:pv.profile?.profileId??null};
}
export function labFindings(draft:LabInstructionPayload,target:{learningUnitId:string|null},registry:CapabilityRegistry,canonical:TopicLabProfile|null):StudioFinding[]{
  return validateInstruction(draft,target,analyzeInstruction(draft,registry),previewProfile(draft,canonical));
}

/** P2.12 round trip: an existing canonical instruction passed through the Studio must derive the same operations,
 *  trial scope, capability resolution, completion scope and gaps — and the same chemistry under the same actions. */
export interface RoundTripResult {
  activityId:string;
  dimensions:Record<'operations'|'trialScope'|'capabilityResolution'|'completionScope'|'unsupportedGaps'|'chemistry',{equal:boolean;detail:string}>;
  equal:boolean;
}

export function labRoundTrip(canonical:TopicLabProfile,draft:LabInstructionPayload,registry:CapabilityRegistry,chemistry:{run:(p:TopicLabProfile)=>unknown}):RoundTripResult{
  const preview=previewProfile(draft,canonical);
  const p=preview.profile;
  const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const canonOps=canonical.instruction.steps.map(s=>s.operations);
  const draftOps=p?p.instruction.steps.map(s=>s.operations):null;
  const resolve=(steps:Array<{text:string;operations:InstructionOperation[]}>)=>steps.flatMap(s=>s.operations.map(op=>{ const chem=op.family&&registry.actions.find(a=>a.family===op.family)?.handler==='CHEMISTRY'; return resolveOperation(registry,op,chem?formulasInText(s.text):[]).status; }));
  const dims:RoundTripResult['dimensions']={
    operations:{equal:!!draftOps&&eq(draftOps,canonOps),detail:`${canonOps.flat().length} operations`},
    trialScope:{equal:!!p&&eq(p.procedure.scope,canonical.procedure.scope)&&eq(p.procedure.trials??null,canonical.procedure.trials??null),detail:`${canonical.procedure.scope}, ${(canonical.procedure.trials??[]).length} trial(s)`},
    capabilityResolution:{equal:!!p&&eq(resolve(p.instruction.steps),resolve(canonical.instruction.steps)),detail:'resolveOperation per operation'},
    completionScope:{equal:!!p&&eq(p.completionScope.kind,canonical.completionScope.kind),detail:canonical.completionScope.kind},
    unsupportedGaps:{equal:!!p&&eq(p.completionScope.uncovered,canonical.completionScope.uncovered)&&eq(p.gaps,canonical.gaps),detail:`${canonical.completionScope.uncovered.length} uncovered operation(s), ${canonical.gaps.length} recorded gap(s)`},
    chemistry:{equal:!!p&&eq(chemistry.run(p),chemistry.run(canonical)),detail:'the same lab actions on both profiles → the same lab state'},
  };
  return {activityId:canonical.activityId,dimensions:dims,equal:Object.values(dims).every(d=>d.equal)};
}

/** families an instruction uses (internal, for reports) */
export const instructionKinds=(ops:readonly AnalyzedOperation[])=>[...new Set(ops.map(o=>o.family?familyKind(o.family):'NONE'))].sort();
