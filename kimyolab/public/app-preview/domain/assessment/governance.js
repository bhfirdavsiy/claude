// Assessment governance (P1.2). An item becomes APPROVED only through human review records — never by
// editing the bank, never by a script deciding on its own.
//
//   DRAFT → REVIEW_PENDING → APPROVED → RETIRED
//
// * DRAFT / RETIRED are authored (`item.lifecycle`).
// * APPROVED is DERIVED: a chemistry AND a didactic review record with decision `approved`, from a
//   non-automation reviewer identity, made against the item's CURRENT content hash, plus valid concept and
//   outcome mapping, a valid key and a non-empty explanation. Any content change invalidates old approvals.
// * The two approvals must come from TWO DIFFERENT people (independent dual review, ADR-P1-004 §2): one
//   person may hold both roles in the register, but can never approve both roles of the same item.
// * The outcome mapping proposed by authoring/tooling is only a proposal: the didactic reviewer decides it
//   (`outcomeDecision`: confirm | reject | change_required) and only `confirm` can lead to APPROVED.
// * everything else is REVIEW_PENDING (fail closed).
import {createHash} from 'node:crypto';

                                                                                  
                                              
                                                                     
                                                                 
export const OUTCOME_DECISIONS                           =['confirm','reject','change_required'];

export const REVIEW_REGISTER_SCHEMA='kimyolab.assessment-reviews.v1';
export const REVIEW_ROLES                      =['chemistry','didactic'];

                                         
                
                  
                          
                    
                          
                    
                                                                                       
                  
                     
                                                                        
                                               
                                                                                     
                                   
                  
 

                                                                                                                    

/** Identities that denote automation. An approval must come from a person (P1.2 §13). P1.8 adds the names of
 *  common AI assistants and repository bots (e.g. “ChatGPT”, “Codex”) — the name check stays one layer only. */
// P2.3 closeout: defined once in a browser-safe module (the structured theory runtime needs it); re-exported here.
export {AUTOMATION_IDENTITY} from '../governance/identity.js';
import {AUTOMATION_IDENTITY} from '../governance/identity.js';

/**
 * P1.8 defence in depth: the identity check above is a name check, so the review IMPORT commands additionally
 * refuse to run in an automation context (a CI runner or an AI coding agent session announce themselves through
 * their environment). This is not the authority — the authority is that a person runs the import and the register
 * change is reviewed in a pull request — but it keeps an agent or a workflow from filing decisions by accident.
 */
export const AUTOMATION_ENV_MARKERS                  =['CI','GITHUB_ACTIONS','AI_AGENT','CLAUDECODE','CLAUDE_CODE_SESSION_ID','CODEX_SANDBOX','CURSOR_AGENT'];
export function automationContext(env                                )         {
  return AUTOMATION_ENV_MARKERS.filter(k=>{const v=env[k];return typeof v==='string'&&v!==''&&v!=='0'&&v.toLowerCase()!=='false';});
}
/** The only fields a filled assessment review row may carry (P1.8: anything else is refused, never dropped). */
export const ASSESSMENT_REVIEW_FIELDS                  =['itemId','role','decision','reviewerId','reviewerRole','reviewedAt','itemHash','itemVersion','evidence','outcomeDecision','comment'];

function stable(value        )       {
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object') return `{${Object.keys(value          ).sort().map(k=>`${JSON.stringify(k)}:${stable((value                          )[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Hash of everything a reviewer judges (review bookkeeping excluded). */
export function assessmentItemHash(item                       )       {
  const {review:_review,lifecycle:_lifecycle,...reviewable}=item;
  return createHash('sha256').update(stable(reviewable)).digest('hex');
}

export function validateReviewRecord(record    )         {
  const issues         =[];
  const id=String(record?.itemId??'?');
  const text=(v        )=>typeof v==='string'&&v.trim().length>0;
  if(!text(record?.itemId)) issues.push('REVIEW_ITEM_REQUIRED');
  if(!REVIEW_ROLES.includes(record?.role)) issues.push(`REVIEW_ROLE_INVALID:${id}`);
  if(!['approved','rejected','changes_requested'].includes(record?.decision)) issues.push(`REVIEW_DECISION_INVALID:${id}`);
  if(!text(record?.reviewerId)) issues.push(`REVIEW_REVIEWER_REQUIRED:${id}`);
  else if(AUTOMATION_IDENTITY.test(record.reviewerId)) issues.push(`REVIEW_REVIEWER_NOT_HUMAN:${id}`);
  if(record?.reviewerRole!==record?.role) issues.push(`REVIEW_ROLE_MISMATCH:${id}`);
  if(!text(record?.reviewedAt)||!Number.isFinite(Date.parse(record.reviewedAt))) issues.push(`REVIEW_TIMESTAMP_INVALID:${id}`);
  if(!/^[a-f0-9]{64}$/.test(String(record?.itemHash))) issues.push(`REVIEW_ITEM_HASH_INVALID:${id}`);
  if(!text(record?.itemVersion)) issues.push(`REVIEW_ITEM_VERSION_REQUIRED:${id}`);
  if(!text(record?.evidence?.packet)||!/^[a-f0-9]{64}$/.test(String(record?.evidence?.packetSha256))) issues.push(`REVIEW_EVIDENCE_REQUIRED:${id}`);
  if(record?.role==='didactic'&&!OUTCOME_DECISIONS.includes(record?.outcomeDecision)) issues.push(`REVIEW_OUTCOME_DECISION_REQUIRED:${id}`);
  if(record?.role==='chemistry'&&record?.outcomeDecision!==undefined) issues.push(`REVIEW_OUTCOME_DECISION_NOT_CHEMISTRY:${id}`);
  // anything short of a plain approval must say why
  if((record?.decision!=='approved'||(record?.outcomeDecision!==undefined&&record.outcomeDecision!=='confirm'))&&!text(record?.comment)) issues.push(`REVIEW_COMMENT_REQUIRED:${id}`);
  return issues;
}

                                   
                                    
                                                                                                 
                                                     
                                                                                                                 
                                    
                                                         
                   
 

/** Derives the canonical lifecycle of one item from the bank + the review register. */
export function deriveItemLifecycle(item    ,records                         ,context                                                  )                 {
  const hash=assessmentItemHash(item);
  const review={chemistry:'pending',didactic:'pending'}                                               ;
  const latest                                                   ={};
  for(const role of REVIEW_ROLES){
    // only records on the CURRENT content hash count — an edit to any reviewed field voids older decisions
    const current=records
      .filter(r=>r.itemId===item.id&&r.role===role&&r.itemHash===hash&&validateReviewRecord(r).length===0)
      .sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
    if(current){review[role]=current.decision;latest[role]=current;}
  }
  const outcome                          =latest.didactic?.outcomeDecision??'pending';
  if(item.lifecycle==='RETIRED') return {lifecycle:'RETIRED',review,outcome,reasons:['RETIRED']};
  if(item.lifecycle==='DRAFT') return {lifecycle:'DRAFT',review,outcome,reasons:['DRAFT']};
  const reasons         =[];
  for(const role of REVIEW_ROLES) if(review[role]!=='approved') reasons.push(role==='chemistry'?'CHEMISTRY_REVIEW_REQUIRED':'ASSESSMENT_REVIEW_PENDING');
  if(review.chemistry==='approved'&&review.didactic==='approved'&&latest.chemistry .reviewerId.trim().toLowerCase()===latest.didactic .reviewerId.trim().toLowerCase()) reasons.push('DUAL_REVIEW_NOT_INDEPENDENT');
  if(review.didactic!=='pending'&&outcome!=='confirm') reasons.push('OUTCOME_MAPPING_NOT_CONFIRMED');
  const outcomes=Array.isArray(item.outcomeIds)?item.outcomeIds:[];
  if(!outcomes.length) reasons.push('OUTCOME_MAPPING_MISSING');
  const outcomeOk=outcomes.every((o       )=>{const m=/^(.+)#o([0-9]+)$/.exec(o);return Boolean(m&&m[1]===item.learningUnitId&&Number(m[2])>=1&&Number(m[2])<=context.unitOutcomeCount);});
  if(!outcomeOk||new Set(outcomes).size!==outcomes.length) reasons.push('OUTCOME_MAPPING_INVALID');
  const concepts=Array.isArray(item.conceptIds)?item.conceptIds:[];
  if(!concepts.length||new Set(concepts).size!==concepts.length||!concepts.every((c       )=>context.unitConceptIds.includes(c))) reasons.push('CONCEPT_MAPPING_INVALID');
  if(!(item.options??[]).some((o    )=>o?.id===item.correctOptionId)) reasons.push('ANSWER_KEY_INVALID');
  if(typeof item.explanation!=='string'||!item.explanation.trim()) reasons.push('EXPLANATION_MISSING');
  return {lifecycle:reasons.length?'REVIEW_PENDING':'APPROVED',review,outcome,reasons:[...new Set(reasons)]};
}
