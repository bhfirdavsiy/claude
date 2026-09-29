export type LearningUnitProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'practice_complete'
  | 'assessment_complete'
  | 'mastered'
  | 'needs_review';

/** Version of the *progress record* format (not the content pack schema). */
export const PROGRESS_SCHEMA_VERSION='2.0.0';

export interface LearningUnitProgress {
  learningUnitId:string;
  status:LearningUnitProgressStatus;
  activityStates:Record<string,string>;
  lastVisitedAt:string;
  contentVersion:string;
  /** Progress record format version. */
  schemaVersion:string;
  /** Content pack schema version the record was written against (informational). */
  contentSchemaVersion?:string;
}
