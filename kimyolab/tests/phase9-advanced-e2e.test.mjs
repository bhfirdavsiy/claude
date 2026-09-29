import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LearningRunner} from '../src/runtime/learning-runner/runner.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {createCanonicalContentRepository} from '../src/runtime/reference-slices/repository.ts';
import {createBeta2Router,loadBeta2SafeConfigRegistry,loadBeta2AdvancedRegistry} from '../src/runtime/beta2/index.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={units:read('content-src/learning-units.json'),theories:read('content-src/theory-activities.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json')};
const safe=loadBeta2SafeConfigRegistry(read('content-src/activity-configs/beta2-safe.json'));
const advanced=loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json'));
const reactions=read('content-src/chemistry/reactions.json');const rules=read('content-src/chemistry/solubility.json');const at='2026-09-15T00:00:00.000Z';
const inputs={
 'practice.trainer.9.05.planned':{trainerAnswers:['Ag+ + Cl- → AgCl(s)']},
 'practice.experiment.9.14':{actions:[{type:'selectSalt',payload:{salt:'AlCl3'}},{type:'addIndicator'},{type:'recordMedium',payload:{medium:'acidic'}}]},
 'practice.experiment.9.10':{actions:[{type:'connectCurrent'},{type:'observeCathode'},{type:'observeAnode'}]},
 'practice.simulation.9.23.planned':{simulationActions:[{field:'medium',value:'acidic'}]},
};
function assessments(unit){return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map(n=>({id:`a.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,score:.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`a.${unit.id}.${ci}.${n}`})));}

test('four implemented grade 9 chemistry capabilities run through canonical LearningRunner',async()=>{
 const repo=createCanonicalContentRepository(data);
 const router=createBeta2Router({registry:safe,advancedRegistry:advanced,ionicEngine:IonicEngine.from({reactions,rules}),hydrolysisModel:HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json')),electrolysisModel:ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json')),manganeseModel:ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json')),contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
 for(const legacy of ['9.05','9.06','9.15','9.23']){
  const unit=data.units.find(u=>u.legacyIds?.includes(legacy));const mapping=repo.getPrimaryMapping(unit.id);const input=inputs[mapping.practiceActivityId];assert.ok(input,legacy);
  const factory=createFakeIndexedDb();const store=new IndexedDbProgressStore(factory,`adv-${legacy}`);
  const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async u=>assessments(u),contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at});
  const result=await runner.run(unit.id,{inputs:{[mapping.practiceActivityId]:input}});assert.equal(result.ok,true,`${legacy}:${JSON.stringify(result)}`);assert.ok(result.value.evidence.length>=4,legacy);
  const restored=await new IndexedDbProgressStore(factory,`adv-${legacy}`).loadProgress(unit.id);assert.equal(restored.status,result.value.progress.status,legacy);
 }
});
