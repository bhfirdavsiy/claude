import {createHash} from 'node:crypto';

export type ExternalApprovalStatus='pending'|'approved'|'rejected';
export interface ExternalApprovalRecord {
  status:ExternalApprovalStatus;
  reviewerId:string;
  reviewerRole:string;
  reviewedVersion:string;
  reviewedHash:string;
  reviewedAt:string;
  notes?:string;
}

function stable(value:unknown):string{
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object'){
    const object=value as Record<string,unknown>;
    return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeApprovalHash(payload:unknown):string{
  return createHash('sha256').update(stable(payload)).digest('hex');
}

export function evaluateExternalApproval(
  record:ExternalApprovalRecord|undefined,
  expected:{version:string;hash:string;reviewerRole:string},
){
  if(!record) return {status:'pending' as const,valid:false,reason:'APPROVAL_RECORD_MISSING'};
  if(record.status!=='approved') return {status:record.status,valid:false,reason:record.status==='rejected'?'APPROVAL_REJECTED':'APPROVAL_PENDING'};
  if(!record.reviewerId||!record.reviewedAt) return {status:'pending' as const,valid:false,reason:'APPROVAL_METADATA_INCOMPLETE'};
  if(record.reviewerRole!==expected.reviewerRole) return {status:'pending' as const,valid:false,reason:'APPROVAL_REVIEWER_ROLE_MISMATCH'};
  if(record.reviewedVersion!==expected.version) return {status:'pending' as const,valid:false,reason:'APPROVAL_VERSION_STALE'};
  if(record.reviewedHash!==expected.hash) return {status:'pending' as const,valid:false,reason:'APPROVAL_HASH_STALE'};
  return {status:'approved' as const,valid:true,reason:'APPROVED'};
}
