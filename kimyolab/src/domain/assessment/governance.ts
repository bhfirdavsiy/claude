// Assessment governance (P1.2). An item becomes APPROVED only through human review records — never by
// editing the bank, never by a script deciding on its own.
//
//   DRAFT → REVIEW_PENDING → APPROVED → RETIRED
//
// * DRAFT / RETIRED are authored (`item.lifecycle`).
// * APPROVED is DERIVED: a chemistry AND a didactic review record with decision `approved`, from a
//   non-automation reviewer identity, made against the item's CURRENT content hash, plus valid concept and
//   outcome mapping, a valid key and a non-empty explanation. Any content change invalidates old approvals.
// * everything else is REVIEW_PENDING (fail closed).
import {createHash} from 'node:crypto';

export type AssessmentItemLifecycle='DRAFT'|'REVIEW_PENDING'|'APPROVED'|'RETIRED';
export type ReviewRole='chemistry'|'didactic';
export type ReviewDecision='approved'|'rejected'|'changes_requested';

export const REVIEW_REGISTER_SCHEMA='kimyolab.assessment-reviews.v1';
export const REVIEW_ROLES:readonly ReviewRole[]=['chemistry','didactic'];

export interface AssessmentReviewRecord {
  itemId:string;
  role:ReviewRole;
  decision:ReviewDecision;
  reviewerId:string;
  reviewerRole:ReviewRole;
  reviewedAt:string;
  /** sha256 of the reviewable item content (see assessmentItemHash) at review time. */
  itemHash:string;
  itemVersion:string;
  /** The review packet the human decided on, pinned by content hash. */
  evidence:{packet:string;packetSha256:string};
  comment?:string;
}

export interface AssessmentReviewRegister { schema:typeof REVIEW_REGISTER_SCHEMA; records:AssessmentReviewRecord[] }

/** Identities that denote automation. An approval must come from a person (P1.2 §13). */
export const AUTOMATION_IDENTITY=/(^|[^a-z])(ai|bot|claude|gpt|llm|agent|automation|autoapprove|script|ci|github-actions)([^a-z]|$)/i;

function stable(value:unknown):string{
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value as object).sort().map(k=>`${JSON.stringify(k)}:${stable((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Hash of everything a reviewer judges (review bookkeeping excluded). */
export function assessmentItemHash(item:Record<string,unknown>):string{
  const {review:_review,lifecycle:_lifecycle,...reviewable}=item;
  return createHash('sha256').update(stable(reviewable)).digest('hex');
}

export function validateReviewRecord(record:any):string[]{
  const issues:string[]=[];
  const id=String(record?.itemId??'?');
  const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
  if(!text(record?.itemId)) issues.push('REVIEW_ITEM_REQUIRED');
  if(!REVIEW_ROLES.includes(record?.role)) issues.push(`REVIEW_ROLE_INVALID:${id}`);
  if(!['approved','rejected','changes_requested'].includes(record?.decision)) issues.push(`REVIEW_DECISION_INVALID:${id}`);
  if(!text(record?.reviewerId)) issues.push(`REVIEW_REVIEWER_REQUIRED:${id}`);
  else if(AUTOMATION_IDENTITY.test(record.reviewerId)) issues.push(`REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(record?.reviewerRole!==record?.role) issues.push(`REVIEW_ROLE_MISMATCH:${id}`);
  if(!text(record?.reviewedAt)||!Number.isFinite(Date.parse(record.reviewedAt))) issues.push(`REVIEW_TIMESTAMP_INVALID:${id}`);
  if(!/^[a-f0-9]{64}$/.test(String(record?.itemHash))) issues.push(`REVIEW_ITEM_HASH_INVALID:${id}`);
  if(!text(record?.itemVersion)) issues.push(`REVIEW_ITEM_VERSION_REQUIRED:${id}`);
  if(!text(record?.evidence?.packet)||!/^[a-f0-9]{64}$/.test(String(record?.evidence?.packetSha256))) issues.push(`REVIEW_EVIDENCE_REQUIRED:${id}`);
  return issues;
}

export interface LifecycleVerdict {
  lifecycle:AssessmentItemLifecycle;
  /** Effective per-role review state (`pending` unless a valid, current human record exists). */
  review:Record<ReviewRole,'pending'|ReviewDecision>;
  /** Why the item is not APPROVED (empty when it is). */
  reasons:string[];
}

/** Derives the canonical lifecycle of one item from the bank + the review register. */
export function deriveItemLifecycle(item:any,records:AssessmentReviewRecord[],context:{unitOutcomeCount:number;unitConceptIds:string[]}):LifecycleVerdict{
  const hash=assessmentItemHash(item);
  const review={chemistry:'pending',didactic:'pending'} as Record<ReviewRole,'pending'|ReviewDecision>;
  for(const role of REVIEW_ROLES){
    const current=records
      .filter(r=>r.itemId===item.id&&r.role===role&&r.itemHash===hash&&validateReviewRecord(r).length===0)
      .sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
    if(current) review[role]=current.decision;
  }
  if(item.lifecycle==='RETIRED') return {lifecycle:'RETIRED',review,reasons:['RETIRED']};
  if(item.lifecycle==='DRAFT') return {lifecycle:'DRAFT',review,reasons:['DRAFT']};
  const reasons:string[]=[];
  for(const role of REVIEW_ROLES) if(review[role]!=='approved') reasons.push(role==='chemistry'?'CHEMISTRY_REVIEW_REQUIRED':'ASSESSMENT_REVIEW_PENDING');
  const outcomes=Array.isArray(item.outcomeIds)?item.outcomeIds:[];
  if(!outcomes.length) reasons.push('OUTCOME_MAPPING_MISSING');
  const outcomeOk=outcomes.every((o:string)=>{const m=/^(.+)#o([0-9]+)$/.exec(o);return Boolean(m&&m[1]===item.learningUnitId&&Number(m[2])>=1&&Number(m[2])<=context.unitOutcomeCount);});
  if(!outcomeOk||new Set(outcomes).size!==outcomes.length) reasons.push('OUTCOME_MAPPING_INVALID');
  const concepts=Array.isArray(item.conceptIds)?item.conceptIds:[];
  if(!concepts.length||new Set(concepts).size!==concepts.length||!concepts.every((c:string)=>context.unitConceptIds.includes(c))) reasons.push('CONCEPT_MAPPING_INVALID');
  if(!(item.options??[]).some((o:any)=>o?.id===item.correctOptionId)) reasons.push('ANSWER_KEY_INVALID');
  if(typeof item.explanation!=='string'||!item.explanation.trim()) reasons.push('EXPLANATION_MISSING');
  return {lifecycle:reasons.length?'REVIEW_PENDING':'APPROVED',review,reasons:[...new Set(reasons)]};
}
