import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';
import { IonicEngine } from '../src/domain/chemistry/ionic-engine.ts';
import { createExperimentSliceAdapter } from '../src/runtime/reference-slices/experiment-adapter.ts';
import { loadReferenceSliceRegistry } from '../src/runtime/reference-slices/config.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const registry=loadReferenceSliceRegistry(read('content-src/activity-configs/reference-slices.json'));
const practices=read('content-src/practice-activities.json');
const reactions=read('content-src/chemistry/reactions.json');
const solutionRules=read('content-src/chemistry/solubility.json');
const matcher=ReactionMatcher.from(reactions);
const ionic=IonicEngine.from({reactions,rules:solutionRules});
const activity=(id)=>practices.find(x=>x.id===id);
const meta={contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=> '2026-09-15T00:00:00.000Z'};

function adapter(){return createExperimentSliceAdapter({registry,reactionMatcher:matcher,ionicEngine:ionic,...meta});}

test('7.03 separation rejects filtering before dissolve and completes correct sequence',async()=>{
  const a=adapter();
  const item=activity('practice.experiment.7.2');
  const invalid=await a.run(item,{inputs:{[item.id]:{actions:[{type:'filter'}]}}});
  assert.equal(invalid.outcomes[0].status,'invalid');
  assert.equal(invalid.outcomes[0].code,'INVALID_ACTION');

  const complete=await a.run(item,{inputs:{[item.id]:{actions:[
    {type:'selectApparatus'}, {type:'addWater'}, {type:'addMixture'}, {type:'mix'},
    {type:'filter'}, {type:'evaporate'}, {type:'observe'}
  ]}}});
  assert.equal(complete.finalState.status,'complete');
  assert.ok(complete.evidence.some(e=>e.type==='procedure'&&e.stepId==='filter'));
  assert.ok(complete.evidence.some(e=>e.type==='observation'));
  assert.ok(complete.serializedState.length>20);
});

test('8.16 reactive slice uses curated matcher and ionic engine for AgNO3 + NaCl',async()=>{
  const a=adapter();
  const item=activity('practice.experiment.8.1');
  const result=await a.run(item,{inputs:{[item.id]:{actions:[
    {type:'selectApparatus'}, {type:'addNaCl'}, {type:'addAgNO3'}, {type:'observe'},
    {type:'record',payload:{netIonicEquation:'Ag+ + Cl- → AgCl(s)'}}
  ]}}});
  assert.equal(result.finalState.status,'complete');
  const precipitate=result.evidence.find(e=>e.type==='observation');
  assert.equal(precipitate.observation.type,'precipitate');
  assert.equal(precipitate.observation.color,'white');
  const symbolic=result.evidence.find(e=>e.type==='answer'&&e.questionId==='net-ionic-equation');
  assert.equal(symbolic.correct,true);
});

test('8.16 reactive slice returns REACTION_NOT_MODELED for an unknown reactant pair',async()=>{
  const a=adapter();
  const item=activity('practice.experiment.8.1');
  const result=await a.run(item,{inputs:{[item.id]:{actions:[
    {type:'selectApparatus'}, {type:'addNaCl'},
    {type:'addAgNO3',payload:{reactants:[{formula:'H2O',phase:'l'},{formula:'NaCl',phase:'aq'}]}}
  ]}}});
  assert.equal(result.outcomes.at(-1).status,'invalid');
  assert.equal(result.outcomes.at(-1).code,'REACTION_NOT_MODELED');
  assert.equal(result.finalState.status,'in_progress');
});
