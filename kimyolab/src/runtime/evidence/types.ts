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
  /** The learner's response (e.g. selected option id) — audit trail for objective assessment items. */
  response?: string;
  /** Version of the assessed item, when it differs in lifecycle from the activity/bank version. */
  itemVersion?: string;
}
/**
 * P1.5: one hydrolysis prediction trial (answer evidence with the full trial). `correct` compares the prediction
 * with the domain's medium; `score` is 1 only for a correct prediction made BEFORE the indicator revealed it.
 */
export interface HydrolysisPredictionEvidence extends AnswerEvidence {
  /** explicit discriminator (P1.5 closeout): the subtype is never inferred from optional fields */
  answerKind: 'hydrolysis-prediction';
  selectedSalt: string;
  predictedMedium: 'acidic' | 'basic' | 'neutral';
  actualMedium: 'acidic' | 'basic' | 'neutral';
  predictedBeforeReveal: boolean;
}
/** P1.6: one distinct modeled pair the learner mixed (reaction or explicit modeled no-reaction; never "not modeled"). */
export interface IonicMixingObservationEvidence extends ObservationEvidence {
  observationKind: 'ionic-mixing';
  reagents: string[];
  outcome: 'reaction' | 'no-reaction';
  reactionId: string;
}
/** P1.6: one net ionic equation the learner submitted, with the expected equation (from IonicEngine) for audit. */
export interface NetIonicAnswerEvidence extends AnswerEvidence {
  answerKind: 'net-ionic-equation';
  reactionId: string;
  response: string;
  canonicalExpected: string;
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

const HYDROLYSIS_FIELDS = ['selectedSalt', 'predictedMedium', 'actualMedium', 'predictedBeforeReveal'];
const NET_IONIC_FIELDS = ['canonicalExpected'];
const IONIC_MIXING_FIELDS = ['observationKind', 'reagents', 'outcome'];
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
      // P1.6: explicit subtype; its fields are reserved (a stray or partial record is rejected)
      if (input.observationKind === 'ionic-mixing') {
        if (!Array.isArray(input.reagents) || input.reagents.length !== 2 || !input.reagents.every(text)) invalid('ionic mixing reagents required');
        if (input.outcome !== 'reaction' && input.outcome !== 'no-reaction') invalid('ionic mixing outcome must be a modeled result');
        if (!text(input.reactionId)) invalid('ionic mixing reactionId required');
      } else if (input.observationKind !== undefined) invalid('unknown observationKind');
      else if (IONIC_MIXING_FIELDS.some((k) => input[k] !== undefined)) invalid('ionic mixing fields require observationKind');
      break;
    case 'answer':
      if (!text(input.questionId) || typeof input.correct !== 'boolean') invalid('answer fields required');
      if (input.response !== undefined && !text(input.response)) invalid('answer response must be text');
      if (input.itemVersion !== undefined && !text(input.itemVersion)) invalid('answer itemVersion must be text');
      // P1.5 closeout / P1.6: answer subtypes are identified by an explicit discriminator (answerKind). Each
      // subtype's fields are reserved: another answer may not carry them, and a partial record is rejected.
      if (input.answerKind !== undefined && input.answerKind !== 'hydrolysis-prediction' && input.answerKind !== 'net-ionic-equation') invalid('unknown answerKind');
      if (input.answerKind === 'net-ionic-equation') {
        if (!text(input.reactionId) || !text(input.response) || !text(input.canonicalExpected)) invalid('net ionic fields required');
      } else if (NET_IONIC_FIELDS.some((k) => input[k] !== undefined)) invalid('net ionic fields require answerKind');
      if (input.answerKind === 'hydrolysis-prediction') {
        const media = ['acidic', 'basic', 'neutral'];
        if (!text(input.selectedSalt) || !media.includes(String(input.predictedMedium)) || !media.includes(String(input.actualMedium)) || typeof input.predictedBeforeReveal !== 'boolean') invalid('hydrolysis prediction fields required');
        if (input.correct !== (input.predictedMedium === input.actualMedium)) invalid('hydrolysis correct must match prediction');
        if (input.score > 0 && !input.predictedBeforeReveal) invalid('a prediction after the reveal earns no credit');
      } else if (HYDROLYSIS_FIELDS.some((k) => input[k] !== undefined)) invalid('hydrolysis fields require answerKind');
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
  /** Absent while the attempt is in progress. */
  completedAt?: string;
  /**
   * Lifecycle (P1.0). Records written before P1.0 have no status and are completed attempts.
   * in_progress → completed | abandoned; terminal states are never changed again.
   */
  status?: AttemptStatus;
  /** P1.1: what kind of learner activity the attempt is. Absent = practice (all pre-P1.1 records). */
  attemptType?: AttemptType;
}

export type AttemptType = 'practice' | 'assessment';

export type AttemptStatus = 'in_progress' | 'completed' | 'abandoned';

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
  for (const key of ['id','learningUnitId','activityId','activityVersion','contentVersion','scoringVersion','startedAt']) {
    if (!text(input[key])) throw new Error(`ATTEMPT_INVALID: ${key} required`);
  }
  if (input.status !== undefined && !['in_progress','completed','abandoned'].includes(String(input.status))) throw new Error('ATTEMPT_INVALID: unknown status');
  const inProgress = input.status === 'in_progress';
  if (inProgress ? input.completedAt !== undefined : !text(input.completedAt)) throw new Error(inProgress ? 'ATTEMPT_INVALID: in_progress attempt cannot have completedAt' : 'ATTEMPT_INVALID: completedAt required');
  if (!Number.isFinite(Date.parse(String(input.startedAt))) || (!inProgress && !Number.isFinite(Date.parse(String(input.completedAt))))) throw new Error('ATTEMPT_INVALID: timestamps must be ISO dates');
  if (input.userId !== undefined && !text(input.userId)) throw new Error('ATTEMPT_INVALID: userId must be text');
  if (input.attemptType !== undefined && !['practice','assessment'].includes(String(input.attemptType))) throw new Error('ATTEMPT_INVALID: unknown attemptType');
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
  completedAt?: string;
  status?: AttemptStatus;
  attemptType?: AttemptType;
}

/**
 * Binds engine evidence drafts to a brand-new Attempt. Pure: ids come from `newId`.
 * Calling this twice for the same activity always yields two disjoint sets of records.
 */
export function bindEvidenceToAttempt(input: AttemptInput, drafts: unknown[], newId: () => string): {attempt: Attempt; evidence: PersistedEvidence[]} {
  const attempt = validateAttempt({...input, id: newId()});
  return {attempt, evidence: bindDraftsToAttempt(attempt, drafts, newId)};
}

/** Binds further engine drafts to an existing Attempt (fresh UUID per record, same version checks). */
export function bindDraftsToAttempt(attempt: Attempt, drafts: unknown[], newId: () => string): PersistedEvidence[] {
  const input = attempt;
  return drafts.map((raw) => {
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
}

/** Identity of an engine draft for de-duplication inside one attempt: everything except its run timestamp. */
export function draftSignature(draft: Evidence): string {
  const {createdAt: _createdAt, ...rest} = draft as Evidence & Record<string, unknown>;
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(stable(rest));
}
