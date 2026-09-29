import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateExternalApproval} from './approval-evidence.ts';
import {buildStableSignoffTargets} from './stable-signoff-targets.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const gateToReport:Record<string,string>={
  'CHEM-033':'reports/chemistry-expert-approval.json',
  'PROD-002':'reports/product-didactic-approval.json',
  'VISUAL-001':'reports/visual-review-approval.json',
};

function fail(code:string):never{throw new Error(code);}
function readJson(file:string){return JSON.parse(fs.readFileSync(file,'utf8'));}
function validIso(value:unknown){return typeof value==='string'&&value.length>0&&!Number.isNaN(Date.parse(value));}

export function importGateApproval(gateId:string,inputFile:string,base=root){
  if(!gateToReport[gateId]) fail(`APPROVAL_GATE_UNSUPPORTED:${gateId}`);
  const targets=buildStableSignoffTargets(base);
  const target=(targets.targets as any)[gateId];
  if(!target) fail(`APPROVAL_TARGET_MISSING:${gateId}`);
  if(gateId==='VISUAL-001'&&target.readyForReview!==true) fail('VISUAL_APPROVAL_NOT_READY_FOR_REVIEW');
  const record=readJson(path.resolve(inputFile));
  if(record.gateId&&record.gateId!==gateId) fail(`APPROVAL_GATE_ID_MISMATCH:${record.gateId}:${gateId}`);
  if(!['approved','rejected'].includes(record.status)) fail('APPROVAL_DECISION_REQUIRED');
  if(typeof record.reviewerId!=='string'||!record.reviewerId.trim()) fail('APPROVAL_REVIEWER_ID_REQUIRED');
  if(!validIso(record.reviewedAt)) fail('APPROVAL_REVIEWED_AT_INVALID');
  if(record.reviewerRole!==target.reviewerRole) fail(`APPROVAL_REVIEWER_ROLE_MISMATCH:${record.reviewerRole}:${target.reviewerRole}`);
  if(record.reviewedVersion!==target.version) fail(`APPROVAL_VERSION_STALE:${record.reviewedVersion}:${target.version}`);
  if(record.reviewedHash!==target.hash) fail(`APPROVAL_HASH_STALE:${record.reviewedHash}:${target.hash}`);
  if(record.status==='approved'){
    const evaluated=evaluateExternalApproval(record,{version:target.version,hash:target.hash,reviewerRole:target.reviewerRole});
    if(!evaluated.valid) fail(`APPROVAL_INVALID:${evaluated.reason}`);
  }
  const output={...record,gateId,importedAt:new Date().toISOString(),targetSchema:target.reviewSurfaceSchema??undefined};
  const out=path.join(base,gateToReport[gateId]);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,`${JSON.stringify(output,null,2)}\n`,'utf8');
  return {gateId,status:record.status,reviewerId:record.reviewerId,report:path.relative(base,out).split(path.sep).join('/')};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const gateId=process.argv[2];
    const file=process.argv[3];
    if(!gateId||!file) fail('USAGE:approval:import -- <CHEM-033|PROD-002|VISUAL-001> <approval.json>');
    console.log(JSON.stringify(importGateApproval(gateId,file)));
  }catch(error:any){console.error(String(error?.message??error));process.exitCode=1;}
}
