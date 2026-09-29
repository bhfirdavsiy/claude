                                                       
                                                                     

                           
                           
                                                                                   
                                        
                                          
                                                                   

export function createProgress(learningUnitId       ,contentVersion       ,schemaVersion       ,at       )                      {
  return {learningUnitId,status:'not_started',activityStates:{},lastVisitedAt:at,contentVersion,schemaVersion};
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

export function migrateProgressRecord(input        ,targetSchemaVersion       )                      {
  if(typeof input!=='object'||input===null) throw new Error('PROGRESS_MIGRATION_INVALID');
  const src=input                          ;
  if(typeof src.learningUnitId!=='string'||typeof src.contentVersion!=='string'||typeof src.lastVisitedAt!=='string') throw new Error('PROGRESS_MIGRATION_INVALID');
  if(src.schemaVersion===targetSchemaVersion){
    return input                        ;
  }
  const legacyStatus=String(src.status??'not_started');
  const status=legacyStatus==='complete'?'practice_complete':legacyStatus;
  const allowed=new Set(['not_started','in_progress','practice_complete','assessment_complete','mastered','needs_review']);
  if(!allowed.has(status)) throw new Error('PROGRESS_MIGRATION_UNSUPPORTED_STATUS');
  return {
    learningUnitId:src.learningUnitId,
    status:status                                  ,
    activityStates:(src.activityStates&&typeof src.activityStates==='object'&&!Array.isArray(src.activityStates))?src.activityStates                         :{},
    lastVisitedAt:src.lastVisitedAt,
    contentVersion:src.contentVersion,
    schemaVersion:targetSchemaVersion,
  };
}
