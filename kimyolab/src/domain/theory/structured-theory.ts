// P2.3 — structured theory contract (ADR-P2-004). A learning unit's theory is STRUCTURED only when a HUMAN-authored,
// source-supported entry has all four blocks: a concept explanation (≥300 characters), at least one worked example,
// at least one misconception check and a summary. Every block keeps its own provenance (sourceRefs, author) and its
// own reviews. This module validates and classifies; it never writes, completes or approves content.
//
// P2.3 closeout (A2) — TWO-PERSON REVIEW. Approval is never an authored assertion: it is DERIVED from the block's
// reviews. A block is APPROVED only when the CURRENT content revision (text + sourceRefs, hashed) has an approving
// chemistry review AND an approving didactic review, by two distinct humans, neither of them the author, both pinned to
// that same hash. Any edit of content or sources changes the hash, so earlier reviews become STALE.
import {provenanceOf,type SourceRegistry} from '../governance/source-policy.ts';
import {AUTOMATION_IDENTITY} from '../governance/identity.ts';
import {sha256HexSync,utf8} from '../content/sha256.ts';

export const STRUCTURED_THEORY_SCHEMA='kimyolab.structured-theory.v1';
export const STRUCTURED_THEORY_PACK_SCHEMA='kimyolab.structured-theory-pack.v1';
export const STRUCTURED_THEORY_PACK_PATH='theory-structured.json';
export const MIN_EXPLANATION_CHARS=300;

/** The author's own workflow state. It never says "approved" — approval is derived from reviews. */
export type AuthorStatus='draft'|'ready-for-review';
export type ReviewerRole='chemistry'|'didactic';
export interface BlockReview { reviewerId:string; reviewerRole:ReviewerRole; decision:'approved'|'changes-requested'; reviewedAt:string; reviewedHash:string; notes?:string }
export interface BlockProvenance {
  /** registered source ids (content-src/source-registry.json) that support this block */
  sourceRefs:string[];
  /** the human author; never an automation identity */
  authoredBy:string;
  status:AuthorStatus;
  reviews:BlockReview[];
}
export interface ExplanationBlock extends BlockProvenance { text:string }
export interface WorkedExampleBlock extends BlockProvenance { problem:string; solutionSteps:string[]; answer:string }
export interface MisconceptionBlock extends BlockProvenance { statement:string; correction:string }
export interface SummaryBlock extends BlockProvenance { points:string[] }
export interface TheoryMedia { src:string; alt:string; caption?:string; sourceRefs:string[] }
export interface StructuredTheory {
  schema:typeof STRUCTURED_THEORY_SCHEMA;
  theoryId:string;
  learningUnitId:string;
  version:string;
  explanation:ExplanationBlock;
  workedExamples:WorkedExampleBlock[];
  misconceptions:MisconceptionBlock[];
  summary:SummaryBlock;
  media?:TheoryMedia[];
}

export type TheoryIssue=
  |'SCHEMA'|'EXPLANATION_TOO_SHORT'|'WORKED_EXAMPLE_MISSING'|'MISCONCEPTION_MISSING'|'SUMMARY_MISSING'
  |'SOURCE_MISSING'|'SOURCE_UNREGISTERED'|'SOURCE_NOT_ACCEPTABLE'|'PLACEHOLDER_TEXT'|'AUTHOR_MISSING'|'AUTOMATION_AUTHOR'
  |'REVIEW_INVALID'|'REVIEWER_NOT_HUMAN'|'SELF_REVIEW'|'SAME_REVIEWER_BOTH_ROLES'|'DUPLICATE_ROLE_REVIEW'|'MEDIA_INVALID';

/** Text that is a template, a stub or a gap marker — never counts as authored content. */
export const PLACEHOLDER=/\b(?:TODO|TBD|FIXME|XXX|lorem\s+ipsum|placeholder)\b|\{\{|\}\}|\[[^\]]*\]|…|\.\.\.|^\s*$/i;
/** Automation identities (the governance list shared with assessment review) plus common short forms. */
export const isAutomationIdentity=(id:string)=>AUTOMATION_IDENTITY.test(id)||/^(?:system|kimyolab-bot|machine)(?:[.\-_].*)?$/i.test(id);

const isText=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const texts=(t:any):string[]=>[t.explanation?.text,...(t.workedExamples??[]).flatMap((w:any)=>[w.problem,...(w.solutionSteps??[]),w.answer]),...(t.misconceptions??[]).flatMap((m:any)=>[m.statement,m.correction]),...(t.summary?.points??[])];

export function contentBlocks(t:any):Array<{name:string;block:any}>{
  return [{name:'explanation',block:t.explanation},...(t.workedExamples??[]).map((b:any,i:number)=>({name:`workedExamples[${i}]`,block:b})),...(t.misconceptions??[]).map((b:any,i:number)=>({name:`misconceptions[${i}]`,block:b})),{name:'summary',block:t.summary}].filter(x=>x.block);
}

/** The reviewable revision of a block: its content AND its sourceRefs (provenance metadata and reviews excluded). */
export function reviewableContent(block:any):string{
  const {sourceRefs,authoredBy,status,reviews,reviewStatus,review,...content}=block??{};
  return JSON.stringify({content:Object.fromEntries(Object.entries(content).sort(([a],[b])=>a<b?-1:1)),sourceRefs:[...(sourceRefs??[])].sort()});
}
/** The hash a review must pin. Editing text or sources changes it. */
export function blockContentHash(block:any):string{ return sha256HexSync(utf8(reviewableContent(block))); }

export type BlockGovernance='APPROVED'|'REVIEW_PENDING'|'STALE_REVIEW'|'CHANGES_REQUESTED'|'DRAFT';
/** Derived review state of one block (see the rule at the top of this file). */
export function blockGovernance(block:any):{state:BlockGovernance;currentHash:string;chemistry:BlockReview|null;didactic:BlockReview|null;stale:BlockReview[];issues:TheoryIssue[]}{
  const currentHash=blockContentHash(block);
  const reviews:any[]=Array.isArray(block?.reviews)?block.reviews:[];
  const issues:TheoryIssue[]=[];
  for(const r of reviews){
    if(!isText(r?.reviewerId)||!['chemistry','didactic'].includes(r?.reviewerRole)||!['approved','changes-requested'].includes(r?.decision)||!isText(r?.reviewedAt)||!/^[a-f0-9]{64}$/.test(String(r?.reviewedHash))) issues.push('REVIEW_INVALID');
    else if(isAutomationIdentity(r.reviewerId)) issues.push('REVIEWER_NOT_HUMAN');
    else if(isText(block?.authoredBy)&&r.reviewerId.trim().toLowerCase()===block.authoredBy.trim().toLowerCase()) issues.push('SELF_REVIEW');
  }
  const current=reviews.filter(r=>r?.reviewedHash===currentHash);
  const stale=reviews.filter(r=>r?.reviewedHash!==currentHash);
  const byRole=(role:ReviewerRole)=>current.filter(r=>r.reviewerRole===role);
  if(byRole('chemistry').length>1||byRole('didactic').length>1) issues.push('DUPLICATE_ROLE_REVIEW');
  const chemistry=byRole('chemistry')[0]??null, didactic=byRole('didactic')[0]??null;
  if(chemistry&&didactic&&chemistry.reviewerId.trim().toLowerCase()===didactic.reviewerId.trim().toLowerCase()) issues.push('SAME_REVIEWER_BOTH_ROLES');
  const valid=!issues.length;
  let state:BlockGovernance;
  if(valid&&chemistry?.decision==='approved'&&didactic?.decision==='approved') state='APPROVED';
  else if(current.some(r=>r.decision==='changes-requested')) state='CHANGES_REQUESTED';
  else if(stale.length&&!(chemistry&&didactic)) state='STALE_REVIEW';
  else if(block?.status==='draft'&&!current.length) state='DRAFT';
  else state='REVIEW_PENDING';
  return {state,currentHash,chemistry,didactic,stale,issues:[...new Set(issues)]};
}

export interface TheoryValidation { issues:Array<{code:TheoryIssue;where:string}>; complete:boolean; sourced:boolean }

/** Validates an entry against the contract. `complete` = all four blocks present and well-formed with valid review
 *  records; `sourced` = every block cites at least one registered source of an acceptable category. */
export function validateStructuredTheory(raw:unknown,registry:SourceRegistry):TheoryValidation{
  const t=raw as any; const issues:TheoryValidation['issues']=[];
  const add=(code:TheoryIssue,where:string)=>issues.push({code,where});
  if(!t||typeof t!=='object'||t.schema!==STRUCTURED_THEORY_SCHEMA||!isText(t.theoryId)||!isText(t.learningUnitId)||!isText(t.version)) add('SCHEMA','entry');
  if(!t?.explanation||!isText(t.explanation.text)) add('SCHEMA','explanation');
  else if(t.explanation.text.trim().length<MIN_EXPLANATION_CHARS) add('EXPLANATION_TOO_SHORT','explanation');
  if(!Array.isArray(t?.workedExamples)||!t.workedExamples.length) add('WORKED_EXAMPLE_MISSING','workedExamples');
  else t.workedExamples.forEach((w:any,i:number)=>{ if(!isText(w?.problem)||!Array.isArray(w?.solutionSteps)||!w.solutionSteps.length||!w.solutionSteps.every(isText)||!isText(w?.answer)) add('SCHEMA',`workedExamples[${i}]`); });
  if(!Array.isArray(t?.misconceptions)||!t.misconceptions.length) add('MISCONCEPTION_MISSING','misconceptions');
  else t.misconceptions.forEach((m:any,i:number)=>{ if(!isText(m?.statement)||!isText(m?.correction)) add('SCHEMA',`misconceptions[${i}]`); });
  if(!t?.summary||!Array.isArray(t.summary.points)||!t.summary.points.length||!t.summary.points.every(isText)) add('SUMMARY_MISSING','summary');
  for(const text of texts(t??{})) if(typeof text==='string'&&PLACEHOLDER.test(text)){ add('PLACEHOLDER_TEXT','text'); break; }
  let sourced=true;
  for(const {name,block} of contentBlocks(t??{})){
    const refs=Array.isArray(block.sourceRefs)?block.sourceRefs.filter(isText):[];
    if(!refs.length){ add('SOURCE_MISSING',name); sourced=false; }
    else{ const p=provenanceOf(refs,registry,'chemistry'); if(p.unregistered.length){ add('SOURCE_UNREGISTERED',name); sourced=false; } else if(!p.acceptable){ add('SOURCE_NOT_ACCEPTABLE',name); sourced=false; } }
    if(!isText(block.authoredBy)) add('AUTHOR_MISSING',name); else if(isAutomationIdentity(block.authoredBy)) add('AUTOMATION_AUTHOR',name);
    if(!['draft','ready-for-review'].includes(block.status)||!Array.isArray(block.reviews)) add('SCHEMA',`${name}.status/reviews`);
    for(const code of blockGovernance(block).issues) add(code,name);
  }
  for(const [i,m] of (Array.isArray(t?.media)?t.media:[]).entries()) if(!isText(m?.src)||!isText(m?.alt)||!Array.isArray(m?.sourceRefs)||!m.sourceRefs.length||/^(?:https?:)?\/\//.test(m.src)) add('MEDIA_INVALID',`media[${i}]`);
  const structural:TheoryIssue[]=['SCHEMA','EXPLANATION_TOO_SHORT','WORKED_EXAMPLE_MISSING','MISCONCEPTION_MISSING','SUMMARY_MISSING','PLACEHOLDER_TEXT','AUTHOR_MISSING','AUTOMATION_AUTHOR','REVIEW_INVALID','REVIEWER_NOT_HUMAN','SELF_REVIEW','SAME_REVIEWER_BOTH_ROLES','DUPLICATE_ROLE_REVIEW','MEDIA_INVALID'];
  return {issues,complete:!issues.some(i=>structural.includes(i.code)),sourced};
}

export type TheoryDepth='NONE'|'MINIMAL'|'STRUCTURED';
/** The one depth rule: STRUCTURED only for a complete AND sourced structured entry. A legacy theory (MINIMAL), an
 *  empty/placeholder/template entry, or an unsourced entry is never STRUCTURED. Review state is governance, reported
 *  separately — it does not make content deeper, and depth does not make it approved. */
export function classifyTheoryDepth(legacyTheory:unknown,structured:unknown,registry:SourceRegistry):{depth:TheoryDepth;validation:TheoryValidation|null}{
  if(!legacyTheory&&!structured) return {depth:'NONE',validation:null};
  if(!structured) return {depth:'MINIMAL',validation:null};
  const validation=validateStructuredTheory(structured,registry);
  return {depth:validation.complete&&validation.sourced?'STRUCTURED':'MINIMAL',validation};
}

/** Entry-level governance, derived from every block: APPROVED only when every block is APPROVED. */
export function theoryReviewState(t:StructuredTheory):BlockGovernance{
  const states=contentBlocks(t).map(b=>blockGovernance(b.block).state);
  if(states.every(s=>s==='APPROVED')) return 'APPROVED';
  for(const s of ['CHANGES_REQUESTED','STALE_REVIEW','DRAFT'] as const) if(states.includes(s)) return s;
  return 'REVIEW_PENDING';
}
