export type LearningUnitProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'practice_complete'
  | 'assessment_complete'
  | 'mastered'
  | 'needs_review';

export interface LearningUnitProgress {
  learningUnitId:string;
  status:LearningUnitProgressStatus;
  activityStates:Record<string,string>;
  lastVisitedAt:string;
  contentVersion:string;
  schemaVersion:string;
}
