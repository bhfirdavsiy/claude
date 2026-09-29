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
