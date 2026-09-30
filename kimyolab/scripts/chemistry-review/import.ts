// Imports HUMAN chemistry review decisions into content-src/chemistry-reviews.json (P1.7). The only writer of that
// register. It never creates a decision: it validates what a reviewer filled in (a person, the chemistry role, a
// comment for every non-approval, the CURRENT assertion hash) and appends it. Anything else is refused.
// P1.8: the hash is recomputed from content (the file's hash is only compared, never trusted), unknown fields are
// refused, two different decisions on one assertion in one file are a conflict, and candidate triage decisions go
// to their own register (content-src/chemistry-candidate-reviews.json) — they never add chemistry to the KB.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildKbReports,reviewCandidates,REVIEW_REGISTER_FILE,CANDIDATE_REGISTER_FILE} from '../lib/chemistry-kb.ts';
import {validateReviewRecord,validateCandidateRecord,CHEMISTRY_REVIEW_REGISTER_SCHEMA,CANDIDATE_REVIEW_REGISTER_SCHEMA} from '../../src/domain/chemistry/kb-review.ts';
import {automationContext} from '../../src/domain/assessment/governance.ts';

const filledOnly=(xs:any)=>(Array.isArray(xs)?xs:[]).filter((d:any)=>d&&d.decision!==null&&d.decision!==undefined);

/** Same id twice in one file with different outcomes = the file does not say what the reviewer decided. */
function conflicts(decisions:any[],idKey:string,code:string):string[]{
  const seen=new Map<string,string>();
  const out:string[]=[];
  for(const d of decisions){
    const k=String(d?.[idKey]);
    const v=JSON.stringify([d?.decision,d?.reviewerId]);
    if(seen.has(k)&&seen.get(k)!==v) out.push(`${code}:${k}`);
    seen.set(k,v);
  }
  return [...new Set(out)];
}

/** Validation only (no write): every issue a filled decision file has against the CURRENT knowledge base. */
export function validateChemistryDecisions(root:string,filled:any):{decisions:any[];candidateDecisions:any[];issues:string[]}{
  const decisions=filledOnly(filled?.decisions);
  const candidateDecisions=filledOnly(filled?.candidateDecisions);
  const r=buildKbReports(root);
  const current=new Map(r.assertions.map(a=>[a.id,a.hash]));
  const candidates=new Map(reviewCandidates(r.ionic).map(c=>[c.candidateId,c.candidateHash]));
  const issues:string[]=[];
  for(const d of decisions){
    issues.push(...validateReviewRecord(d));
    if(!current.has(d.assertionId)) issues.push(`CHEM_REVIEW_UNKNOWN_ASSERTION:${d.assertionId}`);
    else if(current.get(d.assertionId)!==d.assertionHash) issues.push(`CHEM_REVIEW_STALE_DECISION:${d.assertionId}`);
  }
  for(const d of candidateDecisions){
    issues.push(...validateCandidateRecord(d));
    if(!candidates.has(d.candidateId)) issues.push(`CANDIDATE_REVIEW_UNKNOWN:${d.candidateId}`);
    else if(candidates.get(d.candidateId)!==d.candidateHash) issues.push(`CANDIDATE_REVIEW_STALE_DECISION:${d.candidateId}`);
  }
  issues.push(...conflicts(decisions,'assertionId','CHEM_REVIEW_CONFLICT'),...conflicts(candidateDecisions,'candidateId','CANDIDATE_REVIEW_CONFLICT'));
  return {decisions,candidateDecisions,issues};
}

export function importDecisions(root:string,filled:any):{imported:number;importedCandidates:number;issues:string[]}{
  const {decisions,candidateDecisions,issues}=validateChemistryDecisions(root,filled);
  if(issues.length) return {imported:0,importedCandidates:0,issues};
  if(decisions.length){
    const file=path.join(root,REVIEW_REGISTER_FILE);
    const register=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schema:CHEMISTRY_REVIEW_REGISTER_SCHEMA,records:[]};
    register.records.push(...decisions.map((d:any)=>({assertionId:d.assertionId,assertionHash:d.assertionHash,decision:d.decision,reviewerId:d.reviewerId,reviewerRole:d.reviewerRole,reviewedAt:d.reviewedAt,...(d.comment?{comment:d.comment}:{})})));
    fs.writeFileSync(file,`${JSON.stringify(register,null,2)}\n`,'utf8');
  }
  if(candidateDecisions.length){
    const file=path.join(root,CANDIDATE_REGISTER_FILE);
    const register=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schema:CANDIDATE_REVIEW_REGISTER_SCHEMA,records:[]};
    register.records.push(...candidateDecisions.map((d:any)=>({candidateId:d.candidateId,candidateHash:d.candidateHash,decision:d.decision,reviewerId:d.reviewerId,reviewerRole:d.reviewerRole,reviewedAt:d.reviewedAt,...(d.comment?{comment:d.comment}:{})})));
    fs.writeFileSync(file,`${JSON.stringify(register,null,2)}\n`,'utf8');
  }
  return {imported:decisions.length,importedCandidates:candidateDecisions.length,issues:[]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=process.argv[2];
  if(!input){ console.error('usage: import.ts <filled decisions.json>'); process.exit(2); }
  const automation=automationContext(process.env);
  if(automation.length){ console.error(`REVIEW_IMPORT_REFUSED_IN_AUTOMATION: ${automation.join(', ')} — a person runs the import`); process.exit(1); }
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
  const out=importDecisions(root,JSON.parse(fs.readFileSync(path.resolve(input),'utf8')));
  if(out.issues.length){ for(const i of out.issues) console.error(i); process.exitCode=1; }
  else console.log(JSON.stringify({imported:out.imported,importedCandidates:out.importedCandidates}));
}
