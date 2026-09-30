import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LearningRunner } from '../src/runtime/learning-runner/runner.ts';
import { IndexedDbProgressStore } from '../src/runtime/progress/indexeddb-store.ts';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.mjs';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';
import { IonicEngine } from '../src/domain/chemistry/ionic-engine.ts';
import { createCanonicalContentRepository } from '../src/runtime/reference-slices/repository.ts';
import { loadReferenceSliceRegistry } from '../src/runtime/reference-slices/config.ts';
import { SpeciesRegistry } from '../src/domain/chemistry/species-registry.ts';
import { createBeta1Router, loadBeta1ConfigRegistry } from '../src/runtime/beta1/index.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={units:read('content-src/learning-units.json'),theories:read('content-src/theory-activities.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json')};
const reference=loadReferenceSliceRegistry(read('content-src/activity-configs/reference-slices.json'));
const beta=loadBeta1ConfigRegistry(read('content-src/activity-configs/beta1.json'));
const reactions=read('content-src/chemistry/reactions.json');
const rules=read('content-src/chemistry/solubility.json');
const at='2026-09-15T00:00:00.000Z';

function referenceInput(activityId){
  const fixed={
    'practice.experiment.7.2':{actions:[{type:'selectApparatus'},{type:'addWater'},{type:'addMixture'},{type:'mix'},{type:'filter'},{type:'evaporate'},{type:'observe'}]},
    'practice.simulation.7.07.planned':{simulationActions:[{particle:'protons',delta:6},{particle:'neutrons',delta:8},{particle:'electrons',delta:6}]},
    'practice.trainer.7.4':{trainerAnswers:['Al2O3']},
    'practice.calculation.7.5':{calculationResponses:[{stepId:'h-contribution',value:2,unit:'relative-mass'},{stepId:'s-contribution',value:32,unit:'relative-mass'},{stepId:'o-contribution',value:64,unit:'relative-mass'},{stepId:'total',value:98,unit:'relative-mass'}]},
    'practice.case.7.14':{case:{evidenceIds:['traffic-no2','calm-weather'],decision:'Prioritize transport emission reduction',justification:'NO2 evidence is highest near traffic and calm weather limits dispersion, so transport is a supported source hypothesis.'}},
    // P1.6: learner reagent choice → mix → equation (the scripted reagent sequence was removed; ADR-P1-007)
    'practice.experiment.8.1':{actions:[{type:'selectReagent',payload:{slot:'A',speciesId:'species.agno3'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nacl'}},{type:'mix'},{type:'writeEquation',payload:{equation:'Ag+ + Cl- → AgCl(s)'}}]},
  };
  return fixed[activityId];
}

function genericInput(activityId){
  const cfg=beta[activityId];
  if(!cfg) return undefined;
  if(cfg.type==='experiment') return {actions:cfg.scenario.steps.map(step=>({type:step.actionType}))};
  if(cfg.type==='simulation') return {simulationActions:cfg.controls.map(field=>({field,value:cfg.targetState[field]}))};
  if(cfg.type==='trainer') return {trainerAnswers:[cfg.acceptedAnswers[0]]};
  if(cfg.type==='calculation') return {calculationResponses:cfg.steps.map(step=>({stepId:step.id,value:step.value,unit:step.unit}))};
  if(cfg.type==='case') return {case:{evidenceIds:cfg.allowedEvidenceIds.slice(0,cfg.minEvidenceSelections),decision:cfg.decisionKeywords.join(' '),justification:[...cfg.scientificKeywords,...cfg.reasoningKeywords].join(' ')}};
}
function inputFor(activityId){ return referenceInput(activityId)??genericInput(activityId); }

function assessmentEvidence(unit){
  return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map((n)=>({
    id:`assessment.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1.0.0',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,
    score:0.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`assessment.${unit.id}.${ci}.${n}`
  })));
}

test('all 47 grade 7-8 canonical learning units execute through a runnable primary practice',async()=>{
  const repo=createCanonicalContentRepository(data);
  const router=createBeta1Router({referenceRegistry:reference,beta1Registry:beta,reactionMatcher:ReactionMatcher.from(reactions),ionicEngine:IonicEngine.from({reactions,rules}),speciesRegistry:SpeciesRegistry.from(JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/species.json',import.meta.url),'utf8'))),contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
  const units=data.units.filter(x=>x.grade===7||x.grade===8);
  assert.equal(units.length,47);
  for(const unit of units){
    const mapping=repo.getPrimaryMapping(unit.id);
    const input=inputFor(mapping.practiceActivityId);
    assert.ok(input,`no success input for ${unit.id} / ${mapping.practiceActivityId}`);
    const factory=createFakeIndexedDb();
    const store=new IndexedDbProgressStore(factory,`phase7-${unit.id}`);
    const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async(u)=>assessmentEvidence(u),contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at});
    const result=await runner.run(unit.id,{inputs:{[mapping.practiceActivityId]:input}});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.ok(result.value.evidence.length>=4,unit.id);
    assert.ok(result.value.progress.activityStates[mapping.practiceActivityId],unit.id);
    const restored=await new IndexedDbProgressStore(factory,`phase7-${unit.id}`).loadProgress(unit.id);
    assert.equal(restored.status,result.value.progress.status,unit.id);
  }
});
