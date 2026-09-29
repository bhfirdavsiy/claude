import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBeta1ConfigRegistry } from '../src/runtime/beta1/config.ts';

test('Beta1 config loader accepts five generic engine families',()=>{
  const registry=loadBeta1ConfigRegistry({
    'practice.experiment.x':{type:'experiment',version:'1.0.0',conceptId:'concept.x',scenario:{id:'s.x',steps:[{id:'one',actionType:'step.one',label:'One'}]}},
    'practice.simulation.x':{type:'simulation',version:'1.0.0',conceptId:'concept.x',initialState:{value:0},targetState:{value:1},targetId:'target.x',controls:['value']},
    'practice.trainer.x':{type:'trainer',version:'1.0.0',conceptId:'concept.x',questionId:'q.x',prompt:'x',acceptedAnswers:['yes']},
    'practice.calculation.x':{type:'calculation',version:'1.0.0',conceptId:'concept.x',steps:[{id:'total',value:2,unit:'mol'}]},
    'practice.case.x':{type:'case',version:'1.0.0',conceptId:'concept.x',allowedEvidenceIds:['a','b'],minEvidenceSelections:1,decisionKeywords:['a'],scientificKeywords:['b'],reasoningKeywords:['because'],rubric:{evidenceUse:25,scientificAccuracy:35,reasoning:25,decisionQuality:15}},
  });
  assert.equal(Object.keys(registry).length,5);
  assert.equal(registry['practice.experiment.x'].type,'experiment');
});

test('Beta1 config loader rejects malformed config instead of guessing defaults',()=>{
  assert.throws(()=>loadBeta1ConfigRegistry({'practice.trainer.x':{type:'trainer'}}),/BETA1_CONFIG_INVALID/);
});
