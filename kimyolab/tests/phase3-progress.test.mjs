import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, reduceProgress, migrateProgressRecord } from '../src/runtime/progress/reducer.ts';

const t0='2026-09-15T00:00:00.000Z';
const t1='2026-09-15T00:10:00.000Z';

// P1.0 closeout: event names were made semantically distinct (PRACTICE_COMPLETED, ASSESSMENT_SUBMITTED,
// ASSESSMENT_EVALUATED). The invariant under test is unchanged: an evaluated objective assessment yields
// assessment_complete and a later mastery update refines it.
test('progress reducer follows deterministic learning-unit transitions',()=>{
  let p=createProgress('lu.7.01','2026.09.1','1.0.0',t0);
  assert.equal(p.status,'not_started');
  p=reduceProgress(p,{type:'OPEN',at:t1});
  assert.equal(p.status,'in_progress');
  p=reduceProgress(p,{type:'SAVE_ACTIVITY_STATE',activityId:'practice.demo',serializedState:'{"step":2}',at:t1});
  assert.equal(p.activityStates['practice.demo'],'{"step":2}');
  p=reduceProgress(p,{type:'PRACTICE_COMPLETED',at:t1});
  assert.equal(p.status,'practice_complete');
  p=reduceProgress(p,{type:'ASSESSMENT_SUBMITTED',attemptId:'a1',at:t1});
  assert.equal(p.status,'practice_complete','a submission alone is not an evaluated assessment');
  p=reduceProgress(p,{type:'ASSESSMENT_EVALUATED',attemptId:'a1',objectiveItems:2,score:1,at:t1});
  assert.equal(p.status,'assessment_complete');
  p=reduceProgress(p,{type:'MASTERY_UPDATED',masteryStatus:'mastered',at:t1});
  assert.equal(p.status,'mastered');
});

test('needs_review mastery overrides assessment_complete',()=>{
  let p=createProgress('lu.7.01','2026.09.1','1.0.0',t0);
  p=reduceProgress(p,{type:'OPEN',at:t1});
  p=reduceProgress(p,{type:'ASSESSMENT_EVALUATED',attemptId:'a1',objectiveItems:1,score:0.2,at:t1});
  p=reduceProgress(p,{type:'MASTERY_UPDATED',masteryStatus:'needs_review',at:t1});
  assert.equal(p.status,'needs_review');
});

test('migrates legacy complete records idempotently to schema v1',()=>{
  const legacy={learningUnitId:'lu.7.01',status:'complete',lastVisitedAt:t0,contentVersion:'2026.09.1'};
  const once=migrateProgressRecord(legacy,'1.0.0');
  assert.equal(once.status,'practice_complete');
  assert.equal(once.schemaVersion,'1.0.0');
  assert.deepEqual(once.activityStates,{});
  const twice=migrateProgressRecord(once,'1.0.0');
  assert.deepEqual(twice,once);
});
