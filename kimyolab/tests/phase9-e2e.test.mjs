import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LearningRunner } from '../src/runtime/learning-runner/runner.ts';
import { IndexedDbProgressStore } from '../src/runtime/progress/indexeddb-store.ts';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.mjs';
import { createCanonicalContentRepository } from '../src/runtime/reference-slices/repository.ts';
import { createBeta2Router, loadBeta2SafeConfigRegistry, loadBeta2CapabilityMatrix } from '../src/runtime/beta2/index.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={units:read('content-src/learning-units.json'),theories:read('content-src/theory-activities.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json')};
const matrix=loadBeta2CapabilityMatrix(read('content-src/beta2-capability-matrix.json'));
const beta2=loadBeta2SafeConfigRegistry(read('content-src/activity-configs/beta2-safe.json'));
const at='2026-09-15T00:00:00.000Z';

function inputFor(activityId){
  const cfg=beta2[activityId];
  if(!cfg) return undefined;
  if(cfg.type==='experiment') return {actions:cfg.scenario.steps.map(step=>({type:step.actionType}))};
  if(cfg.type==='simulation') return {simulationActions:cfg.controls.map(field=>({field,value:cfg.targetState[field]}))};
  if(cfg.type==='trainer') return {trainerAnswers:[cfg.acceptedAnswers[0]]};
  if(cfg.type==='calculation') return {calculationResponses:cfg.steps.map(step=>({stepId:step.id,value:step.value,unit:step.unit}))};
  if(cfg.type==='case') return {case:{evidenceIds:cfg.allowedEvidenceIds.slice(0,cfg.minEvidenceSelections),decision:cfg.decisionKeywords.join(' '),justification:[...cfg.scientificKeywords,...cfg.reasoningKeywords].join(' ')}};
}

function assessmentEvidence(unit){
  return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map((n)=>({
    id:`assessment.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1.0.0',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,
    score:0.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`assessment.${unit.id}.${ci}.${n}`
  })));
}

test('all 32 audited generic-safe grade 9-10 units execute through LearningRunner and persist progress',async()=>{
  const safe=matrix.filter(x=>x.disposition==='existing-engine'&&beta2[x.primaryPracticeId]);
  assert.equal(safe.length,32);
  const repo=createCanonicalContentRepository(data);
  const router=createBeta2Router({registry:beta2,contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
  for(const row of safe){
    const input=inputFor(row.primaryPracticeId);
    assert.ok(input,`missing input ${row.legacyId}`);
    const factory=createFakeIndexedDb();
    const store=new IndexedDbProgressStore(factory,`phase9-${row.learningUnitId}`);
    const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async(u)=>assessmentEvidence(u),contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at});
    const result=await runner.run(row.learningUnitId,{inputs:{[row.primaryPracticeId]:input}});
    assert.equal(result.ok,true,`${row.legacyId}: ${JSON.stringify(result)}`);
    assert.ok(result.value.evidence.length>=4,row.legacyId);
    const restored=await new IndexedDbProgressStore(factory,`phase9-${row.learningUnitId}`).loadProgress(row.learningUnitId);
    assert.equal(restored.status,result.value.progress.status,row.legacyId);
  }
});
