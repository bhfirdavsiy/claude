import type { LearningUnitProgress } from './types.ts';
import { PROGRESS_SCHEMA_VERSION } from './types.ts';
import { loadProgressRecord } from './migrations.ts';
import type { MasteryStatus, VersionCompatibility } from '../../domain/mastery/mastery.ts';

/**
 * Canonical domain events (P1.0). Only the LearningOrchestrator emits them; the reducer is the single,
 * pure transition function for LearningUnit progress.
 *
 * `status` is the unit's ACHIEVEMENT and is monotonic: a later attempt (retry, a new practice session)
 * never lowers it. Current attempt/session state lives in the attempts store, not here.
 */
export type ProgressEvent =
  | {type:'OPEN';at:string}
  | {type:'THEORY_COMPLETED';at:string}
  | {type:'SAVE_ACTIVITY_STATE';activityId:string;serializedState:string;at:string}
  | {type:'PRACTICE_COMPLETED';at:string}
  /** Reflection/reinforcement is not an assessment (baseline C5): it records completion, not a score. */
  | {type:'REINFORCEMENT_COMPLETED';payload:Record<string,unknown>;at:string}
  /** An objective assessment was submitted (a fact about the submission; no achievement by itself). */
  | {type:'ASSESSMENT_SUBMITTED';attemptId:string;at:string}
  /** The submitted objective assessment was evaluated. Only this event can yield `assessment_complete`. */
  | {type:'ASSESSMENT_EVALUATED';attemptId:string;objectiveItems:number;score:number;at:string}
  /** Emitted after an evaluated assessment; it refines an assessed unit, it never creates one. */
  | {type:'MASTERY_UPDATED';masteryStatus:MasteryStatus;at:string}
  /**
   * The unit is now used under a different content version. Achievement is monotonic only WITHIN one
   * compatibility context: unless the old version is declared `compatible`, the old achievement and
   * cycle state are archived (kept for audit) and the unit restarts under the new context.
   */
  | {type:'ACHIEVEMENT_CONTEXT_CHANGED';fromContentVersion:string;toContentVersion:string;compatibility:VersionCompatibility;at:string};

/** Activity-state keys owned by the learning cycle (read them through selectors, never directly). */
export const CYCLE_STATE_KEYS=Object.freeze({theory:'cycle.guide',reinforcement:'cycle.reinforcement',assessment:'cycle.assessment',archivePrefix:'cycle.archive.'});

/** Achievement order. needs_review and assessment_complete share a rank: both mean "assessed". */
export const ACHIEVEMENT_RANK:Readonly<Record<LearningUnitProgress['status'],number>>=Object.freeze({
  not_started:0,in_progress:1,practice_complete:2,assessment_complete:3,needs_review:3,mastered:4,
});

function raise(next:LearningUnitProgress,status:LearningUnitProgress['status']){
  if(ACHIEVEMENT_RANK[status]>ACHIEVEMENT_RANK[next.status]) next.status=status;
}

export function createProgress(learningUnitId:string,contentVersion:string,contentSchemaVersion:string,at:string):LearningUnitProgress {
  return {learningUnitId,status:'not_started',activityStates:{},lastVisitedAt:at,contentVersion,schemaVersion:PROGRESS_SCHEMA_VERSION,contentSchemaVersion};
}

export function reduceProgress(state:LearningUnitProgress,event:ProgressEvent):LearningUnitProgress {
  const next={...state,activityStates:{...state.activityStates},lastVisitedAt:event.at};
  switch(event.type){
    case 'OPEN':
      raise(next,'in_progress');
      return next;
    case 'THEORY_COMPLETED':
      next.activityStates[CYCLE_STATE_KEYS.theory]=JSON.stringify({complete:true,completedAt:event.at});
      raise(next,'in_progress');
      return next;
    case 'SAVE_ACTIVITY_STATE':
      next.activityStates[event.activityId]=event.serializedState;
      raise(next,'in_progress');
      return next;
    case 'PRACTICE_COMPLETED':
      raise(next,'practice_complete'); return next;
    case 'REINFORCEMENT_COMPLETED':
      next.activityStates[CYCLE_STATE_KEYS.reinforcement]=JSON.stringify({complete:true,completedAt:event.at,...event.payload});
      raise(next,'in_progress');
      return next;
    case 'ASSESSMENT_SUBMITTED':
      next.activityStates[CYCLE_STATE_KEYS.assessment]=JSON.stringify({complete:false,attemptId:event.attemptId,submittedAt:event.at});
      raise(next,'in_progress');
      return next;
    case 'ASSESSMENT_EVALUATED':
      // Fail closed: an "assessment" without a single objective item is not an assessment.
      if(event.objectiveItems<1) return next;
      next.activityStates[CYCLE_STATE_KEYS.assessment]=JSON.stringify({complete:true,attemptId:event.attemptId,evaluatedAt:event.at,objectiveItems:event.objectiveItems,score:event.score});
      raise(next,'assessment_complete');
      return next;
    case 'MASTERY_UPDATED':
      if(ACHIEVEMENT_RANK[next.status]<ACHIEVEMENT_RANK.assessment_complete) return next;
      if(event.masteryStatus==='mastered') raise(next,'mastered');
      // needs_review may replace assessment_complete (same rank) but never a mastered achievement.
      else if(event.masteryStatus==='needs_review'){ if(next.status!=='mastered') next.status='needs_review'; }
      return next;
    case 'ACHIEVEMENT_CONTEXT_CHANGED': {
      if(event.compatibility==='compatible'||event.fromContentVersion===event.toContentVersion) return next;
      const current:Record<string,string>={};
      const archives:Record<string,string>={};
      for(const [key,value] of Object.entries(next.activityStates)) (key.startsWith(CYCLE_STATE_KEYS.archivePrefix)?archives:current)[key]=value;
      archives[`${CYCLE_STATE_KEYS.archivePrefix}${event.fromContentVersion}@${event.at}`]=JSON.stringify({status:next.status,activityStates:current,archivedAt:event.at,reason:event.compatibility});
      next.activityStates=archives;
      next.status=ACHIEVEMENT_RANK[next.status]>0?'in_progress':'not_started';
      return next;
    }
    default:
      // Fail closed: an unknown (e.g. renamed pre-P1.0) event must never silently yield a state.
      throw new Error(`PROGRESS_EVENT_UNKNOWN: ${String((event as {type?:unknown}).type)}`);
  }
}

/** Migrates a stored progress record through the registry; throws when it must be isolated instead. */
export function migrateProgressRecord(input:unknown,targetSchemaVersion:string=PROGRESS_SCHEMA_VERSION):LearningUnitProgress {
  const result=loadProgressRecord(input,{targetSchemaVersion});
  if(result.status==='isolated') throw new Error(result.code==='PROGRESS_MIGRATION_UNSUPPORTED_STATUS'?'PROGRESS_MIGRATION_UNSUPPORTED_STATUS':'PROGRESS_MIGRATION_INVALID');
  return result.record;
}
