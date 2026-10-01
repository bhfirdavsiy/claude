// P2.4 — governed source intake (ADR-P2-005). A new source enters content-src/source-registry.json only after a HUMAN
// accepted its category. A machine may validate metadata, compute hashes, detect duplicates and prepare packets; it
// never declares a source authoritative and never approves one. Browser-safe: the reviewer workbench uses the same rules.
//
// State is DERIVED from the entry, never authored:
//   DRAFT              — the submitter is still editing (status: draft, no current review)
//   READY_FOR_REVIEW   — submitted; no decision on the current revision yet (earlier decisions are STALE)
//   APPROVED           — a human (not the submitter, not an automation identity) approved THIS revision's hash and
//                        accepted exactly the category the entry claims
//   CHANGES_REQUESTED  — the current revision has a changes-requested decision
//   REJECTED           — the current revision has a rejected decision
import {SOURCE_CATEGORIES,type SourceCategory} from '../domain/governance/source-policy.ts';
import {isAutomationIdentity} from '../domain/governance/identity.ts';
import {sha256HexSync,utf8} from '../domain/content/sha256.ts';

export const SOURCE_INTAKE_SCHEMA='kimyolab.source-intake.v1';
export const SOURCE_INTAKE_DIR='content-src/source-intake';
/** Categories a source can be submitted for. INTERNAL_PROPOSAL is never a target of intake: it never counts anyway. */
export const INTAKE_CATEGORIES:readonly SourceCategory[]=SOURCE_CATEGORIES.filter(c=>c!=='INTERNAL_PROPOSAL');
export type SourceIntakeState='DRAFT'|'READY_FOR_REVIEW'|'APPROVED'|'CHANGES_REQUESTED'|'REJECTED';
export type SourceDecision='approved'|'changes-requested'|'rejected';
export interface SourceReview { reviewerId:string; decision:SourceDecision; acceptedCategory:SourceCategory; reviewedAt:string; reviewedHash:string; notes?:string }
export interface SourceIntakeEntry {
  schema:typeof SOURCE_INTAKE_SCHEMA;
  sourceId:string;
  category:SourceCategory;
  title:string;
  /** publisher or issuing authority */
  authority:string;
  edition?:string;
  year?:number;
  language:string;
  bibliographic:{authors?:string[];isbn?:string;identifier?:string;url?:string};
  /** whether citations can point at a page/section range inside this source */
  locator:{kind:'page'|'section'|'none'};
  /** the hash of a local copy of the document, when one exists (computed by a machine, never invented) */
  document?:{fileName:string;sha256:string};
  submittedBy:string;
  status:'draft'|'ready-for-review';
  reviews:SourceReview[];
}
export type SourceIntakeIssue='SCHEMA'|'CATEGORY_INVALID'|'SUBMITTER_MISSING'|'AUTOMATION_SUBMITTER'|'PLACEHOLDER_TEXT'
  |'REVIEW_INVALID'|'REVIEWER_NOT_HUMAN'|'SELF_REVIEW'|'CATEGORY_NOT_ACCEPTED'|'DUPLICATE_DECISION'
  |'DUPLICATE_ID'|'DUPLICATE_DOCUMENT'|'DUPLICATE_BIBLIOGRAPHIC';

const isText=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const PLACEHOLDER=/\b(?:TODO|TBD|FIXME|XXX|lorem\s+ipsum|placeholder)\b|\{\{|\}\}|…/i;
const sameId=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();

const sortKeys=(v:any):any=>Array.isArray(v)?v.map(sortKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])])):v;
/** The reviewable revision: every metadata field, without the submitter's workflow state and the decisions. */
export function sourceReviewableContent(entry:any):string{
  const {submittedBy,status,reviews,...metadata}=entry??{};
  return JSON.stringify(sortKeys(metadata));
}
export function sourceEntryHash(entry:any):string{ return sha256HexSync(utf8(sourceReviewableContent(entry))); }

/** Metadata checks a machine may make. They never make a source acceptable — only a human decision does. */
export function validateSourceIntake(raw:unknown):Array<{code:SourceIntakeIssue;where:string}>{
  const e=raw as any; const out:Array<{code:SourceIntakeIssue;where:string}>=[];
  const add=(code:SourceIntakeIssue,where:string)=>out.push({code,where});
  if(!e||typeof e!=='object'||e.schema!==SOURCE_INTAKE_SCHEMA||!/^src\.[a-z0-9][a-z0-9.\-]*$/.test(String(e.sourceId))||!isText(e.title)||!isText(e.authority)||!isText(e.language)) add('SCHEMA','entry');
  if(e?.year!==undefined&&!(Number.isInteger(e.year)&&e.year>1800&&e.year<2200)) add('SCHEMA','year');
  if(!e?.bibliographic||typeof e.bibliographic!=='object') add('SCHEMA','bibliographic');
  if(!['page','section','none'].includes(e?.locator?.kind)) add('SCHEMA','locator');
  if(e?.document!==undefined&&(!isText(e.document?.fileName)||!/^[a-f0-9]{64}$/.test(String(e.document?.sha256)))) add('SCHEMA','document');
  if(!INTAKE_CATEGORIES.includes(e?.category)) add('CATEGORY_INVALID','category');
  if(!isText(e?.submittedBy)) add('SUBMITTER_MISSING','submittedBy'); else if(isAutomationIdentity(e.submittedBy)) add('AUTOMATION_SUBMITTER','submittedBy');
  if(!['draft','ready-for-review'].includes(e?.status)||!Array.isArray(e?.reviews)) add('SCHEMA','status/reviews');
  for(const t of [e?.title,e?.authority,e?.edition,...(e?.bibliographic?.authors??[])]) if(typeof t==='string'&&PLACEHOLDER.test(t)){ add('PLACEHOLDER_TEXT','metadata'); break; }
  for(const [i,r] of (Array.isArray(e?.reviews)?e.reviews:[]).entries()){
    if(!isText(r?.reviewerId)||!['approved','changes-requested','rejected'].includes(r?.decision)||!INTAKE_CATEGORIES.includes(r?.acceptedCategory)||!isText(r?.reviewedAt)||!/^[a-f0-9]{64}$/.test(String(r?.reviewedHash))) add('REVIEW_INVALID',`reviews[${i}]`);
    else if(isAutomationIdentity(r.reviewerId)) add('REVIEWER_NOT_HUMAN',`reviews[${i}]`);
    else if(isText(e?.submittedBy)&&sameId(r.reviewerId,e.submittedBy)) add('SELF_REVIEW',`reviews[${i}]`);
  }
  return out;
}

/** Derived review state. Any invalid review (automation, self-review, malformed) blocks approval outright. */
export function sourceGovernance(entry:any):{state:SourceIntakeState;currentHash:string;decision:SourceReview|null;stale:SourceReview[];issues:SourceIntakeIssue[]}{
  const currentHash=sourceEntryHash(entry);
  const issues=validateSourceIntake(entry).map(i=>i.code);
  const reviews:any[]=Array.isArray(entry?.reviews)?entry.reviews:[];
  const current=reviews.filter(r=>r?.reviewedHash===currentHash), stale=reviews.filter(r=>r?.reviewedHash!==currentHash);
  if(current.length>1) issues.push('DUPLICATE_DECISION');
  const decision=current[0]??null;
  if(decision?.decision==='approved'&&decision.acceptedCategory!==entry?.category) issues.push('CATEGORY_NOT_ACCEPTED');
  let state:SourceIntakeState;
  if(decision?.decision==='rejected') state='REJECTED';
  else if(decision?.decision==='changes-requested') state='CHANGES_REQUESTED';
  else if(decision?.decision==='approved'&&!issues.length) state='APPROVED';
  else if(entry?.status==='draft'&&!current.length) state='DRAFT';
  else state='READY_FOR_REVIEW';
  return {state,currentHash,decision,stale,issues:[...new Set(issues)]};
}

const norm=(v:unknown)=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu,' ').trim();
/** Duplicate detection against the registry and the other intake entries (id, document hash, bibliographic identity). */
export function detectSourceDuplicates(entries:readonly any[],registered:readonly {id:string;title?:string;authority?:string;edition?:string;year?:number;document?:{sha256:string}}[]):Map<string,Array<{code:SourceIntakeIssue;with:string}>>{
  const out=new Map<string,Array<{code:SourceIntakeIssue;with:string}>>();
  const push=(id:string,code:SourceIntakeIssue,w:string)=>{ const l=out.get(id)??[]; l.push({code,with:w}); out.set(id,l); };
  const biblio=(s:any)=>s.authority?[norm(s.title),norm(s.authority),norm(s.edition),String(s.year??'')].join('|'):null;
  const others=(e:any)=>[...registered.map(r=>({...r,origin:'registry'})),...entries.filter(x=>x!==e).map(x=>({id:x.sourceId,title:x.title,authority:x.authority,edition:x.edition,year:x.year,document:x.document,origin:'intake'}))];
  for(const e of entries){
    for(const o of others(e)){
      if(o.id===e.sourceId) push(e.sourceId,'DUPLICATE_ID',`${o.origin}:${o.id}`);
      if(e.document?.sha256&&o.document?.sha256===e.document.sha256) push(e.sourceId,'DUPLICATE_DOCUMENT',`${o.origin}:${o.id}`);
      const b=biblio(e); if(b&&b===biblio(o)) push(e.sourceId,'DUPLICATE_BIBLIOGRAPHIC',`${o.origin}:${o.id}`);
    }
  }
  return out;
}
