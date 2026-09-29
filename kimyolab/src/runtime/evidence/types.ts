import type { Observation } from '../../domain/chemistry/types.ts';

export type EvidenceClass =
  | 'practice-observation'
  | 'trainer-calculation'
  | 'concept-assessment'
  | 'transfer-case';

interface EvidenceBase {
  id: string;
  conceptId: string;
  activityId: string;
  activityVersion: string;
  contentVersion: string;
  scoringVersion: string;
  createdAt: string;
  score: number;
  evidenceClass: EvidenceClass;
  independenceKey?: string;
}

export interface ObservationEvidence extends EvidenceBase {
  type: 'observation';
  observation: Observation;
}
export interface AnswerEvidence extends EvidenceBase {
  type: 'answer';
  questionId: string;
  correct: boolean;
}
export interface CalculationEvidence extends EvidenceBase {
  type: 'calculation';
  stepId: string;
  value: number;
  unit: string;
}
export interface DecisionEvidence extends EvidenceBase {
  type: 'decision';
  rubricScores: Record<string, number>;
}
export interface ConstructionEvidence extends EvidenceBase {
  type: 'construction';
  targetId: string;
  achieved: boolean;
}
export interface ProcedureEvidence extends EvidenceBase {
  type: 'procedure';
  stepId: string;
  accepted: boolean;
}

export type Evidence =
  | ObservationEvidence
  | AnswerEvidence
  | CalculationEvidence
  | DecisionEvidence
  | ConstructionEvidence
  | ProcedureEvidence;

const CLASSES = new Set<EvidenceClass>([
  'practice-observation',
  'trainer-calculation',
  'concept-assessment',
  'transfer-case',
]);
const TYPES = new Set(['observation', 'answer', 'calculation', 'decision', 'construction', 'procedure']);

function invalid(message: string): never {
  throw new Error(`EVIDENCE_INVALID: ${message}`);
}
function text(v: unknown): v is string { return typeof v === 'string' && v.length > 0; }
function object(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }

export function validateEvidence(input: unknown): Evidence {
  if (!object(input)) invalid('record required');
  for (const key of ['id','conceptId','activityId','activityVersion','contentVersion','scoringVersion','createdAt']) {
    if (!text(input[key])) invalid(`${key} required`);
  }
  if (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < 0 || input.score > 1) invalid('score must be 0..1');
  if (!CLASSES.has(input.evidenceClass as EvidenceClass)) invalid('unknown evidenceClass');
  if (!TYPES.has(String(input.type))) invalid('unknown type');

  switch (input.type) {
    case 'observation':
      if (!object(input.observation) || !text(input.observation.type)) invalid('observation required');
      break;
    case 'answer':
      if (!text(input.questionId) || typeof input.correct !== 'boolean') invalid('answer fields required');
      break;
    case 'calculation':
      if (!text(input.stepId) || typeof input.value !== 'number' || !Number.isFinite(input.value) || !text(input.unit)) invalid('calculation fields required');
      break;
    case 'decision':
      if (!object(input.rubricScores) || Object.values(input.rubricScores).some(v => typeof v !== 'number' || !Number.isFinite(v))) invalid('rubricScores required');
      break;
    case 'construction':
      if (!text(input.targetId) || typeof input.achieved !== 'boolean') invalid('construction fields required');
      break;
    case 'procedure':
      if (!text(input.stepId) || typeof input.accepted !== 'boolean') invalid('procedure fields required');
      break;
  }
  return input as unknown as Evidence;
}

// ---------------------------------------------------------------------------
// Evidence v2 — immutable attempts and persisted evidence (P0.4).
//
// Engines still emit `Evidence` drafts whose `id` is derived from the activity
// (e.g. `practice.x.procedure.mix`). Those ids are NOT unique across attempts, so
// they are never used as storage keys. Every persisted record gets a fresh UUID
// and is bound to the Attempt that produced it; the engine id is kept only as
// `sourceEvidenceId` for traceability.
// ---------------------------------------------------------------------------

export type EvidenceCorrectness = 'correct' | 'incorrect' | 'partial' | 'not_applicable';

export interface Attempt {
  id: string;
  userId?: string;
  learningUnitId: string;
  activityId: string;
  activityVersion: string;
  contentVersion: string;
  scoringVersion: string;
  curriculumVersion?: string;
  startedAt: string;
  completedAt: string;
}

export type PersistedEvidence = Evidence & {
  attemptId: string;
  learningUnitId: string;
  sourceEvidenceId: string;
  correctness: EvidenceCorrectness;
  confidence?: number;
  curriculumVersion?: string;
};

export function validateAttempt(input: unknown): Attempt {
  if (!object(input)) throw new Error('ATTEMPT_INVALID: record required');
  for (const key of ['id','learningUnitId','activityId','activityVersion','contentVersion','scoringVersion','startedAt','completedAt']) {
    if (!text(input[key])) throw new Error(`ATTEMPT_INVALID: ${key} required`);
  }
  if (!Number.isFinite(Date.parse(String(input.startedAt))) || !Number.isFinite(Date.parse(String(input.completedAt)))) throw new Error('ATTEMPT_INVALID: timestamps must be ISO dates');
  if (input.userId !== undefined && !text(input.userId)) throw new Error('ATTEMPT_INVALID: userId must be text');
  return input as unknown as Attempt;
}

export function validatePersistedEvidence(input: unknown): PersistedEvidence {
  const base = validateEvidence(input) as Evidence & Record<string, unknown>;
  for (const key of ['attemptId','learningUnitId','sourceEvidenceId']) {
    if (!text(base[key])) invalid(`${key} required for persisted evidence`);
  }
  if (!['correct','incorrect','partial','not_applicable'].includes(String(base.correctness))) invalid('correctness required for persisted evidence');
  if (base.confidence !== undefined && (typeof base.confidence !== 'number' || !Number.isFinite(base.confidence) || base.confidence < 0 || base.confidence > 1)) invalid('confidence must be 0..1');
  if (base.id === base.activityId || base.id === base.sourceEvidenceId) invalid('persisted evidence id must not reuse activity or engine ids');
  return base as unknown as PersistedEvidence;
}

export function deriveCorrectness(evidence: Evidence): EvidenceCorrectness {
  switch (evidence.type) {
    case 'answer': return evidence.correct ? 'correct' : 'incorrect';
    case 'construction': return evidence.achieved ? 'correct' : 'incorrect';
    case 'procedure': return evidence.accepted ? 'correct' : 'incorrect';
    case 'decision':
    case 'calculation':
      return evidence.score >= 1 ? 'correct' : evidence.score <= 0 ? 'incorrect' : 'partial';
    default: return 'not_applicable';
  }
}

export interface AttemptInput {
  learningUnitId: string;
  activityId: string;
  activityVersion: string;
  contentVersion: string;
  scoringVersion: string;
  curriculumVersion?: string;
  userId?: string;
  startedAt: string;
  completedAt: string;
}

/**
 * Binds engine evidence drafts to a brand-new Attempt. Pure: ids come from `newId`.
 * Calling this twice for the same activity always yields two disjoint sets of records.
 */
export function bindEvidenceToAttempt(input: AttemptInput, drafts: unknown[], newId: () => string): {attempt: Attempt; evidence: PersistedEvidence[]} {
  const attempt = validateAttempt({...input, id: newId()});
  const evidence = drafts.map((raw) => {
    const draft = validateEvidence(raw);
    if (draft.contentVersion !== input.contentVersion) throw new Error(`EVIDENCE_VERSION_MISMATCH: contentVersion ${draft.contentVersion} != ${input.contentVersion}`);
    if (draft.scoringVersion !== input.scoringVersion) throw new Error(`EVIDENCE_VERSION_MISMATCH: scoringVersion ${draft.scoringVersion} != ${input.scoringVersion}`);
    const record = {
      ...draft,
      id: newId(),
      sourceEvidenceId: draft.id,
      attemptId: attempt.id,
      learningUnitId: input.learningUnitId,
      correctness: deriveCorrectness(draft),
      ...(input.curriculumVersion ? {curriculumVersion: input.curriculumVersion} : {}),
    };
    return validatePersistedEvidence(record);
  });
  return {attempt, evidence};
}
