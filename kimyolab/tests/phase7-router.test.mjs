import test from 'node:test';
import assert from 'node:assert/strict';
import { createBeta1GenericRouter } from '../src/runtime/beta1/router.ts';

const base=(id,type)=>({id,type,title:id,goal:id,conceptIds:['concept.x'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{technical:{status:'pending',reviewerId:'u',reviewerRole:'technical',reviewedVersion:'1',reviewedHash:'',reviewedAt:''},chemistry:'not_applicable',didactic:{status:'pending',reviewerId:'u',reviewerRole:'didactic',reviewedVersion:'1',reviewedHash:'',reviewedAt:''},accessibility:{status:'pending',reviewerId:'u',reviewerRole:'accessibility',reviewedVersion:'1',reviewedHash:'',reviewedAt:''}},accessibilityProfile:['keyboard'],engineCompatibility:{engine:type,range:'^1.0.0'},sourceRefs:[],legacyIds:[],version:'1'});

const registry={
 'practice.experiment.x':{type:'experiment',version:'1',conceptId:'concept.x',scenario:{id:'s.x',steps:[{id:'one',actionType:'step.one',label:'One'},{id:'two',actionType:'step.two',label:'Two',observation:{type:'no-visible-change'}}]},virtualOnly:true},
 'practice.simulation.x':{type:'simulation',version:'1',conceptId:'concept.x',initialState:{value:0},targetState:{value:2},targetId:'target.x',controls:['value']},
 'practice.trainer.x':{type:'trainer',version:'1',conceptId:'concept.x',questionId:'q.x',prompt:'2+2?',acceptedAnswers:['4'],hints:['count']},
 'practice.calculation.x':{type:'calculation',version:'1',conceptId:'concept.x',steps:[{id:'total',value:2,unit:'mol'}]},
 'practice.case.x':{type:'case',version:'1',conceptId:'concept.x',allowedEvidenceIds:['a','b'],minEvidenceSelections:1,decisionKeywords:['choose'],scientificKeywords:['evidence'],reasoningKeywords:['because'],rubric:{evidenceUse:25,scientificAccuracy:35,reasoning:25,decisionQuality:15}},
};
const router=createBeta1GenericRouter({registry,contentVersion:'1',scoringVersion:'1',now:()=> '2026-09-15T00:00:00Z'});

test('generic Beta1 adapters execute all five engine families and emit typed evidence',async()=>{
 const contexts={
  'practice.experiment.x':{inputs:{'practice.experiment.x':{actions:[{type:'step.one'},{type:'step.two'}]}}},
  'practice.simulation.x':{inputs:{'practice.simulation.x':{simulationActions:[{field:'value',value:2}]}}},
  'practice.trainer.x':{inputs:{'practice.trainer.x':{trainerAnswers:['4']}}},
  'practice.calculation.x':{inputs:{'practice.calculation.x':{calculationResponses:[{stepId:'total',value:2,unit:'mol'}]}}},
  'practice.case.x':{inputs:{'practice.case.x':{case:{evidenceIds:['a'],decision:'choose a',justification:'evidence because it supports the choice'}}}},
 };
 for(const type of ['experiment','simulation','trainer','calculation','case']){
   const id=`practice.${type}.x`;
   const result=await router.run(base(id,type),contexts[id]);
   assert.equal(result.ok,true,id);
   assert.ok(result.value.evidence.length>=1,id);
   assert.equal(typeof result.value.serializedState,'string',id);
 }
});
