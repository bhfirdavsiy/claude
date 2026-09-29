import {createHash} from 'node:crypto';
                                                                                

function stable(value        )       {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object'){
    const object=value                          ;
    return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeReviewHash(activity                       )       {
  const {approvals,...reviewable}=activity       ;
  return createHash('sha256').update(stable(reviewable)).digest('hex');
}

function effectiveRecord(record               ,currentVersion       ,currentHash       )               {
  if(record.status!=='approved') return record;
  if(record.reviewedVersion===currentVersion&&record.reviewedHash===currentHash) return record;
  return {...record,status:'pending',notes:[record.notes,'Approval invalidated by content/version change'].filter(Boolean).join(' | ')};
}

export function effectiveApprovalState(activity                                                                )              {
  const hash=computeReviewHash(activity);
  return {
    technical:effectiveRecord(activity.approvals.technical,activity.version,hash),
    didactic:effectiveRecord(activity.approvals.didactic,activity.version,hash),
    accessibility:effectiveRecord(activity.approvals.accessibility,activity.version,hash),
    chemistry:activity.approvals.chemistry==='not_applicable'?'not_applicable':effectiveRecord(activity.approvals.chemistry,activity.version,hash),
  };
}
