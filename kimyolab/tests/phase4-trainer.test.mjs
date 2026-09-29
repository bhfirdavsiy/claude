import test from 'node:test';
import assert from 'node:assert/strict';
import { TrainerEngine } from '../src/engines/trainer/engine.ts';

const config={
  activityId:'practice.trainer.demo',activityVersion:'1',contentVersion:'1',scoringVersion:'1',
  question:{id:'q.1',promptKey:'q.1.prompt'},
  attemptPolicy:{maxAttempts:3,hintAfterAttempts:[1,2],explanationAfter:'success'},
  hints:['hint.concept','hint.strategy','hint.partial'],
  explanationKey:'explain.q1',
  validator:(answer)=>answer==='H2O'?{correct:true,score:1,feedbackKey:'correct'}:{correct:false,score:0.2,feedbackKey:'wrong'},
  now:()=> '2026-09-15T00:00:00.000Z',
};

test('TrainerEngine implements attempt, specific feedback, hint ladder, retry and explanation flow',()=>{
  const engine=new TrainerEngine(config);
  let r=engine.submit('HO2');
  assert.equal(r.correct,false); assert.equal(r.feedbackKey,'wrong');
  assert.deepEqual(engine.getState().shownHints,['hint.concept']);
  r=engine.submit('H3O');
  assert.deepEqual(engine.getState().shownHints,['hint.concept','hint.strategy']);
  r=engine.submit('H2O');
  assert.equal(r.correct,true);
  const state=engine.getState();
  assert.equal(state.status,'correct');
  assert.equal(state.explanationVisible,true);
  assert.equal(state.attempts,3);
  assert.equal(engine.getEvidence().length,3);
});

test('TrainerEngine serializes and restores attempts/evidence',()=>{
  const a=new TrainerEngine(config); a.submit('bad');
  const b=new TrainerEngine(config); b.restore(a.serialize());
  assert.deepEqual(b.getState(),a.getState());
  assert.deepEqual(b.getEvidence(),a.getEvidence());
});
