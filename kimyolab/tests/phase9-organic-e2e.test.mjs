import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LearningRunner} from '../src/runtime/learning-runner/runner.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {createCanonicalContentRepository} from '../src/runtime/reference-slices/repository.ts';
import {createBeta2Router,loadBeta2SafeConfigRegistry,loadBeta2AdvancedRegistry} from '../src/runtime/beta2/index.ts';
import {loadBeta2OrganicRegistry} from '../src/runtime/beta2/organic.ts';
import {OrganicKnowledgeBase} from '../src/domain/chemistry/organic-knowledge.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={units:read('content-src/learning-units.json'),theories:read('content-src/theory-activities.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json')};
const generic=loadBeta2SafeConfigRegistry(read('content-src/activity-configs/beta2-safe.json'));
const advanced=loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json'));
const organic=loadBeta2OrganicRegistry(read('content-src/activity-configs/beta2-organic.json'));
const knowledge=OrganicKnowledgeBase.from(read('content-src/chemistry/organic.json'));
const reactions=read('content-src/chemistry/reactions.json'),rules=read('content-src/chemistry/solubility.json');
const at='2026-09-15T00:00:00.000Z';
function expected(c){
 if(c.task==='molecule-property'){const m=knowledge.molecule(c.moleculeId);return m[c.property];}
 if(c.task==='isomer-count')return knowledge.isomers(c.formula).length;
 if(c.task==='homolog-formula')return knowledge.homolog(c.series,c.carbonCount).formula;
 if(c.task==='reaction-type')return knowledge.reaction(c.reactionId).reactionType;
 if(c.task==='reaction-product')return knowledge.reaction(c.reactionId).productIds[c.productIndex??0];
}
function input(c){
 if(c.type==='trainer')return {trainerAnswers:[String(expected(c))]};
 if(c.type==='simulation')return {simulationActions:[{field:c.field??c.property??'value',value:expected(c)}]};
 return {actions:c.requiredActions.map(type=>({type}))};
}
function assessments(unit){return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map(n=>({id:`o.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,score:.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`o.${unit.id}.${ci}.${n}`})));}

test('all 17 bounded grade 10 organic capabilities run through canonical LearningRunner and restore progress',async()=>{
 const repo=createCanonicalContentRepository(data);
 const router=createBeta2Router({registry:generic,advancedRegistry:advanced,organicRegistry:organic,organicKnowledge:knowledge,ionicEngine:IonicEngine.from({reactions,rules}),hydrolysisModel:HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json')),electrolysisModel:ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json')),manganeseModel:ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json')),contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
 assert.equal(Object.keys(organic).length,17);
 for(const [activityId,cfg] of Object.entries(organic)){
  const mapping=data.mappings.find(m=>m.practiceActivityId===activityId&&m.role==='primary'); assert.ok(mapping,activityId);
  const unit=data.units.find(u=>u.id===mapping.learningUnitId); assert.equal(unit.grade,10,activityId);
  const factory=createFakeIndexedDb(); const store=new IndexedDbProgressStore(factory,`organic-${unit.id}`);
  const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async u=>assessments(u),contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at});
  const result=await runner.run(unit.id,{inputs:{[activityId]:input(cfg)}});
  assert.equal(result.ok,true,`${unit.legacyIds?.[0]}:${JSON.stringify(result)}`); assert.ok(result.value.evidence.length>=4,unit.legacyIds?.[0]);
  const restored=await new IndexedDbProgressStore(factory,`organic-${unit.id}`).loadProgress(unit.id); assert.equal(restored.status,result.value.progress.status,unit.legacyIds?.[0]);
 }
});
