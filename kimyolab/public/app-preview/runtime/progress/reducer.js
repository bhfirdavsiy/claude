                                                       
import { PROGRESS_SCHEMA_VERSION } from './types.js';
import { loadProgressRecord } from './migrations.js';
                                                                     

                           
                           
                                                                                   
                                        
                                          
                                                                   

export function createProgress(learningUnitId       ,contentVersion       ,contentSchemaVersion       ,at       )                      {
  return {learningUnitId,status:'not_started',activityStates:{},lastVisitedAt:at,contentVersion,schemaVersion:PROGRESS_SCHEMA_VERSION,contentSchemaVersion};
}

export function reduceProgress(state                     ,event              )                      {
  const next={...state,activityStates:{...state.activityStates},lastVisitedAt:event.at};
  switch(event.type){
    case 'OPEN':
      if(next.status==='not_started') next.status='in_progress';
      return next;
    case 'SAVE_ACTIVITY_STATE':
      next.activityStates[event.activityId]=event.serializedState;
      if(next.status==='not_started') next.status='in_progress';
      return next;
    case 'PRACTICE_COMPLETE':
      next.status='practice_complete'; return next;
    case 'ASSESSMENT_COMPLETE':
      next.status='assessment_complete'; return next;
    case 'MASTERY_UPDATED':
      if(event.masteryStatus==='mastered') next.status='mastered';
      else if(event.masteryStatus==='needs_review') next.status='needs_review';
      else if(next.status==='not_started'||next.status==='in_progress'||next.status==='practice_complete') next.status='assessment_complete';
      return next;
  }
}

/** Migrates a stored progress record through the registry; throws when it must be isolated instead. */
export function migrateProgressRecord(input        ,targetSchemaVersion       =PROGRESS_SCHEMA_VERSION)                      {
  const result=loadProgressRecord(input,{targetSchemaVersion});
  if(result.status==='isolated') throw new Error(result.code==='PROGRESS_MIGRATION_UNSUPPORTED_STATUS'?'PROGRESS_MIGRATION_UNSUPPORTED_STATUS':'PROGRESS_MIGRATION_INVALID');
  return result.record;
}
