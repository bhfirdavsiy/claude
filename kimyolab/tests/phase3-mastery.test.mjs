import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConceptMastery } from '../src/domain/mastery/mastery.ts';

function ev(id, score, evidenceClass, createdAt, activityId=`activity.${id}`){
  return {id,conceptId:'concept.c1',activityId,activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt,score,evidenceClass,type:'answer',questionId:`q.${id}`,correct:score>=.75};
}

const dates=['2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z','2026-09-03T00:00:00.000Z'];

test('returns not_started when no evidence exists',()=>{
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:[],scoringVersion:'1.0.0'});
  assert.equal(m.status,'not_started');
  assert.equal(m.confidence,0);
});

test('requires three independent evidence records including assessment and transfer when required',()=>{
  const evidence=[
    ev('1',.9,'practice-observation',dates[0]),
    ev('2',.9,'concept-assessment',dates[1]),
    ev('3',.9,'transfer-case',dates[2]),
  ];
  // Evidence fixtures are scored with scoring model '1'; mastery must be computed under the same version (P0.5).
  const m=computeConceptMastery({conceptId:'concept.c1',evidence,scoringVersion:'1',transferRequired:true});
  assert.equal(m.status,'mastered');
  assert.ok(m.confidence>=.75);
  assert.equal(m.evidenceIds.length,3);
});

test('does not award mastery when minimum independent evidence or transfer evidence is missing',()=>{
  const two=[ev('1',1,'concept-assessment',dates[0]),ev('2',1,'transfer-case',dates[1])];
  assert.equal(computeConceptMastery({conceptId:'concept.c1',evidence:two,scoringVersion:'1'}).status,'developing');
  const noTransfer=[ev('1',1,'practice-observation',dates[0]),ev('2',1,'trainer-calculation',dates[1]),ev('3',1,'concept-assessment',dates[2])];
  assert.equal(computeConceptMastery({conceptId:'concept.c1',evidence:noTransfer,scoringVersion:'1',transferRequired:true}).status,'developing');
});

test('uses class weights so concept assessment contributes more than practice observation',()=>{
  const assessmentHigh=[ev('1',1,'concept-assessment',dates[0]),ev('2',0,'practice-observation',dates[0])];
  const observationHigh=[ev('1',0,'concept-assessment',dates[0]),ev('2',1,'practice-observation',dates[0])];
  const a=computeConceptMastery({conceptId:'concept.c1',evidence:assessmentHigh,scoringVersion:'1'});
  const b=computeConceptMastery({conceptId:'concept.c1',evidence:observationHigh,scoringVersion:'1'});
  assert.ok(a.confidence>b.confidence);
});

test('recent conflicting evidence carries more weight than equally classified older evidence',()=>{
  const lowNewest=[ev('1',1,'concept-assessment',dates[0]),ev('2',0,'concept-assessment',dates[2])];
  const lowOldest=[ev('1',0,'concept-assessment',dates[0]),ev('2',1,'concept-assessment',dates[2])];
  const a=computeConceptMastery({conceptId:'concept.c1',evidence:lowNewest,scoringVersion:'1'});
  const b=computeConceptMastery({conceptId:'concept.c1',evidence:lowOldest,scoringVersion:'1'});
  assert.ok(a.confidence<b.confidence);
});

test('applies needs_review and developing thresholds',()=>{
  const low=[ev('1',.2,'concept-assessment',dates[0])];
  const mid=[ev('1',.6,'concept-assessment',dates[0])];
  assert.equal(computeConceptMastery({conceptId:'concept.c1',evidence:low,scoringVersion:'1'}).status,'needs_review');
  assert.equal(computeConceptMastery({conceptId:'concept.c1',evidence:mid,scoringVersion:'1'}).status,'developing');
});
