                                                       
import { PROGRESS_SCHEMA_VERSION } from './types.js';
import { loadProgressRecord } from './migrations.js';
                                                                     

/**
 * Canonical domain events (P1.0). Only the LearningOrchestrator emits them; the reducer is the single,
 * pure transition function for LearningUnit progress.
 *
 * `status` is the unit's ACHIEVEMENT and is monotonic: a later attempt (retry, a new practice session)
 * never lowers it. Current attempt/session state lives in the attempts store, not here.
 */
                           
                           
                                      
                                                                                   
                                        
                                                                                                         
                                                                            
                                          
                                                                   

/** Activity-state keys owned by the learning cycle (read them through selectors, never directly). */
export const CYCLE_STATE_KEYS=Object.freeze({theory:'cycle.guide',reinforcement:'cycle.reinforcement'});

/** Achievement order. needs_review and assessment_complete share a rank: both mean "assessed". */
export const ACHIEVEMENT_RANK                                                        =Object.freeze({
  not_started:0,in_progress:1,practice_complete:2,assessment_complete:3,needs_review:3,mastered:4,
});

function raise(next                     ,status                               ){
  if(ACHIEVEMENT_RANK[status]>ACHIEVEMENT_RANK[next.status]) next.status=status;
}

export function createProgress(learningUnitId       ,contentVersion       ,contentSchemaVersion       ,at       )                      {
  return {learningUnitId,status:'not_started',activityStates:{},lastVisitedAt:at,contentVersion,schemaVersion:PROGRESS_SCHEMA_VERSION,contentSchemaVersion};
}

export function reduceProgress(state                     ,event              )                      {
  const next={...state,activityStates:{...state.activityStates},lastVisitedAt:event.at};
  switch(event.type){
    case 'OPEN':
      raise(next,'in_progress');
      return next;
    case 'THEORY_COMPLETE':
      next.activityStates[CYCLE_STATE_KEYS.theory]=JSON.stringify({complete:true,completedAt:event.at});
      raise(next,'in_progress');
      return next;
    case 'SAVE_ACTIVITY_STATE':
      next.activityStates[event.activityId]=event.serializedState;
      raise(next,'in_progress');
      return next;
    case 'PRACTICE_COMPLETE':
      raise(next,'practice_complete'); return next;
    case 'REINFORCEMENT_COMPLETE':
      next.activityStates[CYCLE_STATE_KEYS.reinforcement]=JSON.stringify({complete:true,completedAt:event.at,...event.payload});
      raise(next,'in_progress');
      return next;
    case 'ASSESSMENT_COMPLETE':
      raise(next,'assessment_complete'); return next;
    case 'MASTERY_UPDATED':
      if(event.masteryStatus==='mastered') raise(next,'mastered');
      // needs_review may replace assessment_complete (same rank) but never a mastered achievement.
      else if(event.masteryStatus==='needs_review'){ if(next.status!=='mastered') next.status='needs_review'; }
      else raise(next,'assessment_complete');
      return next;
  }
}

/** Migrates a stored progress record through the registry; throws when it must be isolated instead. */
export function migrateProgressRecord(input        ,targetSchemaVersion       =PROGRESS_SCHEMA_VERSION)                      {
  const result=loadProgressRecord(input,{targetSchemaVersion});
  if(result.status==='isolated') throw new Error(result.code==='PROGRESS_MIGRATION_UNSUPPORTED_STATUS'?'PROGRESS_MIGRATION_UNSUPPORTED_STATUS':'PROGRESS_MIGRATION_INVALID');
  return result.record;
}
