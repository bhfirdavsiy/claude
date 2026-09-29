import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type TraceStatus='PASS'|'PARTIAL'|'NOT_IMPLEMENTED'|'REVIEW_PENDING'|'EXTERNAL_PENDING';
export type TraceRow={id:string;status:TraceStatus;module?:string;test?:string;gate?:string;note?:string};
export type Traceability={generatedAt?:string;total?:number;counts?:Record<string,number>;unmapped?:string[];rows:TraceRow[]};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const specPath=path.join(root,'docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md');
const reportPath=path.join(root,'reports/rc-traceability.json');
const outputPath=path.join(root,'reports/rc-preflight.json');
const validStatuses=new Set<TraceStatus>(['PASS','PARTIAL','NOT_IMPLEMENTED','REVIEW_PENDING','EXTERNAL_PENDING']);

export function extractRequirementIds(markdown:string){
  return [...new Set([...markdown.matchAll(/\b[A-Z][A-Z0-9]+-\d{3}\b/g)].map(m=>m[0]))];
}

export function evaluateRcTraceability(specIds:string[],report:Traceability){
  const rows=Array.isArray(report.rows)?report.rows:[];
  const ids=rows.map(row=>row.id);
  const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))].sort();
  const rowMap=new Map(rows.map(row=>[row.id,row]));
  const missing=specIds.filter(id=>!rowMap.has(id)).sort();
  const unknownStatus=rows.filter(row=>!validStatuses.has(row.status)).map(row=>row.id).sort();
  const incompleteMetadata=rows.filter(row=>!row.id||!row.module||!row.test||!row.gate).map(row=>row.id||'<missing-id>').sort();
  const pendingWithoutNote=rows.filter(row=>(row.status==='REVIEW_PENDING'||row.status==='EXTERNAL_PENDING')&&!row.note).map(row=>row.id).sort();
  const internalBlockers=rows.filter(row=>row.status==='PARTIAL'||row.status==='NOT_IMPLEMENTED').map(row=>row.id).sort();
  const reviewPending=rows.filter(row=>row.status==='REVIEW_PENDING').map(row=>row.id).sort();
  const externalPending=rows.filter(row=>row.status==='EXTERNAL_PENDING').map(row=>row.id).sort();
  const counts=Object.fromEntries([...validStatuses].map(status=>[status,rows.filter(row=>row.status===status).length]));
  const structuralIssues=[...missing.map(id=>`MISSING:${id}`),...duplicates.map(id=>`DUPLICATE:${id}`),...unknownStatus.map(id=>`UNKNOWN_STATUS:${id}`),...incompleteMetadata.map(id=>`INCOMPLETE_METADATA:${id}`),...pendingWithoutNote.map(id=>`PENDING_WITHOUT_NOTE:${id}`)];
  return {
    specRequirementCount:specIds.length,
    traceabilityRowCount:rows.length,
    counts,
    missing,
    duplicates,
    unknownStatus,
    incompleteMetadata,
    pendingWithoutNote,
    internalBlockers,
    reviewPending,
    externalPending,
    structuralIssues,
    internalReady:structuralIssues.length===0&&internalBlockers.length===0,
    stableReady:structuralIssues.length===0&&internalBlockers.length===0&&reviewPending.length===0&&externalPending.length===0,
  };
}

export function runRcPreflight(baseDir=root){
  const spec=fs.readFileSync(path.join(baseDir,'docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md'),'utf8');
  const trace:Traceability=JSON.parse(fs.readFileSync(path.join(baseDir,'reports/rc-traceability.json'),'utf8'));
  const result=evaluateRcTraceability(extractRequirementIds(spec),trace);
  const report={
    generatedAt:new Date().toISOString(),
    phase:11,
    name:'Release Candidate machine-readable preflight',
    technicalPreflight:result.internalReady?'GREEN':'RED',
    stableReleaseGate:result.stableReady?'GREEN':'PENDING',
    ...result,
  };
  fs.writeFileSync(path.join(baseDir,'reports/rc-preflight.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=runRcPreflight();
  console.log(JSON.stringify({technicalPreflight:report.technicalPreflight,stableReleaseGate:report.stableReleaseGate,counts:report.counts,internalBlockers:report.internalBlockers,reviewPending:report.reviewPending,externalPending:report.externalPending}));
  if(!report.internalReady) process.exitCode=1;
}
