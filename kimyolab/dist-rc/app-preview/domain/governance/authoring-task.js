// Governed authoring (P1.9). A person's review decision (or a machine flag a person must look at) becomes an
// AUTHORING TASK. A task is work for an author — it is never a content change, never an approval and never a release:
//
//   REVIEW DECISION  (human; hash-pinned; content-src/*-reviews.json)
//   AUTHORING STATE  (derived here: OPEN → IN_PROGRESS → READY_FOR_REVIEW → CLOSED | SUPERSEDED)
//   RELEASE DECISION (human; hash-pinned; see release-decision.ts)
//
// Tasks are DERIVED deterministically from the registers and the current content hashes, so the same
// target + basisHash + action can never produce two tasks (the id is a hash of exactly that triple).
import {createHash} from 'node:crypto';

                                                                             
                                                                                                                             
                                                                                          
export const AUTHORING_STATUSES                           =['OPEN','IN_PROGRESS','READY_FOR_REVIEW','CLOSED','SUPERSEDED'];

                                
            
                                                                                    
                          
                           
                  
                         
                         
                                                                                             
                   
                                                                        
                          
                         
                              
                               
                          
                               
                                                                            
                                 
 

export function authoringTaskId(surface                 ,targetId       ,action                ,basisHash       )       {
  return `task.${createHash('sha256').update(`${surface}\n${targetId}\n${action}\n${basisHash}`).digest('hex').slice(0,20)}`;
}

/**
 * Authoring state of a task, from facts only:
 *  - a later human decision on the SAME basis replaced this one           → SUPERSEDED
 *  - the target changed (hash ≠ basis):
 *      · a human decision exists on the new hash that closes the loop       → CLOSED
 *      · a human decision exists on the new hash that asks for more work    → SUPERSEDED (a new task carries it)
 *      · no decision on the new hash yet                                    → READY_FOR_REVIEW (re-review required)
 *  - the target is unchanged: a person resolved it as is → CLOSED; a draft exists → IN_PROGRESS; else OPEN
 */
export function deriveTaskStatus(input                                                                                                                                   )                {
  if(input.supersededOnBasis) return 'SUPERSEDED';
  if(input.currentHash!==input.basisHash){
    if(input.decisionOnCurrent==='closes') return 'CLOSED';
    if(input.decisionOnCurrent==='reopens') return 'SUPERSEDED';
    return 'READY_FOR_REVIEW';
  }
  // unchanged target, and a person resolved it as is (e.g. the didactic reviewer confirmed a flagged mapping)
  if(input.decisionOnCurrent==='closes') return 'CLOSED';
  return input.draftExists?'IN_PROGRESS':'OPEN';
}

/** One task per (surface, target, action, basis) — later duplicates are dropped, never merged into a new id. */
export function dedupeTasks(tasks                         )                {
  const seen=new Map                      ();
  for(const t of tasks) if(!seen.has(t.id)) seen.set(t.id,t);
  return [...seen.values()].sort((a,b)=>a.priority===b.priority?a.id.localeCompare(b.id):a.priority.localeCompare(b.priority));
}
