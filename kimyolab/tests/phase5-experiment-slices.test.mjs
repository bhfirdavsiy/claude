import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';
import { IonicEngine } from '../src/domain/chemistry/ionic-engine.ts';
import { SpeciesRegistry } from '../src/domain/chemistry/species-registry.ts';
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

const speciesRegistry=SpeciesRegistry.from(read('content-src/chemistry/species.json'));
function adapter(){return createExperimentSliceAdapter({registry,reactionMatcher:matcher,ionicEngine:ionic,speciesRegistry,...meta});}

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
  // P1.6: the learner chooses the reagents and writes the equation (the old invariant — a fixed
  // addNaCl → addAgNO3 → observe → record script — was a scripted sequence, not a model-based choice)
  const result=await a.run(item,{inputs:{[item.id]:{actions:[{type:'selectReagent',payload:{slot:'A',speciesId:'species.agno3'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nacl'}},{type:'mix'},{type:'writeEquation',payload:{equation:'Ag+ + Cl- → AgCl(s)'}}]}}});
  assert.equal(result.finalState.status,'complete');
  const precipitate=result.evidence.find(e=>e.type==='observation');
  assert.equal(precipitate.observation.type,'precipitate');
  assert.equal(precipitate.observation.color,'white');
  const symbolic=result.evidence.find(e=>e.type==='answer'&&e.questionId==='net-ionic:rxn.agno3-nacl');
  assert.equal(symbolic.correct,true);
});

test('8.16 reactive slice returns REACTION_NOT_MODELED for an unknown reactant pair',async()=>{
  const a=adapter();
  const item=activity('practice.experiment.8.1');
  // P1.6: an unmodeled pair chosen by the learner is a coverage gap (REACTION_NOT_MODELED), never "no reaction",
  // and never chemistry evidence (the old test drove the same rule through a payload of the scripted step)
  const result=await a.run(item,{inputs:{[item.id]:{actions:[
    {type:'selectReagent',payload:{slot:'A',speciesId:'species.agno3'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nano3'}},{type:'mix'}
  ]}}});
  assert.equal(result.finalState.ionic.current.outcome,'not-modeled');
  assert.equal(result.finalState.ionic.current.coverageCode,'REACTION_NOT_MODELED');
  assert.equal(result.evidence.filter(e=>e.type==='observation').length,0);
  assert.equal(result.finalState.status,'in_progress');
});
