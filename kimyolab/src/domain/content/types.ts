export type PracticeType = 'experiment' | 'simulation' | 'trainer' | 'calculation' | 'case';
export type CoverageStatus = 'none' | 'partial' | 'full' | 'not_applicable';
export type ActivityLifecycleStatus = 'draft' | 'planned' | 'in_progress' | 'implemented' | 'ready' | 'deprecated';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface SourceRef {
  id: string;
  type: 'textbook' | 'curriculum' | 'standard' | 'reference' | 'expert-review' | 'internal';
  title: string;
  edition?: string;
  page?: string;
  url?: string;
  publisher?: string;
  year?: number;
  license?: string;
}

export interface ApprovalRecord {
  status: ApprovalStatus;
  reviewerId: string;
  reviewerRole: string;
  reviewedVersion: string;
  reviewedHash: string;
  reviewedAt: string;
  notes?: string;
}

export interface ApprovalState {
  technical: ApprovalRecord;
  chemistry: ApprovalRecord | 'not_applicable';
  didactic: ApprovalRecord;
  accessibility: ApprovalRecord;
}

export interface Concept {
  id: string;
  name: string;
  gradeRange: number[];
  prerequisiteIds: string[];
  relatedConceptIds: string[];
  representations: Array<'macro' | 'micro' | 'symbolic'>;
  misconceptionIds: string[];
  synonyms: Record<string, string[]>;
  sourceRefs: SourceRef[];
}

export interface LearningUnit {
  id: string;
  grade: 7 | 8 | 9 | 10 | 11;
  title: string;
  chapter?: string;
  learningOutcomes: string[];
  conceptIds: string[];
  prerequisiteConceptIds: string[];
  lessonTemplates: string[];
  curriculumVersion: string;
  sourceRefs: SourceRef[];
  legacyIds: string[];
}

export interface TheoryActivity {
  id: string;
  title: string;
  conceptIds: string[];
  explanationBlocks: Array<{ type: string; text: string }>;
  representationModes: Array<'macro' | 'micro' | 'symbolic'>;
  interactionType?: string;
  interactionConfig?: Record<string, unknown>;
  misconceptionCheckIds: string[];
  lifecycleStatus: ActivityLifecycleStatus;
  approvals: ApprovalState;
  version: string;
  legacyIds: string[];
}

export interface PracticeActivity {
  id: string;
  type: PracticeType;
  title: string;
  goal: string;
  conceptIds: string[];
  prerequisiteConceptIds: string[];
  lifecycleStatus: ActivityLifecycleStatus;
  approvals: ApprovalState;
  accessibilityProfile: string[];
  engineCompatibility: { engine: PracticeType; range: string };
  sourceRefs: SourceRef[];
  legacyIds: string[];
  version: string;
  legacyContent?: Record<string, unknown>;
}

export interface MappingLink {
  id: string;
  learningUnitId: string;
  theoryActivityId?: string;
  practiceActivityId: string;
  conceptIds: string[];
  role: 'primary' | 'supporting' | 'remediation' | 'extension';
  required: boolean;
  coverageStatus: CoverageStatus;
}

export interface ContentPackManifest {
  contentVersion: string;
  curriculumVersion: string;
  schemaVersion: string;
  chemistryRulesVersion: string;
  assessmentVersion: string;
  scoringVersion: string;
  createdAt: string;
  checksum: string;
  compatibility: { minAppVersion: string; maxAppVersion?: string };
  grades: number[];
  files: Array<{ path: string; checksum: string; size: number }>;
}
