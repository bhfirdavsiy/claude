// Pure state helpers for the orchestrator: practice-session records and snapshot assembly.
                                                               
                                                                    
                                                                
                                                  
                                                                                                                              
import {activeStage} from './selectors.js';

/** Internal (orchestrator-owned) session record. Never handed out; callers get PracticeSessionState views. */
                                
            
                                                                                     
                            
                          
                             
                      
                               
                    
                                                                                       
                              
                       
 

export function sessionView(record              )                     {
  return Object.freeze({
    id:record.id,
    attemptId:record.attempt.id,
    learningUnitId:record.attempt.learningUnitId,
    activityId:record.attempt.activityId,
    activityVersion:record.attempt.activityVersion,
    practiceType:record.practiceType,
    startedAt:record.attempt.startedAt,
    status:record.status,
    ...(record.attempt.completedAt?{completedAt:record.attempt.completedAt}:{}),
    persisted:record.persisted,
    evidenceCount:record.evidenceCount,
  });
}

export function buildSnapshot(input                                                                                          )                 {
  return {
    learningUnitId:input.progress.learningUnitId,
    progress:input.progress,
    activeStage:activeStage(input.progress),
    ...(input.session?{practiceSession:sessionView(input.session)}:{}),
    mastery:input.mastery,
    updatedAt:input.at,
  };
}

/** Aggregate unit mastery status used for the MASTERY_UPDATED transition. */
export function aggregateMasteryStatus(mastery                 )                                       {
  if(mastery.length&&mastery.every(m=>m.status==='mastered')) return 'mastered';
  if(mastery.some(m=>m.status==='needs_review')) return 'needs_review';
  return 'developing';
}
