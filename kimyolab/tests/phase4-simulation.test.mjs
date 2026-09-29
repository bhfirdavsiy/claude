import test from 'node:test';
import assert from 'node:assert/strict';
import { StatefulSimulationEngine } from '../src/engines/simulation/engine.ts';

const ev=(id,value)=>({id,conceptId:'concept.c1',activityId:'practice.sim.demo',activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-09-15T00:00:00.000Z',score:1,evidenceClass:'practice-observation',type:'construction',targetId:`value.${value}`,achieved:true});

const config={
  id:'sim.demo',version:'1.0.0',seed:42,initialState:{value:0},
  reducer:(state,action)=>action.type==='inc'?{value:state.value+action.by}:state,
  evidenceCollector:(state,action)=>action.type==='inc'?[ev(`ev.${state.value}`,state.value)]:[],
};

test('SimulationEngine is deterministic, dispatches reducer actions and collects typed evidence',()=>{
  const a=new StatefulSimulationEngine(config);
  const b=new StatefulSimulationEngine(config);
  a.dispatch({type:'inc',by:2}); b.dispatch({type:'inc',by:2});
  assert.deepEqual(a.getState(),{value:2});
  assert.deepEqual(a.getState(),b.getState());
  assert.equal(a.getSeed(),42);
  assert.equal(a.getEvidence().length,1);
  assert.equal(a.getCapabilities().serializable,true);
});

test('SimulationEngine serializes/restores and resets to initial state',()=>{
  const a=new StatefulSimulationEngine(config); a.dispatch({type:'inc',by:3});
  const snapshot=a.serialize();
  const b=new StatefulSimulationEngine(config); b.restore(snapshot);
  assert.deepEqual(b.getState(),{value:3});
  assert.deepEqual(b.getEvidence(),a.getEvidence());
  b.reset();
  assert.deepEqual(b.getState(),{value:0});
  assert.deepEqual(b.getEvidence(),[]);
});
