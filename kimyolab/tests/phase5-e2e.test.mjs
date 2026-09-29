import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LearningRunner } from '../src/runtime/learning-runner/runner.ts';
import { IndexedDbProgressStore } from '../src/runtime/progress/indexeddb-store.ts';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.mjs';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';
import { IonicEngine } from '../src/domain/chemistry/ionic-engine.ts';
import { createCanonicalContentRepository, createReferenceSliceRouter, loadReferenceSliceRegistry } from '../src/runtime/reference-slices/index.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={
  units:read('content-src/learning-units.json'),
  theories:read('content-src/theory-activities.json'),
  practices:read('content-src/practice-activities.json'),
  mappings:read('content-src/mapping-links.json'),
};
const registry=loadReferenceSliceRegistry(read('content-src/activity-configs/reference-slices.json'));
const reactions=read('content-src/chemistry/reactions.json');
const solutionRules=read('content-src/chemistry/solubility.json');
const matcher=ReactionMatcher.from(reactions);
const ionic=IonicEngine.from({reactions,rules:solutionRules});
const at='2026-09-15T00:00:00.000Z';

const runs={
  'lu.7.03':{activityId:'practice.experiment.7.2',input:{actions:[{type:'selectApparatus'},{type:'addWater'},{type:'addMixture'},{type:'mix'},{type:'filter'},{type:'evaporate'},{type:'observe'}]}},
  'lu.7.07':{activityId:'practice.simulation.7.07.planned',input:{simulationActions:[{particle:'protons',delta:6},{particle:'neutrons',delta:8},{particle:'electrons',delta:6}]}},
  'lu.7.11':{activityId:'practice.trainer.7.4',input:{trainerAnswers:['Al2O3']}},
  'lu.7.12':{activityId:'practice.calculation.7.5',input:{calculationResponses:[
    {stepId:'h-contribution',value:2,unit:'relative-mass'},{stepId:'s-contribution',value:32,unit:'relative-mass'},
    {stepId:'o-contribution',value:64,unit:'relative-mass'},{stepId:'total',value:98,unit:'relative-mass'}]}},
  'lu.7.18':{activityId:'practice.case.7.14',input:{case:{evidenceIds:['traffic-no2','calm-weather'],decision:'Prioritize transport emission reduction',justification:'NO2 evidence is highest near traffic and calm weather limits dispersion, so transport is a supported source hypothesis.',reflection:'Review later.'}}},
  'lu.8.16':{activityId:'practice.experiment.8.1',input:{actions:[{type:'selectApparatus'},{type:'addNaCl'},{type:'addAgNO3'},{type:'observe'},{type:'record',payload:{netIonicEquation:'Ag+ + Cl- → AgCl(s)'}}]}},
};

function assessmentEvidence(unit){
  return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map((n)=>({
    id:`assessment.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1.0.0',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,
    score:0.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`assessment.${unit.id}.${ci}.${n}`
  })));
}

for(const [learningUnitId,fixture] of Object.entries(runs)){
  test(`${learningUnitId} executes canonical Theory → Practice → Evidence → Assessment → Mastery → persistence`,async()=>{
    const repo=createCanonicalContentRepository(data);
    const mapping=repo.getPrimaryMapping(learningUnitId);
    assert.equal(mapping.practiceActivityId,fixture.activityId);
    assert.ok(repo.getTheoryActivity(mapping.theoryActivityId));
    assert.equal(repo.getPracticeActivity(fixture.activityId).lifecycleStatus,'ready');

    const router=createReferenceSliceRouter({registry,reactionMatcher:matcher,ionicEngine:ionic,contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
    const factory=createFakeIndexedDb();
    const store=new IndexedDbProgressStore(factory,`phase5-${learningUnitId}`);
    const runner=new LearningRunner({
      repository:repo,practiceRouter:router,store,
      assessmentRunner:async(unit)=>assessmentEvidence(unit),
      contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at,
      transferRequired:(conceptId)=>learningUnitId==='lu.7.18'&&conceptId===registry[fixture.activityId].conceptId,
    });
    const context={inputs:{[fixture.activityId]:fixture.input}};
    const result=await runner.run(learningUnitId,context);
    assert.equal(result.ok,true);
    assert.equal(result.value.practice.id,fixture.activityId);
    assert.ok(result.value.evidence.length>=4);
    assert.ok(result.value.mastery.every(m=>m.status==='mastered'));
    assert.equal(result.value.progress.status,'mastered');
    assert.ok(result.value.progress.activityStates[fixture.activityId]);

    const reloaded=new IndexedDbProgressStore(factory,`phase5-${learningUnitId}`);
    const restored=await reloaded.loadProgress(learningUnitId);
    assert.equal(restored.status,'mastered');
    assert.equal(restored.activityStates[fixture.activityId],result.value.progress.activityStates[fixture.activityId]);
  });
}
