import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperimentEngine } from '../src/engines/experiment/engine.ts';

const evidence={id:'ev.exp.1',conceptId:'concept.c1',activityId:'practice.experiment.demo',activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-09-15T00:00:00.000Z',score:1,evidenceClass:'practice-observation',type:'procedure',stepId:'mix',accepted:true};
const scenario={id:'scenario.demo',version:'1.0.0',steps:[
  {id:'select',dependencies:[],mode:'required',allowedActions:['selectApparatus'],completionRule:{actionType:'selectApparatus'}},
  {id:'mix',dependencies:['select'],mode:'required',allowedActions:['mix'],completionRule:{actionType:'mix'}},
  {id:'heat',dependencies:['select'],mode:'optional',allowedActions:['heat'],completionRule:{actionType:'heat'}},
  {id:'observe',dependencies:['mix'],mode:'repeatable',allowedActions:['observe'],completionRule:{actionType:'observe'}},
]};

test('ExperimentEngine enforces dependencies and structured invalid/unsafe outcomes',()=>{
  const engine=new ExperimentEngine(scenario,(state,action,step)=>{
    if(action.type==='heat') return {status:'unsafe',code:'UNSAFE_ACTION',feedbackKey:'unsafe.heat'};
    if(step.id==='mix') return {status:'accepted',evidence:[evidence]};
    return {status:'accepted'};
  });
  assert.equal(engine.dispatch({type:'mix'}).status,'invalid');
  assert.equal(engine.dispatch({type:'selectApparatus'}).status,'accepted');
  const unsafe=engine.dispatch({type:'heat'});
  assert.deepEqual(unsafe,{status:'unsafe',code:'UNSAFE_ACTION',feedbackKey:'unsafe.heat'});
  assert.equal(engine.dispatch({type:'mix'}).status,'accepted');
  assert.equal(engine.getState().status,'complete');
  assert.deepEqual(engine.getEvidence(),[evidence]);
});

test('ExperimentEngine allows repeatable steps and serializes/restores state',()=>{
  const engine=new ExperimentEngine(scenario,()=>({status:'accepted'}));
  engine.dispatch({type:'selectApparatus'});
  engine.dispatch({type:'mix'});
  assert.equal(engine.dispatch({type:'observe'}).status,'accepted');
  assert.equal(engine.dispatch({type:'observe'}).status,'accepted');
  const serialized=engine.serialize();
  const restored=new ExperimentEngine(scenario,()=>({status:'accepted'}));
  restored.restore(serialized);
  assert.deepEqual(restored.getState(),engine.getState());
});
