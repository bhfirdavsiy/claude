// Canonical selectors (P1.0, baseline D1–D3). The ONLY place that interprets progress records and
// practice results. UI, services and view models must use these instead of their own predicates.
                                                               
import {ACHIEVEMENT_RANK,CYCLE_STATE_KEYS} from '../progress/reducer.js';
                                                                
                                              

/** Raw activity state string for a key, or undefined. */
export function readActivityState(progress                               ,activityId       )                 {
  return progress?.activityStates[activityId];
}

/** True when a serialized activity state records completion ("complete" or JSON with complete:true). */
export function isStateComplete(value                 )        {
  if(!value) return false;
  if(value==='complete') return true;
  try{return Boolean(JSON.parse(value)?.complete);}catch{return false;}
}

export function isTheoryComplete(progress                               )        {
  return isStateComplete(readActivityState(progress,CYCLE_STATE_KEYS.theory));
}

/** Practice achieved at some point (achievement is monotonic, so later attempts cannot undo it). */
export function isPracticeComplete(progress                               )        {
  return Boolean(progress)&&ACHIEVEMENT_RANK[progress .status]>=ACHIEVEMENT_RANK.practice_complete;
}

export function isReinforcementComplete(progress                               )        {
  if(!progress) return false;
  // Legacy (pre-P1.0) records encoded reflection as assessment_complete; keep reading them as complete.
  return ACHIEVEMENT_RANK[progress.status]>=ACHIEVEMENT_RANK.assessment_complete||isStateComplete(readActivityState(progress,CYCLE_STATE_KEYS.reinforcement));
}

export function isLearningUnitComplete(progress                               )        {
  return isTheoryComplete(progress)&&isPracticeComplete(progress)&&isReinforcementComplete(progress);
}

export function activeStage(progress                               )              {
  if(!isTheoryComplete(progress)) return 'theory';
  if(!isPracticeComplete(progress)) return 'practice';
  if(!isReinforcementComplete(progress)) return 'reinforcement';
  return 'complete';
}

/** Activity ids of real practice activities that have saved state (cycle.* keys excluded). */
export function practiceActivityIds(progress                               )         {
  return Object.keys(progress?.activityStates??{}).filter(id=>id.startsWith('practice.'));
}

/**
 * Status shown to the learner. Unchanged wording for P1.0: a completed reflection is still shown as
 * "reinforcement done" even though it no longer writes assessment_complete (C5).
 */
export function displayStatus(progress                     )                               {
  if(ACHIEVEMENT_RANK[progress.status]<ACHIEVEMENT_RANK.assessment_complete&&isStateComplete(readActivityState(progress,CYCLE_STATE_KEYS.reinforcement))) return 'assessment_complete';
  return progress.status;
}

/** Whether an engine result completes the practice activity (was duplicated in service and render). */
export function isPracticeResultComplete(type             ,result    )        {
  const status=result?.finalState?.status;
  if(status==='complete'||status==='correct') return true;
  if(type==='simulation') return (result?.evidence??[]).some((e    )=>e?.type==='construction'&&e.achieved===true);
  return false;
}
