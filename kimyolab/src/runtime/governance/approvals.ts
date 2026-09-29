import {createHash} from 'node:crypto';
import type {ApprovalRecord,ApprovalState} from '../../domain/content/types.ts';

function stable(value:unknown):string{
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object'){
    const object=value as Record<string,unknown>;
    return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeReviewHash(activity:Record<string,unknown>):string{
  const {approvals,...reviewable}=activity as any;
  return createHash('sha256').update(stable(reviewable)).digest('hex');
}

function effectiveRecord(record:ApprovalRecord,currentVersion:string,currentHash:string):ApprovalRecord{
  if(record.status!=='approved') return record;
  if(record.reviewedVersion===currentVersion&&record.reviewedHash===currentHash) return record;
  return {...record,status:'pending',notes:[record.notes,'Approval invalidated by content/version change'].filter(Boolean).join(' | ')};
}

export function effectiveApprovalState(activity:Record<string,unknown>&{version:string;approvals:ApprovalState}):ApprovalState{
  const hash=computeReviewHash(activity);
  return {
    technical:effectiveRecord(activity.approvals.technical,activity.version,hash),
    didactic:effectiveRecord(activity.approvals.didactic,activity.version,hash),
    accessibility:effectiveRecord(activity.approvals.accessibility,activity.version,hash),
    chemistry:activity.approvals.chemistry==='not_applicable'?'not_applicable':effectiveRecord(activity.approvals.chemistry,activity.version,hash),
  };
}
