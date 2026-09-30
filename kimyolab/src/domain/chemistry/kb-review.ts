// Chemistry knowledge-base review (P1.7). Every chemistry claim the product relies on is an ASSERTION with a
// content hash; its review status is DERIVED from the human decision register (content-src/chemistry-reviews.json)
// — never from a field in the data, never decided by tooling.
//
//   decision on the CURRENT hash   → approved | rejected | change_required
//   decision on an OLD hash        → stale (the assertion changed after review; the approval no longer counts)
//   no decision                    → pending
//
// Reviewers must be people (AUTOMATION_IDENTITY, shared with assessment governance) in the chemistry role, and a
// non-approval needs a comment.
import {createHash} from 'node:crypto';
import {AUTOMATION_IDENTITY} from '../assessment/governance.ts';

export const CHEMISTRY_REVIEW_REGISTER_SCHEMA='kimyolab.chemistry-reviews.v1';
export type AssertionCategory='reaction'|'no-reaction'|'condition'|'observation'|'solubility'|'hydrolysis'|'indicator'|'species-name'|'electrolysis';
export const ASSERTION_CATEGORIES:readonly AssertionCategory[]=['reaction','no-reaction','condition','observation','solubility','hydrolysis','indicator','species-name','electrolysis'];
export type ChemistryDecision='approve'|'reject'|'change_required';
export type ReviewState='approved'|'rejected'|'change_required'|'stale'|'pending';

export interface ChemistryAssertion {
  id:string;
  category:AssertionCategory;
  claim:string;
  data:unknown;
  sourceRefs:string[];
  affectedActivities:string[];
  /** reviewStatus written in the data file (informational; the register decides) */
  dataReviewStatus:string|null;
  hash:string;
}

export interface ChemistryReviewRecord {
  assertionId:string;
  assertionHash:string;
  decision:ChemistryDecision;
  reviewerId:string;
  reviewerRole:'chemistry';
  reviewedAt:string;
  comment?:string;
}

function stable(value:unknown):string{
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value as object).sort().map(k=>`${JSON.stringify(k)}:${stable((value as any)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** The hash covers WHAT is claimed (category + structured data + sources), not who uses it. */
export function assertionHash(a:{category:string;data:unknown;sourceRefs:string[]}):string{
  return createHash('sha256').update(stable({category:a.category,data:a.data,sourceRefs:[...a.sourceRefs].sort()})).digest('hex');
}

export function validateReviewRecord(r:any):string[]{
  const issues:string[]=[];
  const id=r?.assertionId??'?';
  if(!r||typeof r.assertionId!=='string'||!r.assertionId) issues.push('CHEM_REVIEW_ASSERTION_MISSING');
  if(typeof r?.assertionHash!=='string'||!/^[a-f0-9]{64}$/.test(r.assertionHash)) issues.push(`CHEM_REVIEW_HASH_INVALID:${id}`);
  if(!['approve','reject','change_required'].includes(r?.decision)) issues.push(`CHEM_REVIEW_DECISION_INVALID:${id}`);
  if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`CHEM_REVIEW_REVIEWER_MISSING:${id}`);
  else if(AUTOMATION_IDENTITY.test(r.reviewerId)) issues.push(`CHEM_REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(r?.reviewerRole!=='chemistry') issues.push(`CHEM_REVIEW_ROLE_INVALID:${id}`);
  if(typeof r?.reviewedAt!=='string'||Number.isNaN(Date.parse(r.reviewedAt))) issues.push(`CHEM_REVIEW_DATE_INVALID:${id}`);
  if(r?.decision!=='approve'&&!(typeof r?.comment==='string'&&r.comment.trim())) issues.push(`CHEM_REVIEW_COMMENT_REQUIRED:${id}`);
  // P1.8: an extra field (e.g. `status: approved`) is refused — the record is exactly what a reviewer decides
  for(const f of unknownFields(r,CHEMISTRY_DECISION_FIELDS)) issues.push(`CHEM_REVIEW_FIELD_NOT_ALLOWED:${id}:${f}`);
  return issues;
}

export function parseReviewRegister(raw:any):{records:ChemistryReviewRecord[];issues:string[]}{
  if(!raw||raw.schema!==CHEMISTRY_REVIEW_REGISTER_SCHEMA||!Array.isArray(raw.records)) return {records:[],issues:['CHEM_REVIEW_REGISTER_INVALID']};
  const issues=raw.records.flatMap((r:any)=>validateReviewRecord(r));
  return {records:issues.length?[]:raw.records,issues};
}

/** Effective review state of one assertion: the latest human decision, checked against the CURRENT hash. */
export function reviewStateOf(a:ChemistryAssertion,records:readonly ChemistryReviewRecord[]):{state:ReviewState;record?:ChemistryReviewRecord}{
  const mine=records.filter(r=>r.assertionId===a.id).sort((x,y)=>Date.parse(x.reviewedAt)-Date.parse(y.reviewedAt));
  const latest=mine.at(-1);
  if(!latest) return {state:'pending'};
  if(latest.assertionHash!==a.hash) return {state:'stale',record:latest};
  return {state:latest.decision==='approve'?'approved':latest.decision==='reject'?'rejected':'change_required',record:latest};
}

// ------------------------------------------------------------------ P1.8: decision-file integrity + candidates

/** The only fields a chemistry decision may carry. Anything else (e.g. `status`, `approved`, `lifecycle`) is a
 *  tampering attempt or a misuse and is refused, never silently dropped. */
export const CHEMISTRY_DECISION_FIELDS:readonly string[]=['assertionId','assertionHash','decision','reviewerId','reviewerRole','reviewedAt','comment'];
export function unknownFields(record:unknown,allowed:readonly string[]):string[]{
  if(!record||typeof record!=='object'||Array.isArray(record)) return [];
  return Object.keys(record).filter(k=>!allowed.includes(k)).sort();
}

/**
 * Review CANDIDATES (P1.7 candidates.json: pairs the solubility rules suggest might react / not react) are not
 * assertions of the knowledge base. A reviewer's decision on one is AUTHORING TRIAGE — it never adds a reaction or
 * a no-reaction record; an accepted candidate still has to be authored as content and then reviewed as an assertion.
 */
export const CANDIDATE_REVIEW_REGISTER_SCHEMA='kimyolab.chemistry-candidate-reviews.v1';
export type CandidateDecision='accept_for_authoring'|'reject_candidate'|'needs_evidence';
export const CANDIDATE_DECISIONS:readonly CandidateDecision[]=['accept_for_authoring','reject_candidate','needs_evidence'];
export const CANDIDATE_DECISION_FIELDS:readonly string[]=['candidateId','candidateHash','decision','reviewerId','reviewerRole','reviewedAt','comment'];
export interface CandidateReviewRecord {
  candidateId:string;
  candidateHash:string;
  decision:CandidateDecision;
  reviewerId:string;
  reviewerRole:'chemistry';
  reviewedAt:string;
  comment?:string;
}

/** The hash covers what the reviewer judged: the reagent pair and the derived suggestion. */
export function candidateHash(c:{reagents:readonly string[];candidate:unknown}):string{
  return createHash('sha256').update(stable({reagents:[...c.reagents].sort(),candidate:c.candidate})).digest('hex');
}

export function validateCandidateRecord(r:any):string[]{
  const issues:string[]=[];
  const id=r?.candidateId??'?';
  if(!r||typeof r.candidateId!=='string'||!r.candidateId) issues.push('CANDIDATE_REVIEW_ID_MISSING');
  if(typeof r?.candidateHash!=='string'||!/^[a-f0-9]{64}$/.test(r.candidateHash)) issues.push(`CANDIDATE_REVIEW_HASH_INVALID:${id}`);
  if(!CANDIDATE_DECISIONS.includes(r?.decision)) issues.push(`CANDIDATE_REVIEW_DECISION_INVALID:${id}`);
  if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`CANDIDATE_REVIEW_REVIEWER_MISSING:${id}`);
  else if(AUTOMATION_IDENTITY.test(r.reviewerId)) issues.push(`CANDIDATE_REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(r?.reviewerRole!=='chemistry') issues.push(`CANDIDATE_REVIEW_ROLE_INVALID:${id}`);
  if(typeof r?.reviewedAt!=='string'||Number.isNaN(Date.parse(r.reviewedAt))) issues.push(`CANDIDATE_REVIEW_DATE_INVALID:${id}`);
  if(r?.decision!=='accept_for_authoring'&&!(typeof r?.comment==='string'&&r.comment.trim())) issues.push(`CANDIDATE_REVIEW_COMMENT_REQUIRED:${id}`);
  for(const f of unknownFields(r,CANDIDATE_DECISION_FIELDS)) issues.push(`CANDIDATE_REVIEW_FIELD_NOT_ALLOWED:${id}:${f}`);
  return issues;
}

export function parseCandidateRegister(raw:any):{records:CandidateReviewRecord[];issues:string[]}{
  if(!raw||raw.schema!==CANDIDATE_REVIEW_REGISTER_SCHEMA||!Array.isArray(raw.records)) return {records:[],issues:['CANDIDATE_REVIEW_REGISTER_INVALID']};
  const issues=raw.records.flatMap((r:any)=>validateCandidateRecord(r));
  return {records:issues.length?[]:raw.records,issues};
}

/** Latest human decision on a candidate, against its CURRENT hash (an outdated one is `stale`). */
export function candidateStateOf(c:{id:string;hash:string},records:readonly CandidateReviewRecord[]):{state:'pending'|'stale'|CandidateDecision;record?:CandidateReviewRecord}{
  const latest=records.filter(r=>r.candidateId===c.id).sort((x,y)=>Date.parse(x.reviewedAt)-Date.parse(y.reviewedAt)).at(-1);
  if(!latest) return {state:'pending'};
  if(latest.candidateHash!==c.hash) return {state:'stale',record:latest};
  return {state:latest.decision,record:latest};
}
