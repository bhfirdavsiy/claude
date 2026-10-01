// P2.4 — a human-authored option set for one OPTION_SET_MISSING field (P2.1 queue). It reuses the structured-theory
// governance primitives exactly: the draft is one reviewable block (content + sourceRefs hashed), approval is DERIVED
// from a chemistry and a didactic review by two distinct humans (neither the author) pinned to the same hash, and any
// edit makes earlier reviews stale. The platform never proposes options or distractors: every option comes from the
// author. Browser-safe.
import {blockGovernance,blockContentHash} from '../domain/theory/structured-theory.ts';
import {isAutomationIdentity} from '../domain/governance/identity.ts';

export const OPTION_SET_DRAFT_SCHEMA='kimyolab.option-set-draft.v1';
export type OptionSetIssue='SCHEMA'|'OPTIONS_TOO_FEW'|'TARGET_NOT_IN_OPTIONS'|'DUPLICATE_OPTION'|'LABEL_MISSING'|'RATIONALE_MISSING'
  |'SOURCE_MISSING'|'AUTHOR_MISSING'|'AUTOMATION_AUTHOR'|'FIELD_UNKNOWN';

const isText=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;

/** Checks a draft against the queue field it answers. The canonical target is repository data; options are the author's. */
export function validateOptionSetDraft(draft:any,field:{activityId:string;field:string;canonicalTarget:string}|null):OptionSetIssue[]{
  const out:OptionSetIssue[]=[];
  if(!draft||draft.schema!==OPTION_SET_DRAFT_SCHEMA||!isText(draft.activityId)||!isText(draft.field)||!Array.isArray(draft.options)||!['draft','ready-for-review'].includes(draft.status)||!Array.isArray(draft.reviews)) return ['SCHEMA'];
  if(!field||field.activityId!==draft.activityId||field.field!==draft.field) out.push('FIELD_UNKNOWN');
  const values=draft.options.map((o:any)=>String(o?.value??'').trim());
  if(draft.options.length<2) out.push('OPTIONS_TOO_FEW');
  if(field&&!values.includes(field.canonicalTarget)) out.push('TARGET_NOT_IN_OPTIONS');
  if(new Set(values).size!==values.length||values.some((v:string)=>!v)) out.push('DUPLICATE_OPTION');
  if(draft.options.some((o:any)=>!isText(o?.label))) out.push('LABEL_MISSING');
  if(draft.options.some((o:any)=>String(o?.value).trim()!==field?.canonicalTarget&&!isText(o?.rationale))) out.push('RATIONALE_MISSING');
  if(!Array.isArray(draft.sourceRefs)||!draft.sourceRefs.some(isText)) out.push('SOURCE_MISSING');
  if(!isText(draft.authoredBy)) out.push('AUTHOR_MISSING'); else if(isAutomationIdentity(draft.authoredBy)) out.push('AUTOMATION_AUTHOR');
  return out;
}

/** The governed state of a draft: the shared dual-review rule over the draft's reviewable content. */
export function optionSetGovernance(draft:any){
  const {schema,activityId,field,...block}=draft??{};
  return {...blockGovernance(block),hash:blockContentHash(block)};
}
