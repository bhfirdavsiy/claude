// Chemistry knowledge-base review (P1.7). Every chemistry claim the product relies on is an ASSERTION with a
// content hash; its review status is DERIVED from the human decision register (content-src/chemistry-reviews.json)
// — never from a field in the data, never decided by tooling.
//
//   decision on the CURRENT hash   → approved | rejected | change_required
//   decision on an OLD hash        → stale (the assertion changed after review; the approval no longer counts)
//   no decision                    → pending
//
// Reviewers must be people (AUTOMATION_IDENTITY, shared with assessment governance) in the chemistry role, and a
// non-approval needs a comment.
import {createHash} from 'node:crypto';
import {AUTOMATION_IDENTITY} from '../assessment/governance.js';

export const CHEMISTRY_REVIEW_REGISTER_SCHEMA='kimyolab.chemistry-reviews.v1';
                                                                                                                                                     
export const ASSERTION_CATEGORIES                             =['reaction','no-reaction','condition','observation','solubility','hydrolysis','indicator','species-name','electrolysis'];
                                                                   
                                                                                  

                                     
            
                             
               
               
                      
                              
                                                                                    
                               
              
 

                                        
                     
                       
                             
                    
                           
                    
                  
 

function stable(value        )       {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value          ).sort().map(k=>`${JSON.stringify(k)}:${stable((value       )[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** The hash covers WHAT is claimed (category + structured data + sources), not who uses it. */
export function assertionHash(a                                                   )       {
  return createHash('sha256').update(stable({category:a.category,data:a.data,sourceRefs:[...a.sourceRefs].sort()})).digest('hex');
}

export function validateReviewRecord(r    )         {
  const issues         =[];
  const id=r?.assertionId??'?';
  if(!r||typeof r.assertionId!=='string'||!r.assertionId) issues.push('CHEM_REVIEW_ASSERTION_MISSING');
  if(typeof r?.assertionHash!=='string'||!/^[a-f0-9]{64}$/.test(r.assertionHash)) issues.push(`CHEM_REVIEW_HASH_INVALID:${id}`);
  if(!['approve','reject','change_required'].includes(r?.decision)) issues.push(`CHEM_REVIEW_DECISION_INVALID:${id}`);
  if(typeof r?.reviewerId!=='string'||!r.reviewerId.trim()) issues.push(`CHEM_REVIEW_REVIEWER_MISSING:${id}`);
  else if(AUTOMATION_IDENTITY.test(r.reviewerId)) issues.push(`CHEM_REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(r?.reviewerRole!=='chemistry') issues.push(`CHEM_REVIEW_ROLE_INVALID:${id}`);
  if(typeof r?.reviewedAt!=='string'||Number.isNaN(Date.parse(r.reviewedAt))) issues.push(`CHEM_REVIEW_DATE_INVALID:${id}`);
  if(r?.decision!=='approve'&&!(typeof r?.comment==='string'&&r.comment.trim())) issues.push(`CHEM_REVIEW_COMMENT_REQUIRED:${id}`);
  return issues;
}

export function parseReviewRegister(raw    )                                                  {
  if(!raw||raw.schema!==CHEMISTRY_REVIEW_REGISTER_SCHEMA||!Array.isArray(raw.records)) return {records:[],issues:['CHEM_REVIEW_REGISTER_INVALID']};
  const issues=raw.records.flatMap((r    )=>validateReviewRecord(r));
  return {records:issues.length?[]:raw.records,issues};
}

/** Effective review state of one assertion: the latest human decision, checked against the CURRENT hash. */
export function reviewStateOf(a                   ,records                                 )                                                  {
  const mine=records.filter(r=>r.assertionId===a.id).sort((x,y)=>Date.parse(x.reviewedAt)-Date.parse(y.reviewedAt));
  const latest=mine.at(-1);
  if(!latest) return {state:'pending'};
  if(latest.assertionHash!==a.hash) return {state:'stale',record:latest};
  return {state:latest.decision==='approve'?'approved':latest.decision==='reject'?'rejected':'change_required',record:latest};
}
