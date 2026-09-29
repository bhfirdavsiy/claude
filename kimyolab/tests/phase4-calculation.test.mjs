import test from 'node:test';
import assert from 'node:assert/strict';
import { CalculationEngine } from '../src/engines/calculation/engine.ts';

const config={
  activityId:'practice.calculation.demo',activityVersion:'1',contentVersion:'1',scoringVersion:'1',conceptId:'concept.c1',now:()=> '2026-09-15T00:00:00.000Z',
  steps:[
    {id:'atoms',validator:(r)=>({accepted:r.value===2&&r.unit==='count',score:r.value===2?1:0,feedbackKey:r.value===2?'correct':'wrong'})},
    {id:'mass',validator:(r)=>({accepted:Math.abs(r.value-18)<0.001&&r.unit==='g/mol',score:Math.abs(r.value-18)<0.001?1:0,feedbackKey:Math.abs(r.value-18)<0.001?'correct':'wrong'})},
  ]
};

test('CalculationEngine enforces ordered step validation and does not score final-number-only',()=>{
  const engine=new CalculationEngine(config);
  assert.deepEqual(engine.submit('mass',{value:18,unit:'g/mol'}),{status:'invalid',code:'CALCULATION_STEP_OUT_OF_ORDER',expectedStepId:'atoms'});
  let r=engine.submit('atoms',{value:1,unit:'count'});
  assert.equal(r.status,'rejected');
  assert.equal(engine.getState().currentStepIndex,0);
  r=engine.submit('atoms',{value:2,unit:'count'});
  assert.equal(r.status,'accepted');
  assert.equal(engine.getState().currentStepIndex,1);
  r=engine.submit('mass',{value:18,unit:'g/mol'});
  assert.equal(r.status,'accepted');
  assert.equal(engine.getState().status,'complete');
  assert.equal(engine.getEvidence().length,2);
});

test('CalculationEngine serializes and restores intermediate progress',()=>{
  const a=new CalculationEngine(config); a.submit('atoms',{value:2,unit:'count'});
  const b=new CalculationEngine(config); b.restore(a.serialize());
  assert.deepEqual(b.getState(),a.getState());
  assert.deepEqual(b.getEvidence(),a.getEvidence());
});
