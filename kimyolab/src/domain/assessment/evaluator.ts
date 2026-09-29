// Canonical AssessmentEvaluator (P1.1 — C3/C2). AssessmentResponse + AssessmentKey → AssessmentEvaluation.
// Pure domain code: no UI, no persistence. The UI only submits responses; it never decides correctness.
import type {AnswerEvidence} from '../../runtime/evidence/types.ts';
import type {AssessmentKey,AssessmentPrompt} from './model.ts';

export interface AssessmentResponse { itemId:string; selectedOptionId:string }

export interface AssessmentSubmission {
  assessmentId:string;
  learningUnitId:string;
  assessmentVersion:string;
  responses:AssessmentResponse[];
}

export interface ItemEvaluation {
  itemId:string;
  itemVersion:string;
  conceptIds:string[];
  selectedOptionId:string;
  correct:boolean;
  score:number;
}

export interface AssessmentEvaluation {
  assessmentId:string;
  learningUnitId:string;
  assessmentVersion:string;
  items:ItemEvaluation[];
  objectiveItems:number;
  correctItems:number;
}

function fail(code:string,detail:string):never { throw new Error(`${code}: ${detail}`); }

/**
 * Evaluates a complete submission against the canonical key. Fails closed on anything the key cannot
 * score: unknown/duplicate/missing responses, options that are not part of the item, missing keys.
 * `prompts` are the items that were presented (runtime-ready items of the unit).
 */
export function evaluateAssessment(input:{prompts:AssessmentPrompt[];keys:AssessmentKey[];submission:AssessmentSubmission}):AssessmentEvaluation{
  const {prompts,keys,submission}=input;
  if(!prompts.length) fail('ASSESSMENT_NO_ITEMS',submission.learningUnitId);
  const keyByItem=new Map(keys.map(k=>[k.itemId,k]));
  const promptById=new Map(prompts.map(p=>[p.id,p]));
  const answered=new Map<string,AssessmentResponse>();
  for(const response of submission.responses){
    if(!promptById.has(response.itemId)) fail('ASSESSMENT_RESPONSE_UNKNOWN_ITEM',response.itemId);
    if(answered.has(response.itemId)) fail('ASSESSMENT_RESPONSE_DUPLICATE',response.itemId);
    answered.set(response.itemId,response);
  }
  const items:ItemEvaluation[]=prompts.map(prompt=>{
    if(prompt.learningUnitId!==submission.learningUnitId) fail('ASSESSMENT_ITEM_UNIT_MISMATCH',prompt.id);
    const response=answered.get(prompt.id);
    if(!response) fail('ASSESSMENT_RESPONSE_MISSING',prompt.id);
    if(!prompt.options.some(o=>o.id===response.selectedOptionId)) fail('ASSESSMENT_RESPONSE_INVALID_OPTION',`${prompt.id}:${response.selectedOptionId}`);
    const key=keyByItem.get(prompt.id);
    if(!key) fail('ASSESSMENT_KEY_MISSING',prompt.id);
    if(!prompt.conceptIds.length) fail('ASSESSMENT_ITEM_UNMAPPED',prompt.id);
    const correct=response.selectedOptionId===key.correctOptionId;
    return {itemId:prompt.id,itemVersion:prompt.version,conceptIds:[...prompt.conceptIds],selectedOptionId:response.selectedOptionId,correct,score:correct?key.scoringRule.correctScore:key.scoringRule.incorrectScore};
  });
  return {
    assessmentId:submission.assessmentId,learningUnitId:submission.learningUnitId,assessmentVersion:submission.assessmentVersion,
    items,objectiveItems:items.length,correctItems:items.filter(i=>i.correct).length,
  };
}

/**
 * Canonical evidence drafts of an evaluation: one objective `concept-assessment` answer per item × concept.
 * Incorrect answers are evidence too. Provenance: activityId = assessmentId, activityVersion =
 * assessmentVersion, questionId = itemId, response = selected option; attemptId/learningUnitId are bound
 * by the orchestrator when the drafts are persisted.
 */
export function evaluationToEvidenceDrafts(evaluation:AssessmentEvaluation,context:{contentVersion:string;scoringVersion:string;createdAt:string}):AnswerEvidence[]{
  const drafts:AnswerEvidence[]=[];
  for(const item of evaluation.items) for(const conceptId of item.conceptIds){
    drafts.push({
      id:`${evaluation.assessmentId}.${item.itemId}.${conceptId}`,
      type:'answer',evidenceClass:'concept-assessment',
      conceptId,activityId:evaluation.assessmentId,activityVersion:evaluation.assessmentVersion,
      contentVersion:context.contentVersion,scoringVersion:context.scoringVersion,createdAt:context.createdAt,
      questionId:item.itemId,itemVersion:item.itemVersion,response:item.selectedOptionId,correct:item.correct,score:item.score,
    });
  }
  return drafts;
}
