import type { Concept, LearningUnit, MappingLink, PracticeActivity, TheoryActivity } from '../../domain/content/types.ts';
import type {ExternalLabBinding} from '../../integrations/external-labs/types.ts';
import {launchDecision,readinessMessage,resolveReadiness,type ReadinessPack} from '../../domain/readiness/readiness.ts';
import type {AssessmentAvailability} from '../../domain/readiness/unit-readiness.ts';
import {assessmentIdFor,isApproved,toPromptView,validatePromptPack,type AssessmentPromptView} from '../../domain/assessment/model.ts';
import {structuredTheoryView,type StructuredTheoryView} from '../theory/view.ts';
import {createLocalizer,type InteractionCatalog} from '../localization/element-names.ts';

export interface LearningHubContentData {
  units:LearningUnit[];
  theories:TheoryActivity[];
  practices:PracticeActivity[];
  mappings:MappingLink[];
  concepts:Concept[];
  externalLabs?:ExternalLabBinding[];
  /** Prompt layer only (assessment/prompts.json). The answer-key layer never reaches a view model (C3). */
  assessmentPrompts?:unknown;
  /** Canonical readiness pack (P1.2): launchability of practices, unit assessment availability, pilot. */
  readiness?:ReadinessPack;
  /** P2.3: structured theory pack (theory-structured.json); absent in older packs → MINIMAL rendering */
  structuredTheory?:unknown;
  /** P2.3 closeout (A3): learner-interaction catalog for the theory section labels */
  interaction?:InteractionCatalog;
}

export interface StudentPracticeModel {
  id:string;
  type:PracticeActivity['type'];
  title:string;
  goal:string;
  accessibility:string[];
  /** Whether the canonical launch gate lets this activity start; otherwise a learner-facing reason. */
  launchable:boolean;
  unavailableMessage?:string;
}

/** Objective assessment as the learner sees it: prompts only — no key, no explanation, no scoring rule. */
export interface StudentAssessmentModel {
  assessmentId:string;
  version:string;
  items:AssessmentPromptView[];
  pendingCount:number;
}

export interface LearningHubModel {
  id:string;
  grade:number;
  title:string;
  chapter?:string;
  learningOutcomes:string[];
  prerequisites:Array<{id:string;name:string}>;
  concepts:Array<{id:string;name:string}>;
  theory:{
    id:string;
    title:string;
    blocks:Array<{type:string;text:string}>;
    representationModes:string[];
    /** P2.3: present only for a complete, sourced structured entry (STRUCTURED); otherwise the legacy blocks render */
    structured?:StructuredTheoryView;
  };
  primaryPractice:StudentPracticeModel;
  supportingPractices:StudentPracticeModel[];
  externalLabs:Array<{id:string;provider:string;title:string;description:string;mode:string;status:string}>;
  assessment:StudentAssessmentModel;
  /** Part of the controlled P1.2 pilot (strict readiness + learner-facing mastery). */
  pilot:boolean;
  /** Unit assessment availability with a learner-facing note (never a raw code). */
  assessmentAvailability:{status:AssessmentAvailability;message?:string};
  /** P2.9: the quiz/reflection validation message templates from the learner-interaction catalog (only these two
   *  strings, never the whole catalog: the view model stays free of anything key-like); absent in older packs */
  validationText?:{quizUnanswered?:string;reflectionIncomplete?:string};
}

function studentPractice(activity:PracticeActivity,pack?:ReadinessPack):StudentPracticeModel {
  // Without a readiness pack (legacy callers/tests) nothing is decided here; the page itself still gates.
  const readiness=pack?resolveReadiness(pack,activity.id):undefined;
  const decision=pack?launchDecision(readiness):{allowed:true as const};
  return {
    id:activity.id,
    type:activity.type,
    title:activity.title,
    goal:activity.goal,
    accessibility:[...activity.accessibilityProfile],
    launchable:decision.allowed,
    ...(decision.allowed?{}:{unavailableMessage:readinessMessage(decision.reasons)}),
  };
}

export function buildLearningHubModel(learningUnitId:string,data:LearningHubContentData):LearningHubModel {
  const unit=data.units.find(x=>x.id===learningUnitId);
  if(!unit) throw new Error(`LEARNING_UNIT_NOT_FOUND:${learningUnitId}`);
  const primary=data.mappings.find(x=>x.learningUnitId===learningUnitId&&x.role==='primary');
  if(!primary) throw new Error(`PRIMARY_MAPPING_NOT_FOUND:${learningUnitId}`);
  if(!primary.theoryActivityId) throw new Error(`THEORY_ACTIVITY_NOT_FOUND:${learningUnitId}`);
  const theory=data.theories.find(x=>x.id===primary.theoryActivityId);
  if(!theory) throw new Error(`THEORY_ACTIVITY_NOT_FOUND:${primary.theoryActivityId}`);
  const practice=data.practices.find(x=>x.id===primary.practiceActivityId);
  if(!practice) throw new Error(`PRACTICE_ACTIVITY_NOT_FOUND:${primary.practiceActivityId}`);
  const conceptMap=new Map(data.concepts.map(x=>[x.id,x]));
  const resolveConcept=(id:string)=>({id,name:conceptMap.get(id)?.name??id});
  const supporting=data.mappings
    .filter(x=>x.learningUnitId===learningUnitId&&x.role==='supporting')
    .map(x=>data.practices.find(p=>p.id===x.practiceActivityId))
    .filter((x):x is PracticeActivity=>Boolean(x))
    .map(p=>studentPractice(p,data.readiness));

  return {
    id:unit.id,
    grade:unit.grade,
    title:unit.title,
    chapter:unit.chapter,
    learningOutcomes:[...unit.learningOutcomes],
    prerequisites:unit.prerequisiteConceptIds.map(resolveConcept),
    concepts:unit.conceptIds.map(resolveConcept),
    theory:{
      id:theory.id,
      title:theory.title,
      blocks:theory.explanationBlocks.map(block=>({type:block.type,text:block.text})),
      representationModes:[...theory.representationModes],
      ...(()=>{ const view=structuredTheoryView(data.structuredTheory,theory.id,createLocalizer(data.interaction?{interaction:data.interaction}:undefined)); return view?{structured:view}:{}; })(),
    },
    primaryPractice:studentPractice(practice,data.readiness),
    supportingPractices:supporting,
    externalLabs:(data.externalLabs??[]).map(x=>({id:x.id,provider:x.provider,title:x.title,description:x.description,mode:x.mode,status:x.status})),
    assessment:(()=>{
      const pack=data.assessmentPrompts===undefined?undefined:validatePromptPack(data.assessmentPrompts);
      const all=(pack?.items??[]).filter(x=>x.learningUnitId===learningUnitId);
      const approved=all.filter(isApproved);
      return {assessmentId:assessmentIdFor(learningUnitId),version:String(pack?.version??'0.0.0'),items:approved.map(toPromptView),pendingCount:all.length-approved.length};
    })(),
    pilot:Boolean(data.readiness?.pilotLearningUnitIds.includes(learningUnitId)),
    assessmentAvailability:(()=>{
      const unitReadiness=data.readiness?.units?.find(u=>u.learningUnitId===learningUnitId);
      const status:AssessmentAvailability=unitReadiness?.assessment.status??'NONE';
      return status==='AVAILABLE'?{status}:{status,message:readinessMessage(unitReadiness?.assessment.reasons.length?unitReadiness.assessment.reasons:['ASSESSMENT_NOT_AVAILABLE'])};
    })(),
    ...(()=>{ const t=createLocalizer(data.interaction?{interaction:data.interaction}:undefined); const q=t('ui.quiz-unanswered'), r=t('ui.reflection-incomplete');
      return q||r?{validationText:{...(q?{quizUnanswered:q}:{}),...(r?{reflectionIncomplete:r}:{})}}:{}; })(),
  };
}
