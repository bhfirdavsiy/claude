import type { Concept, LearningUnit, MappingLink, PracticeActivity, TheoryActivity } from '../../domain/content/types.ts';
import type {ExternalLabBinding} from '../../integrations/external-labs/types.ts';
import {assessmentIdFor,isApproved,toPromptView,validatePromptPack,type AssessmentPromptView} from '../../domain/assessment/model.ts';

export interface LearningHubContentData {
  units:LearningUnit[];
  theories:TheoryActivity[];
  practices:PracticeActivity[];
  mappings:MappingLink[];
  concepts:Concept[];
  externalLabs?:ExternalLabBinding[];
  /** Prompt layer only (assessment/prompts.json). The answer-key layer never reaches a view model (C3). */
  assessmentPrompts?:unknown;
}

export interface StudentPracticeModel {
  id:string;
  type:PracticeActivity['type'];
  title:string;
  goal:string;
  accessibility:string[];
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
  };
  primaryPractice:StudentPracticeModel;
  supportingPractices:StudentPracticeModel[];
  externalLabs:Array<{id:string;provider:string;title:string;description:string;mode:string;status:string}>;
  assessment:StudentAssessmentModel;
}

function studentPractice(activity:PracticeActivity):StudentPracticeModel {
  return {
    id:activity.id,
    type:activity.type,
    title:activity.title,
    goal:activity.goal,
    accessibility:[...activity.accessibilityProfile],
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
    .map(studentPractice);

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
    },
    primaryPractice:studentPractice(practice),
    supportingPractices:supporting,
    externalLabs:(data.externalLabs??[]).map(x=>({id:x.id,provider:x.provider,title:x.title,description:x.description,mode:x.mode,status:x.status})),
    assessment:(()=>{
      const pack=data.assessmentPrompts===undefined?undefined:validatePromptPack(data.assessmentPrompts);
      const all=(pack?.items??[]).filter(x=>x.learningUnitId===learningUnitId);
      const approved=all.filter(isApproved);
      return {assessmentId:assessmentIdFor(learningUnitId),version:String(pack?.version??'0.0.0'),items:approved.map(toPromptView),pendingCount:all.length-approved.length};
    })(),
  };
}
