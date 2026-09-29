// Pure state helpers for the orchestrator: practice-session records and snapshot assembly.
import type {LearningUnitProgress} from '../progress/types.ts';
import type {ConceptMastery} from '../../domain/mastery/mastery.ts';
import type {PracticeType} from '../../domain/content/types.ts';
import type {Attempt} from '../evidence/types.ts';
import type {AssessmentSessionState,LearningSnapshot,PracticeEnginePort,PracticeSessionState,PracticeSessionStatus,VersionContext} from './types.ts';
import {activeStage} from './selectors.ts';

/** Internal (orchestrator-owned) session record. Never handed out; callers get PracticeSessionState views. */
export interface SessionRecord {
  id:string;
  attempt:Attempt;              // identity fixed at BEGIN_PRACTICE; persisted lazily
  practiceType:PracticeType;
  versions:VersionContext;
  engine?:PracticeEnginePort;
  conceptIds:string[];
  status:PracticeSessionStatus;
  persisted:boolean;
  /** Engine evidence id → signature of what was already persisted for this attempt. */
  recorded:Map<string,string>;
  evidenceCount:number;
}

export function sessionView(record:SessionRecord):PracticeSessionState{
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

export function buildSnapshot(input:{progress:LearningUnitProgress;session?:SessionRecord;mastery:ConceptMastery[];at:string}):LearningSnapshot{
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
export function aggregateMasteryStatus(mastery:ConceptMastery[]):'mastered'|'needs_review'|'developing'{
  if(mastery.length&&mastery.every(m=>m.status==='mastered')) return 'mastered';
  if(mastery.some(m=>m.status==='needs_review')) return 'needs_review';
  return 'developing';
}

export interface AssessmentSessionRecord {
  id:string;
  learningUnitId:string;
  versions:VersionContext;
  conceptIds:string[];
  startedAt:string;
  status:'open'|'submitted'|'abandoned';
}

export function assessmentView(record:AssessmentSessionRecord):AssessmentSessionState{
  return Object.freeze({id:record.id,learningUnitId:record.learningUnitId,startedAt:record.startedAt,status:record.status});
}
