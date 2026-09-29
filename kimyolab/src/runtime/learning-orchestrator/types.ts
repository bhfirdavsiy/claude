import type {LearningUnitProgress} from '../progress/types.ts';
import type {Attempt,PersistedEvidence} from '../evidence/types.ts';
import type {ConceptMastery,MasteryVersionPolicy} from '../../domain/mastery/mastery.ts';
import type {AssessmentResult} from '../../domain/assessment/scoring.ts';
import type {PracticeType} from '../../domain/content/types.ts';

export type LearningStage='theory'|'practice'|'reinforcement'|'complete';

/** Versions every canonical transition and mastery computation runs under (explicit, never implied). */
export interface VersionContext {
  contentVersion:string;
  /** Content-pack schema version, recorded on new progress records (`contentSchemaVersion`). */
  contentSchemaVersion:string;
  scoringVersion:string;
  curriculumVersion?:string;
}

export type PracticeSessionStatus='active'|'completed'|'abandoned';

/** Read-only view of a practice session (one opened practice page = one Attempt). */
export interface PracticeSessionState {
  readonly id:string;
  readonly attemptId:string;
  readonly learningUnitId:string;
  readonly activityId:string;
  readonly activityVersion:string;
  readonly practiceType:PracticeType;
  readonly startedAt:string;
  readonly status:PracticeSessionStatus;
  readonly completedAt?:string;
  /** Whether the attempt record exists in the store (it is created lazily with the first evidence). */
  readonly persisted:boolean;
  readonly evidenceCount:number;
}

export interface LearningSnapshot {
  learningUnitId:string;
  progress:LearningUnitProgress;
  activeStage:LearningStage;
  practiceSession?:PracticeSessionState;
  mastery:ConceptMastery[];
  updatedAt:string;
}

/** Engine side of a practice session (e.g. ReferencePracticeSession): interaction only, no persistence. */
export interface PracticeEnginePort<Command=unknown> {
  apply(command:Command):Promise<any>;
}

/** Persistence authority used by the orchestrator (implemented by IndexedDbProgressStore). */
export interface LearningStorePort {
  loadProgress(learningUnitId:string):Promise<LearningUnitProgress|undefined>;
  /** Atomic read → migrate/validate → update → save in ONE transaction. */
  updateProgress(learningUnitId:string,updater:(current:LearningUnitProgress|undefined)=>LearningUnitProgress):Promise<LearningUnitProgress>;
  recordAttempt(attempt:Attempt,evidence:PersistedEvidence[]):Promise<void>;
  appendAttemptEvidence(attemptId:string,evidence:PersistedEvidence[]):Promise<void>;
  finishAttempt(attemptId:string,status:'completed'|'abandoned',at:string):Promise<Attempt>;
  loadEvidenceForConcept(conceptId:string):Promise<PersistedEvidence[]>;
  saveMastery(mastery:ConceptMastery):Promise<void>;
  loadMastery(conceptId:string):Promise<ConceptMastery|undefined>;
  saveAssessment(result:AssessmentResult):Promise<void>;
}

export interface OrchestratorOptions {
  now?:()=>string;
  newId?:()=>string;
  versionPolicy?:MasteryVersionPolicy;
  transferRequired?:(conceptId:string)=>boolean;
}
