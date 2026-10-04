// P2.12 — "Nashrga tayyorlash": the honest publish boundary (ADR-P2-013 §8). The browser cannot write canonical content
// and must not pretend to. The Studio produces a DETERMINISTIC publish candidate (kimyolab.studio-publish-candidate.v1)
// that the existing human-only pipeline consumes:
//   textbook excerpt → a kimyolab.source-intake.v1 entry (source:queue → human review → source:apply) + the excerpt
//                      record and its PDF, held until the remaining human gates exist and pass
//   lab instruction  → the instruction draft + the derived profile preview and round-trip evidence for the chemistry and
//                      didactic reviewers
// No approval, review, rights decision or identity is created here. Same draft → byte-identical candidate.
import {sha256HexSync,utf8} from '../domain/content/sha256.ts';
import {SOURCE_INTAKE_SCHEMA,validateSourceIntake} from '../authoring/source-intake.ts';
import {canonicalJson,draftRevision,packageBlockers,sortKeys,STUDIO_DRAFT_SCHEMA,type StudioDraft} from './draft.ts';
import {excerptRecord,inspectPdf,overallStatus,validateExcerpt} from './pdf-excerpt.ts';
import {labDerived,labFindings} from './lab-instruction.ts';
import type {CapabilityRegistry} from '../domain/lab/capability-registry.ts';
import type {TopicLabProfile} from '../domain/lab/topic-lab-profile.ts';

export const PUBLISH_CANDIDATE_SCHEMA='kimyolab.studio-publish-candidate.v1';

const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes:Uint8Array):string{
  let out='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i]!, b=bytes[i+1], c=bytes[i+2];
    const n=(a<<16)|((b??0)<<8)|(c??0);
    out+=B64[(n>>18)&63]!+B64[(n>>12)&63]!+(b===undefined?'=':B64[(n>>6)&63]!)+(c===undefined?'=':B64[n&63]!);
  }
  return out;
}
export function fromBase64(s:string):Uint8Array{
  const clean=s.replace(/=+$/,''); const out=new Uint8Array(Math.floor(clean.length*3/4)); let o=0;
  for(let i=0;i<clean.length;i+=4){
    const n=(B64.indexOf(clean[i]!)<<18)|(B64.indexOf(clean[i+1]!)<<12)|((i+2<clean.length?B64.indexOf(clean[i+2]!):0)<<6)|(i+3<clean.length?B64.indexOf(clean[i+3]!):0);
    out[o++]=(n>>16)&255; if(i+2<clean.length) out[o++]=(n>>8)&255; if(i+3<clean.length) out[o++]=n&255;
  }
  return out;
}

const slug=(s:string)=>s.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'darslik';

/** The source-intake entry for an excerpt's source: status draft, no reviews — a human submits and another human
 *  accepts it through the governed intake (ADR-P2-005). Ids and hashes are machine-computed, never authored. */
export function excerptSourceIntake(d:StudioDraft):Record<string,unknown>|null{
  if(d.payload.kind!=='TEXTBOOK_EXCERPT'||!d.payload.excerpt.file) return null;
  const e=d.payload.excerpt;
  const sourceId=`src.textbook.${slug(e.source.title)}${e.source.year?`.${e.source.year}`:''}`;
  return sortKeys({schema:SOURCE_INTAKE_SCHEMA,sourceId,category:'TEXTBOOK',title:e.source.title.trim(),authority:e.source.authority.trim(),...(e.source.edition?{edition:e.source.edition.trim()}:{}),...(e.source.year?{year:e.source.year}:{}),
    language:'uz-Latn',bibliographic:{},locator:{kind:e.pageRange?'page':'none'},document:{fileName:e.file!.safeName,sha256:e.file!.sha256},submittedBy:d.provenance.authorName.trim(),status:'draft',reviews:[]});
}

export interface PublishCandidate {
  schema:typeof PUBLISH_CANDIDATE_SCHEMA;
  draft:StudioDraft;
  draftRevision:string;
  derived:Record<string,unknown>;
  files:Array<{name:string;sha256:string;bytes:number;base64:string}>;
  humanGates:Array<{gate:string;status:'REQUIRED'}>;
  applyBoundary:{canonicalWriteFromStudio:false;consumers:string[];stillNeededForOneClickPublish:string[]};
  candidateRevision:string;
}

/** The fixed frame of a candidate per lane: human gates, consumers and what is still missing. Never authored. */
export function candidateFrame(kind:'TEXTBOOK_EXCERPT'|'LAB_INSTRUCTION'){
  if(kind==='TEXTBOOK_EXCERPT') return {
    humanGates:['source acceptance (governed source intake: source:queue → human review → source:apply)','publication rights documented by a human','didactic review of the excerpt for this topic'],
    consumers:['content-src/source-intake/<sourceId>.json → npm run source:queue / source:apply (human only)'],
    needed:['an excerpt apply command (human only) that writes the excerpt record and its PDF into the content pack after the gates above','a learner hub entry point that lists published excerpts per topic','a documented rights register for textbook excerpts'],
  };
  return {
    humanGates:['chemistry review of the instruction and its lab view','didactic review'],
    consumers:['the instruction text → content-src/practice-activities.json legacyContent (governed authoring, P1.9)','the topic lab profile overlay → content-src/topic-lab-profiles.json (authored by a human; compiled and validated by npm run lab:inventory)'],
    needed:['a human-only apply command for instruction drafts','profile authoring for instructions that have no lab profile yet (trials, apparatus, substances are human decisions)'],
  };
}

/** The derived part of an excerpt candidate — a pure function of the draft, so the checker can recompute it. */
export function excerptDerived(d:StudioDraft):Record<string,unknown>{
  return {sourceIntake:excerptSourceIntake(d),excerptRecord:d.payload.kind==='TEXTBOOK_EXCERPT'&&d.target.learningUnitId?excerptRecord(d.payload.excerpt,d.target.learningUnitId):null};
}

/** Builds the candidate, or returns the blockers. `pdf` must be the bytes whose checksum the draft recorded and they
 *  are inspected again: a rejected (malformed, unprovable, encrypted, active) PDF never becomes part of a candidate. */
export function buildPublishCandidate(d:StudioDraft,extra:{pdf?:Uint8Array;labDerived?:Record<string,unknown>}={}):{candidate:PublishCandidate|null;blockers:string[]}{
  const blockers=packageBlockers(d);
  const files:PublishCandidate['files']=[];
  let derived:Record<string,unknown>={};
  if(d.payload.kind==='TEXTBOOK_EXCERPT'){
    const f=d.payload.excerpt.file;
    if(!f||!extra.pdf) blockers.push('FILE_MISSING');
    else if(sha256HexSync(extra.pdf)!==f.sha256) blockers.push('FILE_CHECKSUM_MISMATCH');
    else if(!inspectPdf(extra.pdf).ok||f.activeContent.length) blockers.push('PDF_REJECTED');
    const intake=excerptSourceIntake(d);
    if(intake&&validateSourceIntake(intake).length) blockers.push('SOURCE_INTAKE_INVALID');
    if(!blockers.length&&f&&extra.pdf) files.push({name:f.safeName,sha256:f.sha256,bytes:f.bytes,base64:base64(extra.pdf)});
    derived=excerptDerived(d);
  }else{
    derived=extra.labDerived??{};
  }
  if(blockers.length) return {candidate:null,blockers:[...new Set(blockers)]};
  const frame=candidateFrame(d.payload.kind);
  const body={schema:PUBLISH_CANDIDATE_SCHEMA as typeof PUBLISH_CANDIDATE_SCHEMA,draft:{...d,publish:{state:'PACKAGE_PREPARED' as const,packageRevision:null}},draftRevision:draftRevision(d),derived,files,
    humanGates:frame.humanGates.map(gate=>({gate,status:'REQUIRED' as const})),applyBoundary:{canonicalWriteFromStudio:false as const,consumers:frame.consumers,stillNeededForOneClickPublish:frame.needed}};
  const candidateRevision=sha256HexSync(utf8(canonicalJson(body)));
  return {candidate:{...body,candidateRevision},blockers:[]};
}

/** Deterministic serialisation (sorted keys) — the file the author downloads. */
export const serializeCandidate=(c:PublishCandidate)=>`${canonicalJson(c)}\n`;

/** Repository context for a lab candidate: the capability registry and the topic's canonical lab profile. */
export interface LabCheckContext { registry:CapabilityRegistry; profileFor:(learningUnitId:string|null)=>TopicLabProfile|null }

const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);

/** Re-verifies a candidate (any environment; writes nothing). Fails closed with internal problem codes. It proves that
 *  the candidate was checked and previewed for the exact draft it contains, recomputes everything derived from that
 *  draft (validation, excerpt record, source intake, lab facts), re-inspects the embedded PDF, and refuses any preset
 *  gate, review or apply boundary. A lab candidate needs the repository context (`studio:check` supplies it). */
export function verifyPublishCandidate(raw:any,lab?:LabCheckContext):string[]{
  // a candidate missing a part a check reads is refused, never trusted (fail closed)
  try{ return verifyCandidate(raw,lab); }catch{ return ['CANDIDATE_UNREADABLE']; }
}
function verifyCandidate(raw:any,lab?:LabCheckContext):string[]{
  const out:string[]=[];
  if(raw?.schema!==PUBLISH_CANDIDATE_SCHEMA) return ['SCHEMA'];
  const {candidateRevision,...body}=raw;
  if(sha256HexSync(utf8(canonicalJson(body)))!==candidateRevision) out.push('CANDIDATE_REVISION_MISMATCH');
  const d=raw.draft;
  const kind=d?.payload?.kind;
  if(d?.schema!==STUDIO_DRAFT_SCHEMA||(kind!=='TEXTBOOK_EXCERPT'&&kind!=='LAB_INSTRUCTION')||d.role!==kind) return [...out,'DRAFT_SHAPE'];
  // the candidate is bound to the exact draft it carries: its revision, the check and the preview of that revision
  const rev=draftRevision(d);
  if(raw.draftRevision!==rev) out.push('DRAFT_REVISION_MISMATCH');
  if(d.validation?.revision!==raw.draftRevision) out.push('VALIDATION_REVISION_MISMATCH');
  if(d.preview?.viewedRevision!==raw.draftRevision) out.push('PREVIEW_REVISION_MISMATCH');
  if(!same(d.publish,{state:'PACKAGE_PREPARED',packageRevision:null})) out.push('PUBLISH_STATE');
  for(const f of raw.files??[]){ const b=fromBase64(f.base64); if(b.length!==f.bytes||sha256HexSync(b)!==f.sha256) out.push(`FILE_CHECKSUM_MISMATCH:${f.name}`); }
  if(kind==='TEXTBOOK_EXCERPT'){
    const findings=validateExcerpt(d.payload.excerpt,d.target);
    if(d.validation.status!==overallStatus(findings)||!same(d.validation.findings,findings)) out.push('VALIDATION_RESULT_MISMATCH');
    if(overallStatus(findings)==='MISSING_INFORMATION') out.push('VALIDATION_INCOMPLETE');
    if(!String(d.provenance?.authorName??'').trim()) out.push('AUTHOR_MISSING');
    const df=d.payload.excerpt.file, files=raw.files??[];
    if(!df||files.length!==1) out.push('FILE_COUNT');
    else{
      const f=files[0];
      if(f.name!==df.safeName||f.sha256!==df.sha256||f.bytes!==df.bytes) out.push('FILE_METADATA_MISMATCH');
      const ins=inspectPdf(fromBase64(f.base64));
      if(!ins.ok) out.push(`PDF_REJECTED:${ins.reason}`);
      else if(ins.sha256!==df.sha256||ins.version!==df.pdfVersion||df.activeContent.length) out.push('FILE_METADATA_MISMATCH');
    }
    // derived data is recomputed from the draft, never trusted because it sits inside the candidate hash
    const expected=excerptDerived(d);
    if(!same(raw.derived?.sourceIntake,expected.sourceIntake)) out.push('DERIVED_SOURCE_INTAKE_MISMATCH');
    if(!same(raw.derived?.excerptRecord,expected.excerptRecord)) out.push('DERIVED_EXCERPT_RECORD_MISMATCH');
    if(!same(Object.keys(raw.derived??{}).sort(),Object.keys(expected).sort())) out.push('DERIVED_SHAPE');
    if(raw.derived?.sourceIntake){ const issues=validateSourceIntake(raw.derived.sourceIntake); if(issues.length) out.push(...issues.map((i:any)=>`SOURCE_INTAKE:${i.code}`)); }
  }else{
    if((raw.files??[]).length) out.push('FILE_COUNT');
    if(!lab) out.push('LAB_REANALYSIS_REQUIRED');
    else{
      const canonical=lab.profileFor(d.target?.learningUnitId??null);
      const findings=labFindings(d.payload.instruction,d.target,lab.registry,canonical);
      if(d.validation.status!==overallStatus(findings)||!same(d.validation.findings,findings)) out.push('VALIDATION_RESULT_MISMATCH');
      if(overallStatus(findings)==='MISSING_INFORMATION') out.push('VALIDATION_INCOMPLETE');
      if(!same(raw.derived,labDerived(d.payload.instruction,lab.registry,canonical))) out.push('DERIVED_LAB_MISMATCH');
    }
  }
  const frame=candidateFrame(kind);
  if(raw.applyBoundary?.canonicalWriteFromStudio!==false||!same(raw.applyBoundary,{canonicalWriteFromStudio:false,consumers:frame.consumers,stillNeededForOneClickPublish:frame.needed})) out.push('APPLY_BOUNDARY');
  if((raw.humanGates??[]).some((g:any)=>g.status!=='REQUIRED')) out.push('HUMAN_GATE_PRESET');
  else if(!same(raw.humanGates,frame.humanGates.map(gate=>({gate,status:'REQUIRED'})))) out.push('HUMAN_GATES_MISMATCH');
  if(d.review?.state!=='NOT_REVIEWED') out.push('REVIEW_PRESET');
  return out;
}
