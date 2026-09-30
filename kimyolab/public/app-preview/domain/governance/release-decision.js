// Activity release decisions (P1.9). Content APPROVED is not RELEASED, and machine ELIGIBLE is not RELEASED:
//
//   machine:  ELIGIBLE | NOT_ELIGIBLE      (a fact about the current content; never a decision)
//   human:    RELEASE | KEEP_PENDING | DISABLE | CHANGE_REQUIRED
//             by a content owner (a person), pinned to the activity's release basis hash
//
// A decision on an older basis is STALE and counts for nothing; a RELEASE of a NOT_ELIGIBLE basis is refused.
// A release decision never replaces a pilot owner's sign-off (ADR-P1-004): they are separate human gates.
import {createHash} from 'node:crypto';
import {AUTOMATION_IDENTITY} from '../assessment/governance.js';

export const RELEASE_REGISTER_SCHEMA='kimyolab.release-decisions.v1';
                                                                                      
export const RELEASE_DECISIONS                                =['RELEASE','KEEP_PENDING','DISABLE','CHANGE_REQUIRED'];
export const RELEASE_DECISION_FIELDS                  =['activityId','basisHash','decision','reviewerId','role','decidedAt','comment'];

                                          
                    
                   
                                
                    
                       
                   
                  
 

                                                                                                           

function stable(value        )       {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value          ).sort().map(k=>`${JSON.stringify(k)}:${stable((value       )[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** What a release decision is about: the activity record (review bookkeeping excluded) and its practice config. */
export function releaseBasisHash(input                                                                    )       {
  return createHash('sha256').update(stable({activityId:input.activityId,version:input.version,reviewHash:input.reviewHash,config:input.config??null})).digest('hex');
}

export function validateReleaseRecord(r    )         {
  const issues         =[];
  const id=r?.activityId??'?';
  if(typeof r?.activityId!=='string'||!r.activityId) issues.push('RELEASE_ACTIVITY_MISSING');
  if(typeof r?.basisHash!=='string'||!/^[a-f0-9]{64}$/.test(r.basisHash)) issues.push(`RELEASE_BASIS_INVALID:${id}`);
  if(!RELEASE_DECISIONS.includes(r?.decision)) issues.push(`RELEASE_DECISION_INVALID:${id}`);
  if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`RELEASE_REVIEWER_MISSING:${id}`);
  else if(AUTOMATION_IDENTITY.test(r.reviewerId)) issues.push(`RELEASE_REVIEWER_NOT_HUMAN:${id}`);
  if(r?.role!=='content-owner') issues.push(`RELEASE_ROLE_INVALID:${id}`);
  if(typeof r?.decidedAt!=='string'||Number.isNaN(Date.parse(r.decidedAt))) issues.push(`RELEASE_DATE_INVALID:${id}`);
  if(r?.decision!=='RELEASE'&&!(typeof r?.comment==='string'&&r.comment.trim())) issues.push(`RELEASE_COMMENT_REQUIRED:${id}`);
  for(const f of Object.keys(r??{}).filter(k=>!RELEASE_DECISION_FIELDS.includes(k))) issues.push(`RELEASE_FIELD_NOT_ALLOWED:${id}:${f}`);
  return issues;
}

export function parseReleaseRegister(raw    )                                                    {
  if(!raw||raw.schema!==RELEASE_REGISTER_SCHEMA||!Array.isArray(raw.records)) return {records:[],issues:['RELEASE_REGISTER_INVALID']};
  const issues=raw.records.flatMap((r    )=>validateReleaseRecord(r));
  return {records:issues.length?[]:raw.records,issues};
}

/** The latest human decision for an activity, checked against its CURRENT basis. */
export function releaseStateOf(activityId       ,basisHash       ,records                                   )                                                     {
  const latest=records.filter(r=>r.activityId===activityId).sort((a,b)=>Date.parse(a.decidedAt)-Date.parse(b.decidedAt)).at(-1);
  if(!latest) return {state:'DECISION_MISSING'};
  if(latest.basisHash!==basisHash) return {state:'STALE',record:latest};
  const map                                          ={RELEASE:'RELEASED',KEEP_PENDING:'KEEP_PENDING',DISABLE:'DISABLED',CHANGE_REQUIRED:'CHANGE_REQUIRED'};
  return {state:map[latest.decision],record:latest};
}

                                   
                  
                 
                                   
                           
                            
                 
                                
                                             
 
                                                                                   

/**
 * Machine eligibility — a precondition a person checks before deciding, NEVER the decision. Runtime must be READY, or
 * PENDING only because the activity has not been released yet (that is what the decision is for).
 */
export function releaseEligibility(x                 )            {
  const reasons         =[];
  if(!x.routeOk) reasons.push('ROUTE_INVALID');
  const onlyUnreleased=x.runtime==='PENDING'&&x.runtimeReasons.filter(r=>r==='ACTIVITY_NOT_RELEASED'||r==='ROUTE_NONE'||r==='ROUTE_INVALID'||r==='RENDERER_UNAVAILABLE'||r==='CONTENT_VERSION_INCOMPATIBLE').every(r=>r==='ACTIVITY_NOT_RELEASED');
  if(!(x.runtime==='READY'||onlyUnreleased)) reasons.push(`RUNTIME_${x.runtime}`);
  if(x.rendererRequired&&!x.rendererAvailable) reasons.push('RENDERER_UNAVAILABLE');
  if(x.content!=='APPROVED') reasons.push(`CONTENT_${x.content}`);
  if(!x.accessibilityApproved) reasons.push('ACCESSIBILITY_REVIEW_INCOMPLETE');
  for(const a of x.staleChemistryAssertions) reasons.push(`CHEMISTRY_ASSERTION_STALE:${a}`);
  return {status:reasons.length?'NOT_ELIGIBLE':'ELIGIBLE',reasons};
}
