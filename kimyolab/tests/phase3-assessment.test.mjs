import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAssessment } from '../src/domain/assessment/scoring.ts';

const ev=(id, conceptId, score)=>({
  id, conceptId, activityId:'practice.trainer.demo', activityVersion:'1.0.0', contentVersion:'2026.09.1', scoringVersion:'1.0.0', createdAt:'2026-09-15T00:00:00.000Z',
  score, evidenceClass:'concept-assessment', type:'answer', questionId:`q.${id}`, correct:score>=0.75,
});

test('scores assessment deterministically on a 0..100 scale', () => {
  const result=scoreAssessment({
    id:'assessment.demo', learningUnitId:'lu.7.01', evidence:[ev('1','c1',1),ev('2','c1',0.5),ev('3','c2',0.25)],
    assessmentVersion:'1.0.0', scoringVersion:'1.0.0',
  });
  assert.equal(result.score,58.33);
  assert.deepEqual(result.conceptEvidenceIds,['1','2','3']);
});

test('detects weak concepts by concept-level mean and derives remediation IDs', () => {
  const result=scoreAssessment({
    id:'assessment.demo', learningUnitId:'lu.7.01', evidence:[ev('1','c1',1),ev('2','c1',0.8),ev('3','c2',0.4)],
    assessmentVersion:'1.0.0', scoringVersion:'1.0.0', weakThreshold:0.75,
  });
  assert.deepEqual(result.weakConceptIds,['c2']);
  assert.deepEqual(result.recommendedRemediationIds,['remediation.c2']);
});

test('rejects empty assessment evidence rather than inventing a score', () => {
  assert.throws(()=>scoreAssessment({id:'a',learningUnitId:'lu',evidence:[],assessmentVersion:'1',scoringVersion:'1'}),/ASSESSMENT_EVIDENCE_REQUIRED/);
});
