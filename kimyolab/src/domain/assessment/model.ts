// Assessment content model (P1.1 — C3). An authored assessment item is split into two layers:
//
//  * AssessmentPrompt — what a learner may see: stem, options, concept/outcome mapping. Safe for the
//    UI model, the DOM and the prompt pack.
//  * AssessmentKey    — how the item is scored: correct option + scoring rule (+ explanation). Only the
//    canonical AssessmentEvaluator reads it; it never enters a render model.
//
// Local-first limitation (ADR-P1-002): in the static/standalone deployment the key pack is still a
// client-reachable asset. The split gives UI confidentiality (no key in DOM, UI model, globals or
// the page-load network payload), NOT exam-grade secrecy. A server deployment can withhold
// `assessment/keys.json` and evaluate server-side behind the same AssessmentKeySource port.

export const ASSESSMENT_PROMPT_PACK_SCHEMA='kimyolab.assessment-prompts.v1';
export const ASSESSMENT_KEY_PACK_SCHEMA='kimyolab.assessment-keys.v1';
/** Pack paths. Keys live in their own file so a deployment can exclude them as a unit. */
export const ASSESSMENT_PROMPT_PACK_PATH='assessment/prompts.json';
export const ASSESSMENT_KEY_PACK_PATH='assessment/keys.json';

export type ReviewStatus='pending'|'approved'|'rejected';

export interface AssessmentOption { id:string; text:string }

export interface AssessmentPrompt {
  id:string;
  learningUnitId:string;
  type:'single_select';
  stem:string;
  options:AssessmentOption[];
  conceptIds:string[];
  /** `<learningUnitId>#o<n>` references into LearningUnit.learningOutcomes (1-based). */
  outcomeIds:string[];
  version:string;
  review:{chemistry:ReviewStatus;didactic:ReviewStatus};
}

export interface ScoringRule { kind:'exact-option'; correctScore:number; incorrectScore:number }

export interface AssessmentKey {
  itemId:string;
  correctOptionId:string;
  scoringRule:ScoringRule;
  explanation:string;
}

export interface AssessmentPromptPack { schema:typeof ASSESSMENT_PROMPT_PACK_SCHEMA; version:string; items:AssessmentPrompt[] }
export interface AssessmentKeyPack { schema:typeof ASSESSMENT_KEY_PACK_SCHEMA; version:string; keys:AssessmentKey[] }

/** Learner-facing view of one item: only what is needed to render and answer it. */
export interface AssessmentPromptView { id:string; stem:string; options:AssessmentOption[] }

export const DEFAULT_SCORING_RULE:ScoringRule=Object.freeze({kind:'exact-option',correctScore:1,incorrectScore:0}) as ScoringRule;

/** The objective assessment of a learning unit is addressed by this id (evidence `activityId`). */
export function assessmentIdFor(learningUnitId:string){ return `assessment.${learningUnitId}`; }

function text(v:unknown):v is string { return typeof v==='string'&&v.trim().length>0; }
function fail(code:string,detail?:string):never { throw new Error(detail?`${code}: ${detail}`:code); }

/** Splits the authored bank (content-src/assessment-items.json) into prompt and key packs. */
export function splitAssessmentBank(bank:any):{prompts:AssessmentPromptPack;keys:AssessmentKeyPack}{
  if(!bank||!Array.isArray(bank.items)||!text(bank.version)) fail('ASSESSMENT_BANK_INVALID');
  const prompts:AssessmentPrompt[]=[];
  const keys:AssessmentKey[]=[];
  for(const item of bank.items){
    prompts.push({
      id:String(item.id),learningUnitId:String(item.learningUnitId),type:'single_select',stem:String(item.prompt),
      options:(item.options??[]).map((o:any)=>({id:String(o.id),text:String(o.text)})),
      conceptIds:[...(item.conceptIds??[])].map(String),outcomeIds:[...(item.outcomeIds??[])].map(String),
      version:String(item.version),
      review:{chemistry:item.review?.chemistry??'pending',didactic:item.review?.didactic??'pending'},
    });
    keys.push({itemId:String(item.id),correctOptionId:String(item.correctOptionId),scoringRule:{...DEFAULT_SCORING_RULE},explanation:String(item.explanation??'')});
  }
  return {
    prompts:{schema:ASSESSMENT_PROMPT_PACK_SCHEMA,version:String(bank.version),items:prompts},
    keys:{schema:ASSESSMENT_KEY_PACK_SCHEMA,version:String(bank.version),keys},
  };
}

const PROMPT_KEYS=new Set(['id','learningUnitId','type','stem','options','conceptIds','outcomeIds','version','review']);

/** Validates a prompt pack. Any answer-key field in a prompt is a hard error (fail closed, C3). */
export function validatePromptPack(input:any):AssessmentPromptPack{
  if(!input||input.schema!==ASSESSMENT_PROMPT_PACK_SCHEMA||!text(input.version)||!Array.isArray(input.items)) fail('ASSESSMENT_PROMPT_PACK_INVALID');
  for(const item of input.items){
    for(const key of Object.keys(item??{})) if(!PROMPT_KEYS.has(key)) fail('ASSESSMENT_PROMPT_LEAKS_FIELD',`${item?.id}:${key}`);
    for(const option of item.options??[]) for(const key of Object.keys(option??{})) if(key!=='id'&&key!=='text') fail('ASSESSMENT_PROMPT_LEAKS_FIELD',`${item?.id}:options.${key}`);
    if(!text(item.id)||!text(item.learningUnitId)||!text(item.stem)||!Array.isArray(item.options)||item.options.length<2) fail('ASSESSMENT_PROMPT_INVALID',String(item?.id));
  }
  return input as AssessmentPromptPack;
}

export function validateKeyPack(input:any):AssessmentKeyPack{
  if(!input||input.schema!==ASSESSMENT_KEY_PACK_SCHEMA||!text(input.version)||!Array.isArray(input.keys)) fail('ASSESSMENT_KEY_PACK_INVALID');
  for(const key of input.keys){
    if(!text(key?.itemId)||!text(key?.correctOptionId)||key?.scoringRule?.kind!=='exact-option') fail('ASSESSMENT_KEY_INVALID',String(key?.itemId));
  }
  return input as AssessmentKeyPack;
}

export function isApproved(prompt:AssessmentPrompt){ return prompt.review.chemistry==='approved'&&prompt.review.didactic==='approved'; }

export type ItemReadiness={ready:true}|{ready:false;reasons:string[]};

/** Runtime readiness of one item: approved, mapped to concepts, and scorable by an existing key. */
export function itemReadiness(prompt:AssessmentPrompt,key:AssessmentKey|undefined):ItemReadiness{
  const reasons:string[]=[];
  if(!isApproved(prompt)) reasons.push('REVIEW_PENDING');
  if(!prompt.conceptIds.length) reasons.push('CONCEPT_MAPPING_MISSING');
  if(!key) reasons.push('KEY_MISSING');
  else if(!prompt.options.some(o=>o.id===key.correctOptionId)) reasons.push('KEY_OPTION_UNKNOWN');
  return reasons.length?{ready:false,reasons}:{ready:true};
}

/** The learner-facing projection. Built from the prompt layer only — it cannot contain a key. */
export function toPromptView(prompt:AssessmentPrompt):AssessmentPromptView{
  return {id:prompt.id,stem:prompt.stem,options:prompt.options.map(o=>({id:o.id,text:o.text}))};
}
