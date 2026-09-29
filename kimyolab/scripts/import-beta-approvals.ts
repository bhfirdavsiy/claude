import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeReviewHash} from '../src/runtime/governance/approvals.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const fail=(code:string):never=>{throw new Error(code)};
const validIso=(v:unknown)=>typeof v==='string'&&v.length>0&&!Number.isNaN(Date.parse(v));

export function importBetaApprovals(inputFile:string,base=root){
  const register=JSON.parse(fs.readFileSync(path.resolve(inputFile),'utf8'));
  if(register.schema!=='kimyolab.beta-approval-register.v1'||!Array.isArray(register.records)) fail('BETA_APPROVAL_REGISTER_INVALID');
  const practices=JSON.parse(fs.readFileSync(path.join(base,'content-src/practice-activities.json'),'utf8'));
  const byId=new Map(practices.map((x:any)=>[x.id,x]));
  const overridesFile=path.join(base,'content-src/activity-approval-overrides.json');
  const overrides=fs.existsSync(overridesFile)?JSON.parse(fs.readFileSync(overridesFile,'utf8')):[];
  if(!Array.isArray(overrides)) fail('ACTIVITY_APPROVAL_OVERRIDES_INVALID');
  let imported=0,skipped=0;
  for(const row of register.records){
    if(row.status==='pending'||!row.status){skipped++;continue;}
    if(!['approved','rejected'].includes(row.status)) fail(`BETA_APPROVAL_STATUS_INVALID:${row.practiceActivityId}:${row.approvalType}`);
    const p:any=byId.get(row.practiceActivityId); if(!p) fail(`BETA_APPROVAL_ACTIVITY_MISSING:${row.practiceActivityId}`);
    if(!['technical','didactic','accessibility','chemistry'].includes(row.approvalType)) fail(`BETA_APPROVAL_TYPE_INVALID:${row.approvalType}`);
    if(row.approvalType==='chemistry'&&p.approvals.chemistry==='not_applicable') fail(`BETA_APPROVAL_NOT_APPLICABLE:${p.id}`);
    const expectedRole=row.approvalType;
    const currentHash=computeReviewHash(p);
    if(row.reviewerRole!==expectedRole) fail(`BETA_APPROVAL_ROLE_MISMATCH:${p.id}:${row.approvalType}`);
    if(!row.reviewerId||typeof row.reviewerId!=='string') fail(`BETA_APPROVAL_REVIEWER_REQUIRED:${p.id}:${row.approvalType}`);
    if(!validIso(row.reviewedAt)) fail(`BETA_APPROVAL_DATE_INVALID:${p.id}:${row.approvalType}`);
    if(row.reviewedVersion!==p.version) fail(`BETA_APPROVAL_VERSION_STALE:${p.id}:${row.approvalType}`);
    if(row.reviewedHash!==currentHash) fail(`BETA_APPROVAL_HASH_STALE:${p.id}:${row.approvalType}`);
    const record={status:row.status,reviewerId:row.reviewerId,reviewerRole:row.reviewerRole,reviewedVersion:row.reviewedVersion,reviewedHash:row.reviewedHash,reviewedAt:row.reviewedAt,notes:row.notes??''};
    const idx=overrides.findIndex((x:any)=>x.activityId===p.id&&x.approvalType===row.approvalType);
    const override={activityId:p.id,approvalType:row.approvalType,record};
    if(idx>=0) overrides[idx]=override; else overrides.push(override);
    p.approvals[row.approvalType]=record;
    imported++;
  }
  overrides.sort((a:any,b:any)=>`${a.activityId}:${a.approvalType}`.localeCompare(`${b.activityId}:${b.approvalType}`));
  fs.writeFileSync(overridesFile,`${JSON.stringify(overrides,null,2)}\n`,'utf8');
  fs.writeFileSync(path.join(base,'content-src/practice-activities.json'),`${JSON.stringify(practices,null,2)}\n`,'utf8');
  return {beta:register.beta,imported,skipped,overrideCount:overrides.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const f=process.argv[2];if(!f) fail('USAGE:beta:approvals:import -- <register.json>');console.log(JSON.stringify(importBetaApprovals(f)));}
  catch(error:any){console.error(String(error?.message??error));process.exitCode=1;}
}
