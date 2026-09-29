import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../src/runtime/evidence/types.ts';

const base = {
  id: 'ev.1',
  conceptId: 'concept.c001',
  activityId: 'practice.trainer.demo',
  activityVersion: '1.0.0',
  contentVersion: '2026.09.1',
  scoringVersion: '1.0.0',
  createdAt: '2026-09-15T00:00:00.000Z',
  score: 0.8,
  evidenceClass: 'trainer-calculation',
};

const valid = [
  { ...base, type: 'observation', observation: { type: 'precipitate', color: 'white' } },
  { ...base, id: 'ev.2', type: 'answer', questionId: 'q.1', correct: true },
  { ...base, id: 'ev.3', type: 'calculation', stepId: 'step.1', value: 18, unit: 'g/mol' },
  { ...base, id: 'ev.4', type: 'decision', rubricScores: { evidenceUse: 0.8, scientificAccuracy: 0.9, reasoning: 0.7, decisionQuality: 0.8 } },
  { ...base, id: 'ev.5', type: 'construction', targetId: 'atom.C-14', achieved: true },
  { ...base, id: 'ev.6', type: 'procedure', stepId: 'filter', accepted: true },
];

test('accepts all six typed evidence discriminators with required version metadata', () => {
  for (const item of valid) assert.deepEqual(validateEvidence(item), item);
});

test('rejects unknown evidence discriminator and unversioned records', () => {
  assert.throws(() => validateEvidence({ ...base, type: 'mystery' }), /EVIDENCE_INVALID/);
  const { scoringVersion, ...withoutVersion } = valid[1];
  assert.throws(() => validateEvidence(withoutVersion), /EVIDENCE_INVALID/);
});

test('rejects evidence scores outside 0..1 and invalid evidence classes', () => {
  assert.throws(() => validateEvidence({ ...valid[1], score: 1.01 }), /EVIDENCE_INVALID/);
  assert.throws(() => validateEvidence({ ...valid[1], score: -0.01 }), /EVIDENCE_INVALID/);
  assert.throws(() => validateEvidence({ ...valid[1], evidenceClass: 'other' }), /EVIDENCE_INVALID/);
});
