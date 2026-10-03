// P2.12 — textbook excerpt lane (ADR-P2-013 §4). The author uploads an excerpt that a HUMAN has already cut; the Studio
// never detects pages, cuts, OCRs, extracts or maps anything. It checks that the bytes really are a readable PDF,
// computes the checksum itself and keeps the provenance and the publication-rights status explicit — an uploaded file
// is never assumed to be redistributable. Browser-safe (Uint8Array only): the Studio page and Node run this same code.
import {sha256HexSync} from '../domain/content/sha256.ts';

export const MAX_EXCERPT_BYTES=20*1024*1024;

export type FindingSeverity='READY'|'ATTENTION'|'UNSUPPORTED'|'MISSING'|'CONFLICT';
/** one validation finding; `messageKey` is the author-facing Uzbek text (content-studio catalog), `code` stays internal */
export interface StudioFinding { severity:FindingSeverity; code:string; messageKey:string; field?:string }
export type ValidationStatus='READY'|'ATTENTION_REQUIRED'|'UNSUPPORTED'|'MISSING_INFORMATION'|'SOURCE_CONFLICT';

export function overallStatus(findings:readonly StudioFinding[]):ValidationStatus{
  const has=(s:FindingSeverity)=>findings.some(f=>f.severity===s);
  if(has('CONFLICT')) return 'SOURCE_CONFLICT';
  if(has('MISSING')) return 'MISSING_INFORMATION';
  if(has('UNSUPPORTED')) return 'UNSUPPORTED';
  if(has('ATTENTION')) return 'ATTENTION_REQUIRED';
  return 'READY';
}

const ascii=(bytes:Uint8Array,from:number,to:number)=>{ let s=''; for(let i=Math.max(0,from);i<Math.min(bytes.length,to);i++) s+=String.fromCharCode(bytes[i]!); return s; };

export interface PdfInspection {
  ok:boolean;
  /** internal reason when not ok */
  reason:null|'EMPTY'|'TOO_LARGE'|'NOT_PDF'|'TRUNCATED'|'ENCRYPTED';
  version:string|null;
  bytes:number;
  sha256:string;
  /** markers of active content; the Studio never executes them, a human must look at such a file */
  activeContent:string[];
}

/** Inspects the bytes only: signature, end marker, encryption, active-content markers. Nothing is executed or parsed
 *  beyond that; the file is never rendered by the Studio's own code (the learner's PDF viewer is the browser's). */
export function inspectPdf(bytes:Uint8Array):PdfInspection{
  const sha256=sha256HexSync(bytes);
  const base={bytes:bytes.length,sha256,activeContent:[] as string[],version:null as string|null};
  if(!bytes.length) return {...base,ok:false,reason:'EMPTY'};
  if(bytes.length>MAX_EXCERPT_BYTES) return {...base,ok:false,reason:'TOO_LARGE'};
  // the header must be at the very start (stricter than the 1024-byte tolerance some readers allow)
  const head=ascii(bytes,0,16);
  const m=/^%PDF-(\d\.\d)/.exec(head);
  if(!m) return {...base,ok:false,reason:'NOT_PDF'};
  const tail=ascii(bytes,bytes.length-1024,bytes.length);
  if(!tail.includes('%%EOF')) return {...base,ok:false,reason:'TRUNCATED',version:m[1]!};
  const body=ascii(bytes,0,bytes.length);
  if(/\/Encrypt\b/.test(body)) return {...base,ok:false,reason:'ENCRYPTED',version:m[1]!};
  const activeContent=['/JavaScript','/JS','/Launch','/EmbeddedFile','/RichMedia','/XFA'].filter(k=>new RegExp(`${k.replace('/','\\/')}\\b`).test(body));
  return {...base,ok:true,reason:null,version:m[1]!,activeContent};
}

/** A safe file name: no directories, no control characters, no leading dots, ASCII only, `.pdf` extension. */
export function sanitizeFileName(name:string):string{
  const base=String(name??'').split(/[\\/]/).pop()!.normalize('NFKD').replace(/[̀-ͯ]/g,'');
  // Uzbek apostrophes (o‘, g‘, ʼ) are dropped rather than turned into separators
  const stem=base.replace(/[‘’ʻʼ'`]/g,'').replace(/\.pdf$/i,'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/\.{2,}/g,'.').replace(/^[-.]+|[-.]+$/g,'').slice(0,80);
  return `${stem||'darslik-qismi'}.pdf`;
}

export interface ExcerptPayload {
  title:string;
  source:{title:string;authority:string;edition?:string;year?:number};
  /** optional original page range in the printed book */
  pageRange:null|{from:number;to:number};
  file:null|{originalName:string;safeName:string;bytes:number;sha256:string;pdfVersion:string|null;activeContent:string[]};
  /** publication rights are explicit: NOT_DOCUMENTED until a human documents the basis */
  rights:{status:'NOT_DOCUMENTED'|'DOCUMENTED';basis:string};
}

export function emptyExcerpt():ExcerptPayload{
  return {title:'',source:{title:'',authority:''},pageRange:null,file:null,rights:{status:'NOT_DOCUMENTED',basis:''}};
}

/** Attach an uploaded file: inspected, checksummed and named by the machine — never by the author. */
export function attachPdf(payload:ExcerptPayload,originalName:string,bytes:Uint8Array):{payload:ExcerptPayload;inspection:PdfInspection}{
  const inspection=inspectPdf(bytes);
  if(!inspection.ok) return {payload:{...payload,file:null},inspection};
  return {payload:{...payload,file:{originalName:String(originalName).split(/[\\/]/).pop()!.slice(0,200),safeName:sanitizeFileName(originalName),bytes:inspection.bytes,sha256:inspection.sha256,pdfVersion:inspection.version,activeContent:inspection.activeContent}},inspection};
}

const text=(v:unknown)=>typeof v==='string'&&v.trim().length>0;

/** Validation never creates facts: it says what is missing, what needs a human, and what is ready. */
export function validateExcerpt(p:ExcerptPayload,target:{learningUnitId:string|null}):StudioFinding[]{
  const out:StudioFinding[]=[];
  if(!target.learningUnitId) out.push({severity:'MISSING',code:'TOPIC_MISSING',messageKey:'studio.check.topic-missing',field:'topic'});
  if(!text(p.title)) out.push({severity:'MISSING',code:'TITLE_MISSING',messageKey:'studio.check.title-missing',field:'title'});
  if(!text(p.source.title)) out.push({severity:'MISSING',code:'SOURCE_TITLE_MISSING',messageKey:'studio.check.source-title-missing',field:'source-title'});
  if(!text(p.source.authority)) out.push({severity:'MISSING',code:'SOURCE_AUTHORITY_MISSING',messageKey:'studio.check.source-authority-missing',field:'source-authority'});
  if(p.source.year!==undefined&&!(Number.isInteger(p.source.year)&&p.source.year>=1900&&p.source.year<=2100)) out.push({severity:'MISSING',code:'SOURCE_YEAR_INVALID',messageKey:'studio.check.year-invalid',field:'source-year'});
  if(p.pageRange&&!(Number.isInteger(p.pageRange.from)&&Number.isInteger(p.pageRange.to)&&p.pageRange.from>=1&&p.pageRange.to>=p.pageRange.from)) out.push({severity:'MISSING',code:'PAGE_RANGE_INVALID',messageKey:'studio.check.page-range-invalid',field:'page-from'});
  if(!p.file) out.push({severity:'MISSING',code:'FILE_MISSING',messageKey:'studio.check.file-missing',field:'file'});
  else if(p.file.activeContent.length) out.push({severity:'ATTENTION',code:'PDF_ACTIVE_CONTENT',messageKey:'studio.check.pdf-active-content',field:'file'});
  // a human must document the right to publish the excerpt; the Studio never assumes it
  if(p.rights.status!=='DOCUMENTED'||!text(p.rights.basis)) out.push({severity:'ATTENTION',code:'RIGHTS_NOT_DOCUMENTED',messageKey:'studio.check.rights-not-documented',field:'rights'});
  // provenance: the source itself must be accepted by a human through the governed source intake
  out.push({severity:'ATTENTION',code:'SOURCE_ACCEPTANCE_REQUIRED',messageKey:'studio.check.source-acceptance-required'});
  return out;
}

/** The learner-side model of an excerpt (kimyolab.textbook-excerpt.v1) — what the learner renderer draws. */
export interface TextbookExcerptRecord {
  schema:'kimyolab.textbook-excerpt.v1';
  learningUnitId:string;
  title:string;
  source:ExcerptPayload['source'];
  pageRange:ExcerptPayload['pageRange'];
  file:{name:string;bytes:number;sha256:string};
}
export const TEXTBOOK_EXCERPT_SCHEMA='kimyolab.textbook-excerpt.v1';

export function excerptRecord(p:ExcerptPayload,learningUnitId:string):TextbookExcerptRecord|null{
  if(!p.file) return null;
  return {schema:TEXTBOOK_EXCERPT_SCHEMA,learningUnitId,title:p.title.trim(),source:{...p.source,title:p.source.title.trim(),authority:p.source.authority.trim()},pageRange:p.pageRange?{...p.pageRange}:null,file:{name:p.file.safeName,bytes:p.file.bytes,sha256:p.file.sha256}};
}
