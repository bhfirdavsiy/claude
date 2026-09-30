// Imports HUMAN chemistry review decisions into content-src/chemistry-reviews.json (P1.7). The only writer of that
// register. It never creates a decision: it validates what a reviewer filled in (a person, the chemistry role, a
// comment for every non-approval, the CURRENT assertion hash) and appends it. Anything else is refused.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildKbReports,REVIEW_REGISTER_FILE} from '../lib/chemistry-kb.ts';
import {validateReviewRecord,CHEMISTRY_REVIEW_REGISTER_SCHEMA} from '../../src/domain/chemistry/kb-review.ts';

export function importDecisions(root:string,filled:any):{imported:number;issues:string[]}{
  const decisions=(filled?.decisions??[]).filter((d:any)=>d&&d.decision!==null&&d.decision!==undefined);
  const {assertions}=buildKbReports(root);
  const current=new Map(assertions.map(a=>[a.id,a.hash]));
  const issues:string[]=[];
  for(const d of decisions){
    issues.push(...validateReviewRecord(d));
    if(!current.has(d.assertionId)) issues.push(`CHEM_REVIEW_UNKNOWN_ASSERTION:${d.assertionId}`);
    else if(current.get(d.assertionId)!==d.assertionHash) issues.push(`CHEM_REVIEW_STALE_DECISION:${d.assertionId}`);
  }
  if(issues.length) return {imported:0,issues};
  const file=path.join(root,REVIEW_REGISTER_FILE);
  const register=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{schema:CHEMISTRY_REVIEW_REGISTER_SCHEMA,records:[]};
  register.records.push(...decisions.map((d:any)=>({assertionId:d.assertionId,assertionHash:d.assertionHash,decision:d.decision,reviewerId:d.reviewerId,reviewerRole:d.reviewerRole,reviewedAt:d.reviewedAt,...(d.comment?{comment:d.comment}:{})})));
  fs.writeFileSync(file,`${JSON.stringify(register,null,2)}\n`,'utf8');
  return {imported:decisions.length,issues:[]};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=process.argv[2];
  if(!input){ console.error('usage: import.ts <filled decisions.json>'); process.exit(2); }
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
  const out=importDecisions(root,JSON.parse(fs.readFileSync(path.resolve(input),'utf8')));
  if(out.issues.length){ for(const i of out.issues) console.error(i); process.exitCode=1; }
  else console.log(JSON.stringify({imported:out.imported}));
}
