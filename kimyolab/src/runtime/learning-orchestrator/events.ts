// Two separate vocabularies (P1.0 §7):
//  * LearningIntent — what the UI/adapters ASK for. Only the orchestrator interprets intents.
//  * ProgressEvent  — what HAPPENED, emitted by the orchestrator and applied by the pure reducer.
import type {PracticeSessionState,VersionContext,PracticeEnginePort} from './types.ts';
import type {PracticeType} from '../../domain/content/types.ts';
export type {ProgressEvent} from '../progress/reducer.ts';

export type LearningIntent =
  | {type:'OPEN_UNIT';learningUnitId:string;versions:VersionContext}
  | {type:'COMPLETE_THEORY';learningUnitId:string;versions:VersionContext}
  | {type:'BEGIN_PRACTICE';learningUnitId:string;activityId:string;activityVersion:string;practiceType:PracticeType;versions:VersionContext;engine?:PracticeEnginePort;conceptIds?:string[]}
  | {type:'APPLY_PRACTICE_COMMAND';session:PracticeSessionState;command:unknown}
  | {type:'APPLY_PRACTICE_RESULT';session:PracticeSessionState;result:unknown}
  | {type:'COMPLETE_PRACTICE';session:PracticeSessionState}
  | {type:'ABANDON_PRACTICE';session:PracticeSessionState}
  | {type:'RETRY_PRACTICE';session:PracticeSessionState}
  | {type:'SUBMIT_REINFORCEMENT';learningUnitId:string;versions:VersionContext;payload:Record<string,unknown>}
  | {type:'SUBMIT_ASSESSMENT';learningUnitId:string;versions:VersionContext;assessmentVersion:string;drafts:unknown[];conceptIds:string[]}
  | {type:'RECOMPUTE_MASTERY';conceptIds:string[];versions:Pick<VersionContext,'contentVersion'|'scoringVersion'|'curriculumVersion'>};

export type LearningIntentType=LearningIntent['type'];
