import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine } from '../src/engines/case/engine.ts';

const config={
  activityId:'practice.case.demo',activityVersion:'1',contentVersion:'1',scoringVersion:'1',conceptId:'concept.c1',now:()=> '2026-09-15T00:00:00.000Z',
  allowedEvidenceIds:['e.air','e.traffic','e.weather'],minEvidenceSelections:2,justificationThreshold:.6,
  rubric:{evidenceUse:25,scientificAccuracy:35,reasoning:25,decisionQuality:15},
  decisionScorer:(decision,selected)=>decision==='reduce-traffic'&&selected.includes('e.traffic')?1:.4,
  justificationScorer:(text)=>text.includes('NO2')?{scientificAccuracy:.9,reasoning:.8}:{scientificAccuracy:.2,reasoning:.2},
};

test('CaseEngine requires evidence and sufficient scientific justification before completion',()=>{
  const engine=new CaseEngine(config);
  engine.selectEvidence('e.traffic'); engine.setDecision('reduce-traffic'); engine.setJustification('NO2 evidence supports action');
  assert.deepEqual(engine.complete(),{status:'blocked',code:'CASE_EVIDENCE_REQUIRED'});
  engine.selectEvidence('e.air'); engine.setJustification('because pollution');
  assert.deepEqual(engine.complete(),{status:'blocked',code:'CASE_JUSTIFICATION_INSUFFICIENT'});
  engine.setJustification('NO2 measurements and traffic evidence support reducing traffic emissions');
  const result=engine.complete();
  assert.equal(result.status,'complete');
  assert.ok(result.score>=.75);
  assert.equal(engine.getState().status,'complete');
  assert.equal(engine.getEvidence().length,1);
});

test('CaseEngine rejects unknown evidence and serializes/restores work in progress',()=>{
  const a=new CaseEngine(config);
  assert.throws(()=>a.selectEvidence('e.unknown'),/CASE_EVIDENCE_UNKNOWN/);
  a.selectEvidence('e.air'); a.setDecision('inspect'); a.setJustification('draft'); a.setReflection('reflection');
  const b=new CaseEngine(config); b.restore(a.serialize());
  assert.deepEqual(b.getState(),a.getState());
});
