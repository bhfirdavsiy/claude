import test from 'node:test';
import assert from 'node:assert/strict';
import { ExperimentEngine, StatefulSimulationEngine, TrainerEngine, CalculationEngine, CaseEngine } from '../src/engines/index.ts';

test('all five public engine families expose serializable capability contracts',()=>{
  const experiment=new ExperimentEngine({id:'s',version:'1',steps:[]},()=>({status:'accepted'}));
  const simulation=new StatefulSimulationEngine({id:'sim',version:'1',seed:1,initialState:{x:0},reducer:(s)=>s});
  const trainer=new TrainerEngine({activityId:'t',activityVersion:'1',contentVersion:'1',scoringVersion:'1',question:{id:'q',promptKey:'q'},attemptPolicy:{maxAttempts:1,hintAfterAttempts:[],explanationAfter:'success'},hints:[],explanationKey:'e',validator:()=>({correct:true,score:1,feedbackKey:'ok'}),now:()=> '2026-09-15T00:00:00.000Z'});
  const calculation=new CalculationEngine({activityId:'c',activityVersion:'1',contentVersion:'1',scoringVersion:'1',conceptId:'concept.c1',now:()=> '2026-09-15T00:00:00.000Z',steps:[]});
  const caseEngine=new CaseEngine({activityId:'case',activityVersion:'1',contentVersion:'1',scoringVersion:'1',conceptId:'concept.c1',now:()=> '2026-09-15T00:00:00.000Z',allowedEvidenceIds:[],minEvidenceSelections:0,justificationThreshold:0,rubric:{evidenceUse:25,scientificAccuracy:25,reasoning:25,decisionQuality:25},decisionScorer:()=>1,justificationScorer:()=>({scientificAccuracy:1,reasoning:1})});
  for(const engine of [experiment,simulation,trainer,calculation,caseEngine]) assert.equal(engine.getCapabilities().serializable,true);
});
