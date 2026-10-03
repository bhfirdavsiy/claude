// P2.12 — the Content Studio draft (kimyolab.content-studio-draft.v1, ADR-P2-013 §6). A draft retains everything the
// governed pipeline needs — target learning unit, role, provenance, payload, validation, preview, review and package
// state — while the author only ever sees class and topic names. A draft NEVER mutates canonical learner content:
// it leaves the Studio only as a publish candidate that the existing human-only apply pipeline consumes.
import {sha256HexSync,utf8} from '../domain/content/sha256.ts';
import type {ContentRole} from './content-roles.ts';
import {overallStatus,type ExcerptPayload,type StudioFinding,type ValidationStatus} from './pdf-excerpt.ts';
import type {LabInstructionPayload} from './lab-instruction.ts';

export const STUDIO_DRAFT_SCHEMA='kimyolab.content-studio-draft.v1';

export type DraftPayload=
  | {kind:'TEXTBOOK_EXCERPT';excerpt:ExcerptPayload}
  | {kind:'LAB_INSTRUCTION';instruction:LabInstructionPayload};

export interface StudioDraft {
  schema:typeof STUDIO_DRAFT_SCHEMA;
  role:ContentRole;
  target:{learningUnitId:string|null};
  provenance:{basis:'AUTHOR_UPLOAD'|'CANONICAL_INSTRUCTION'|'AUTHOR_TEXT';canonicalActivityId:string|null;authorName:string};
  payload:DraftPayload;
  validation:{status:ValidationStatus;findings:StudioFinding[];revision:string|null};
  /** the author looked at the learner result of THIS revision */
  preview:{viewedRevision:string|null};
  /** human review happens outside the Studio; the Studio never marks anything reviewed */
  review:{state:'NOT_REVIEWED'};
  publish:{state:'DRAFT'|'PACKAGE_PREPARED';packageRevision:string|null};
}

export const sortKeys=(v:any):any=>Array.isArray(v)?v.map(sortKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortKeys(v[k])])):v;
export const canonicalJson=(v:unknown)=>JSON.stringify(sortKeys(v));

export function createDraft(role:'TEXTBOOK_EXCERPT'|'LAB_INSTRUCTION',payload:DraftPayload,learningUnitId:string|null=null):StudioDraft{
  if(payload.kind!==role) throw new Error('STUDIO_DRAFT_ROLE_PAYLOAD_MISMATCH');
  return {schema:STUDIO_DRAFT_SCHEMA,role,target:{learningUnitId},provenance:{basis:role==='TEXTBOOK_EXCERPT'?'AUTHOR_UPLOAD':'AUTHOR_TEXT',canonicalActivityId:null,authorName:''},payload,
    validation:{status:'MISSING_INFORMATION',findings:[],revision:null},preview:{viewedRevision:null},review:{state:'NOT_REVIEWED'},publish:{state:'DRAFT',packageRevision:null}};
}

/** The content revision: role + target + provenance + payload. Computed, hidden from the author, never typed. */
export function draftRevision(d:StudioDraft):string{
  return sha256HexSync(utf8(canonicalJson({role:d.role,target:d.target,provenance:d.provenance,payload:d.payload})));
}

export function withValidation(d:StudioDraft,findings:StudioFinding[]):StudioDraft{
  return {...d,validation:{status:overallStatus(findings),findings,revision:draftRevision(d)}};
}
export function markPreviewed(d:StudioDraft):StudioDraft{ return {...d,preview:{viewedRevision:draftRevision(d)}}; }

/** What still stands between this draft and a publish candidate (internal codes; the UI shows Uzbek text). */
export function packageBlockers(d:StudioDraft):string[]{
  const rev=draftRevision(d), out:string[]=[];
  if(d.validation.revision!==rev) out.push('NOT_CHECKED');
  else if(d.validation.status==='MISSING_INFORMATION') out.push('MISSING_INFORMATION');
  if(d.preview.viewedRevision!==rev) out.push('NOT_PREVIEWED');
  if(d.role==='TEXTBOOK_EXCERPT'&&!d.provenance.authorName.trim()) out.push('AUTHOR_MISSING');
  return out;
}
