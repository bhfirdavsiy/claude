// P2.3 — structured theory contract (ADR-P2-004). A learning unit's theory is STRUCTURED only when a HUMAN-authored,
// source-supported entry has all four blocks: a concept explanation (≥300 characters), at least one worked example,
// at least one misconception check and a summary. Every block keeps its own provenance (sourceRefs, author) and its
// own review state. This module validates and classifies; it never writes, completes or approves content.
import {provenanceOf,type SourceRegistry} from '../governance/source-policy.ts';

export const STRUCTURED_THEORY_SCHEMA='kimyolab.structured-theory.v1';
export const STRUCTURED_THEORY_PACK_SCHEMA='kimyolab.structured-theory-pack.v1';
export const STRUCTURED_THEORY_PACK_PATH='theory-structured.json';
export const MIN_EXPLANATION_CHARS=300;

export type BlockReviewStatus='draft'|'pending-review'|'changes-requested'|'approved';
export interface BlockProvenance {
  /** registered source ids (content-src/source-registry.json) that support this block */
  sourceRefs:string[];
  /** the human author (reviewer-style id); never an automation identity */
  authoredBy:string;
  reviewStatus:BlockReviewStatus;
  /** required when reviewStatus is approved: who reviewed WHICH content (hash-pinned by the build) */
  review?:{reviewerId:string;reviewerRole:'chemistry'|'didactic';reviewedAt:string;reviewedHash:string};
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
  |'APPROVAL_WITHOUT_REVIEW'|'MEDIA_INVALID';

/** Text that is a template, a stub or a gap marker — never counts as authored content. */
export const PLACEHOLDER=/\b(?:TODO|TBD|FIXME|XXX|lorem\s+ipsum|placeholder)\b|\{\{|\}\}|\[[^\]]*\]|…|\.\.\.|^\s*$/i;
/** Identities that are automation, not people (mirrors AUTOMATION_IDENTITY in governance). */
const AUTOMATION=/^(?:claude|agent|bot|ai|automation|system|codex|gpt|kimyolab-bot)(?:[.\-_].*)?$/i;

const isText=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const texts=(t:any):string[]=>[t.explanation?.text,...(t.workedExamples??[]).flatMap((w:any)=>[w.problem,...(w.solutionSteps??[]),w.answer]),...(t.misconceptions??[]).flatMap((m:any)=>[m.statement,m.correction]),...(t.summary?.points??[])];

function blocks(t:any):Array<{name:string;block:any}>{
  return [{name:'explanation',block:t.explanation},...(t.workedExamples??[]).map((b:any,i:number)=>({name:`workedExamples[${i}]`,block:b})),...(t.misconceptions??[]).map((b:any,i:number)=>({name:`misconceptions[${i}]`,block:b})),{name:'summary',block:t.summary}].filter(x=>x.block);
}

export interface TheoryValidation { issues:Array<{code:TheoryIssue;where:string}>; complete:boolean; sourced:boolean }

/** Validates an entry against the contract. `complete` = all four blocks present and well-formed; `sourced` = every
 *  block cites at least one registered source of an acceptable category (SOURCE_POLICY chemistry claims). */
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
  for(const {name,block} of blocks(t??{})){
    const refs=Array.isArray(block.sourceRefs)?block.sourceRefs.filter(isText):[];
    if(!refs.length){ add('SOURCE_MISSING',name); sourced=false; }
    else{ const p=provenanceOf(refs,registry,'chemistry'); if(p.unregistered.length){ add('SOURCE_UNREGISTERED',name); sourced=false; } else if(!p.acceptable){ add('SOURCE_NOT_ACCEPTABLE',name); sourced=false; } }
    if(!isText(block.authoredBy)) add('AUTHOR_MISSING',name); else if(AUTOMATION.test(block.authoredBy)) add('AUTOMATION_AUTHOR',name);
    if(!['draft','pending-review','changes-requested','approved'].includes(block.reviewStatus)) add('SCHEMA',`${name}.reviewStatus`);
    if(block.reviewStatus==='approved'&&!(isText(block.review?.reviewerId)&&isText(block.review?.reviewedAt)&&isText(block.review?.reviewedHash)&&['chemistry','didactic'].includes(block.review?.reviewerRole)&&!AUTOMATION.test(block.review.reviewerId))) add('APPROVAL_WITHOUT_REVIEW',name);
  }
  for(const [i,m] of (Array.isArray(t?.media)?t.media:[]).entries()) if(!isText(m?.src)||!isText(m?.alt)||!Array.isArray(m?.sourceRefs)||!m.sourceRefs.length||/^(?:https?:)?\/\//.test(m.src)) add('MEDIA_INVALID',`media[${i}]`);
  const structural:TheoryIssue[]=['SCHEMA','EXPLANATION_TOO_SHORT','WORKED_EXAMPLE_MISSING','MISCONCEPTION_MISSING','SUMMARY_MISSING','PLACEHOLDER_TEXT','AUTHOR_MISSING','AUTOMATION_AUTHOR','APPROVAL_WITHOUT_REVIEW','MEDIA_INVALID'];
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

/** Review summary of an entry (governance, not depth). */
export function theoryReviewState(t:StructuredTheory):'APPROVED'|'REVIEW_PENDING'|'CHANGES_REQUESTED'|'DRAFT'{
  const states=blocks(t).map(b=>b.block.reviewStatus as BlockReviewStatus);
  if(states.includes('changes-requested')) return 'CHANGES_REQUESTED';
  if(states.includes('draft')) return 'DRAFT';
  return states.every(s=>s==='approved')?'APPROVED':'REVIEW_PENDING';
}

/** Content of a block that a review pins (the build compares review.reviewedHash with this canonical form). */
export function reviewableContent(block:any):string{
  const {sourceRefs,authoredBy,reviewStatus,review,...content}=block??{};
  return JSON.stringify({content:Object.fromEntries(Object.entries(content).sort(([a],[b])=>a<b?-1:1)),sourceRefs:[...(sourceRefs??[])].sort()});
}
