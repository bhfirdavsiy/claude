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

/** Reflection/reinforcement completion. It is NOT derived from the achievement status (C5). */
export function isReinforcementComplete(progress                               )        {
  // Pre-P1.0 records always wrote cycle.reinforcement together with their (mis-named) assessment status,
  // so the activity state alone is complete for legacy records too.
  return isStateComplete(readActivityState(progress,CYCLE_STATE_KEYS.reinforcement));
}

/** An objective assessment was submitted AND evaluated (ASSESSMENT_EVALUATED). */
export function isAssessmentComplete(progress                               )        {
  return isStateComplete(readActivityState(progress,CYCLE_STATE_KEYS.assessment));
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

/** What the learner sees. Separate from the achievement status so labels never redefine semantics. */
                                                                                  

/**
 * Status shown to the learner. A completed reflection is shown as "reinforcement done"; it is never an
 * assessment. Pre-P1.0 records stored reflection as `assessment_complete` without an evaluated
 * assessment — those are shown as what they really were.
 */
export function displayStatus(progress                     )              {
  const reinforced=isReinforcementComplete(progress);
  if(progress.status==='assessment_complete'&&!isAssessmentComplete(progress)) return reinforced?'reinforcement_complete':'practice_complete';
  if(ACHIEVEMENT_RANK[progress.status]<ACHIEVEMENT_RANK.assessment_complete&&reinforced) return 'reinforcement_complete';
  return progress.status;
}

/** Whether an engine result completes the practice activity (was duplicated in service and render). */
export function isPracticeResultComplete(type             ,result    )        {
  const status=result?.finalState?.status;
  if(status==='complete'||status==='correct') return true;
  if(type==='simulation') return (result?.evidence??[]).some((e    )=>e?.type==='construction'&&e.achieved===true);
  return false;
}
