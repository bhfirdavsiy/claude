// P2.12 — textbook excerpt lane (ADR-P2-013 §4). The author uploads an excerpt that a HUMAN has already cut; the Studio
// never detects pages, cuts, OCRs, extracts or maps anything. It checks the PDF envelope and its document structure,
// refuses encrypted, active/interactive or structurally unprovable files (fail closed), computes the checksum itself and keeps the provenance and the publication-rights status explicit — an uploaded file
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

const ascii=(bytes:Uint8Array,from:number,to:number)=>{
  const a=Math.max(0,from), b=Math.min(bytes.length,to); let s='';
  for(let i=a;i<b;i+=8192) s+=String.fromCharCode.apply(null,Array.from(bytes.subarray(i,Math.min(b,i+8192))));
  return s;
};

export type PdfRejection='EMPTY'|'TOO_LARGE'|'NOT_PDF'|'TRUNCATED'|'ENCRYPTED'|'MALFORMED'|'UNSUPPORTED_STRUCTURE'|'ACTIVE_CONTENT';

export interface PdfInspection {
  ok:boolean;
  /** internal reason when not ok */
  reason:null|PdfRejection;
  version:string|null;
  bytes:number;
  sha256:string;
  /** active/interactive content found; any entry rejects the file (fail closed, the bytes are never rewritten) */
  activeContent:string[];
  /** the proven document structure when ok (cross-reference sections, objects at their recorded offsets) */
  structure:null|{crossReferenceSections:number;objects:number};
}

/** Names that make a PDF active or interactive: scripts, launches, embedded or attached files, rich media, forms
 *  and form submission, remote go-to, multimedia, automatic event actions. A DENY LIST over the dictionaries the
 *  scan can see — not a proof of safety, which is why compressed object storage (invisible to the scan) is refused. */
export const ACTIVE_PDF_NAMES=['JavaScript','JS','Launch','EmbeddedFile','EmbeddedFiles','FileAttachment','RichMedia','XFA','AcroForm','SubmitForm','ImportData','GoToR','GoToE','Rendition','Movie','Sound','3D','AA'] as const;

/** every PDF name token (`/Name`) with `#xx` escapes decoded, so `/J#61vaScript` is seen as `/JavaScript` */
function pdfNames(body:string):Set<string>{
  const out=new Set<string>();
  for(const m of body.matchAll(/\/([^\s\/<>\[\]()%{}]*)/g)) out.add(m[1]!.replace(/#([0-9A-Fa-f]{2})/g,(_,h:string)=>String.fromCharCode(parseInt(h,16))));
  return out;
}

/** end index (exclusive) of the dictionary that starts at `p` (`<<`), skipping strings and comments; -1 when broken */
function dictEnd(s:string,p:number):number{
  if(s.slice(p,p+2)!=='<<') return -1;
  let depth=0;
  for(let i=p;i<s.length;i++){
    const c=s[i];
    if(c==='<'&&s[i+1]==='<'){ depth++; i++; continue; }
    if(c==='>'&&s[i+1]==='>'){ depth--; i++; if(depth===0) return i+1; continue; }
    if(c==='('){ let n=1; for(i++;i<s.length&&n>0;i++){ if(s[i]==='\\'){ i++; continue; } if(s[i]==='(') n++; else if(s[i]===')') n--; } i--; if(n) return -1; continue; }
    if(c==='<'){ const e=s.indexOf('>',i); if(e<0) return -1; i=e; continue; }
    if(c==='%'){ while(i<s.length&&s[i]!=='\n'&&s[i]!=='\r') i++; continue; }
  }
  return -1;
}

type Structure={ok:true;crossReferenceSections:number;objects:number;streamData:Array<[number,number]>}|{ok:false;reason:'MALFORMED'|'UNSUPPORTED_STRUCTURE'};

/** The structural check (no content interpretation): `startxref` → a classic cross-reference table (following `/Prev`
 *  for incremental updates) → every in-use object really starts at its recorded offset with its own number →
 *  the trailer `/Root` is a `/Catalog` whose `/Pages` is a page tree with at least one page. Cross-reference streams
 *  and hybrid files are refused (UNSUPPORTED_STRUCTURE): their objects can be compressed, and a compressed object is
 *  invisible to the active-content scan. A header plus `%%EOF` with nothing valid in between is MALFORMED. */
function checkStructure(s:string):Structure{
  const bad={ok:false as const,reason:'MALFORMED' as const}, unsupported={ok:false as const,reason:'UNSUPPORTED_STRUCTURE' as const};
  const sx=s.lastIndexOf('startxref');
  if(sx<0||sx<s.length-1024) return bad;
  const m=/^startxref\s+(\d+)\s+%%EOF/.exec(s.slice(sx));
  if(!m) return bad;
  const entries=new Map<number,{offset:number;gen:number;inUse:boolean}>();
  const seen=new Set<number>(); let root:null|{num:number;gen:number}=null; let off=Number(m[1]); let sections=0;
  while(true){
    if(!Number.isSafeInteger(off)||off<=0||off>=s.length||seen.has(off)||sections>=64) return bad;
    seen.add(off); sections++;
    const head=s.slice(off,off+64);
    if(/^\s*\d+\s+\d+\s+obj\b/.test(head)) return unsupported;
    const x=/^\s*xref[ \t]*(?:\r\n|\r|\n)/.exec(head); if(!x) return bad;
    let p=off+x[0].length;
    const sub=/[ \t]*(\d+)[ \t]+(\d+)[ \t]*(?:\r\n|\r|\n)/y, row=/(\d{10})[ ]+(\d{5})[ ]+([nf])[ \t]*(?:\r\n|\r|\n)/y, tr=/\s*trailer\s*/y;
    while(true){
      tr.lastIndex=p; if(tr.test(s)){ p=tr.lastIndex; break; }
      sub.lastIndex=p; const h=sub.exec(s); if(!h) return bad;
      p=sub.lastIndex; const first=Number(h[1]), count=Number(h[2]);
      for(let k=0;k<count;k++){
        row.lastIndex=p; const r=row.exec(s); if(!r) return bad;
        p=row.lastIndex;
        // newest section first: an entry already known from a later update wins
        if(!entries.has(first+k)) entries.set(first+k,{offset:Number(r[1]),gen:Number(r[2]),inUse:r[3]==='n'});
      }
    }
    const e=dictEnd(s,p); if(e<0) return bad;
    const trailer=s.slice(p,e);
    if(pdfNames(trailer).has('XRefStm')) return unsupported;
    if(!root){ const r=/\/Root\s+(\d+)\s+(\d+)\s+R\b/.exec(trailer); if(r) root={num:Number(r[1]),gen:Number(r[2])}; }
    const prev=/\/Prev\s+(\d+)/.exec(trailer);
    if(!prev) break;
    off=Number(prev[1]);
  }
  if(!root) return bad;
  let objects=0; const streamData:Array<[number,number]>=[];
  const at=/\s*(\d+)\s+(\d+)\s+obj\b/y, st=/\s*stream(?:\r\n|\n)/y;
  for(const [num,e] of entries){
    if(!e.inUse) continue;
    if(num===0||e.offset<=0||e.offset>=s.length) return bad;
    at.lastIndex=e.offset; const o=at.exec(s);
    if(!o||Number(o[1])!==num||Number(o[2])!==e.gen) return bad;
    objects++;
    // the raw data of a stream object: bounded by its direct /Length when given, never past the first `endstream`
    const p=s.slice(at.lastIndex,at.lastIndex+64).search(/\S/)+at.lastIndex;
    if(s.slice(p,p+2)!=='<<') continue;
    const d=dictEnd(s,p); if(d<0) return bad;
    st.lastIndex=d; if(!st.exec(s)) continue;
    const from=st.lastIndex, endKw=s.indexOf('endstream',from); if(endKw<0) return bad;
    const len=/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(s.slice(p,d));
    streamData.push([from,len?Math.min(endKw,from+Number(len[1])):endKw]);
  }
  const dictOf=(ref:{num:number;gen:number})=>{
    const e=entries.get(ref.num); if(!e||!e.inUse||e.gen!==ref.gen) return null;
    at.lastIndex=e.offset; if(!at.exec(s)) return null;
    const p=s.slice(at.lastIndex).search(/\S/)+at.lastIndex; const end=dictEnd(s,p);
    return end<0?null:s.slice(p,end);
  };
  const catalog=dictOf(root);
  if(!catalog||!/\/Type\s*\/Catalog\b/.test(catalog)) return bad;
  const pr=/\/Pages\s+(\d+)\s+(\d+)\s+R\b/.exec(catalog); if(!pr) return bad;
  const pages=dictOf({num:Number(pr[1]),gen:Number(pr[2])});
  const count=pages?/\/Count\s+(\d+)/.exec(pages):null;
  if(!pages||!/\/Type\s*\/Pages\b/.test(pages)||!/\/Kids\s*\[/.test(pages)||!count||Number(count[1])<1) return bad;
  return {ok:true,crossReferenceSections:sections,objects,streamData};
}

/** Inspects the bytes only — envelope, encryption, active content, structure. Nothing is executed, rendered,
 *  extracted or rewritten. Any doubt rejects the file (fail closed); a rejected file is never shown or packaged. */
export function inspectPdf(bytes:Uint8Array):PdfInspection{
  const sha256=sha256HexSync(bytes);
  const base={bytes:bytes.length,sha256,activeContent:[] as string[],version:null as string|null,structure:null};
  const no=(reason:PdfRejection,extra:Partial<PdfInspection>={}):PdfInspection=>({...base,...extra,ok:false,reason});
  if(!bytes.length) return no('EMPTY');
  if(bytes.length>MAX_EXCERPT_BYTES) return no('TOO_LARGE');
  // envelope: the header at the very start (stricter than the 1024-byte tolerance some readers allow), %%EOF at the end
  const m=/^%PDF-(\d\.\d)/.exec(ascii(bytes,0,16));
  if(!m) return no('NOT_PDF');
  const version=m[1]!;
  if(!ascii(bytes,bytes.length-1024,bytes.length).includes('%%EOF')) return no('TRUNCATED',{version});
  const body=ascii(bytes,0,bytes.length);
  if(pdfNames(body).has('Encrypt')) return no('ENCRYPTED',{version});
  const st=checkStructure(body);
  if(!st.ok) return no(st.reason,{version});
  // the scan reads everything except raw stream data (page drawings, images, fonts): dictionaries never live there,
  // except inside compressed object streams — and those are refused below
  let scoped='', last=0;
  for(const [a,b] of [...st.streamData].sort((x,y)=>x[0]-y[0])){ if(a>last) scoped+=body.slice(last,a); scoped+=' '; last=Math.max(last,b); }
  scoped+=body.slice(last);
  const names=pdfNames(scoped);
  const activeContent:string[]=ACTIVE_PDF_NAMES.filter(n=>names.has(n)).map(n=>`/${n}`);
  // an /OpenAction that is an action (a dictionary or a reference), not a plain destination array, is active too
  if(/\/OpenAction\s*(?:<<|\d+\s+\d+\s+R)/.test(scoped)) activeContent.push('/OpenAction');
  if(activeContent.length) return no('ACTIVE_CONTENT',{version,activeContent});
  // compressed object storage hides dictionaries from the scan: refused rather than trusted
  if(names.has('ObjStm')||names.has('XRef')) return no('UNSUPPORTED_STRUCTURE',{version});
  return {...base,ok:true,reason:null,version,structure:{crossReferenceSections:st.crossReferenceSections,objects:st.objects}};
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
  // attachPdf never accepts active content; a draft that still carries some (edited by hand) is refused, never "attention"
  else if(p.file.activeContent.length) out.push({severity:'UNSUPPORTED',code:'PDF_ACTIVE_CONTENT_REJECTED',messageKey:'studio.check.pdf-active-content',field:'file'});
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
