import test from 'node:test';
import assert from 'node:assert/strict';
import { LearningRunner } from '../src/runtime/learning-runner/runner.ts';
import { PracticeRouter } from '../src/runtime/practice-router/router.ts';
import { IndexedDbProgressStore } from '../src/runtime/progress/indexeddb-store.ts';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.mjs';

const at='2026-09-15T00:00:00.000Z';
const unit={id:'lu.demo',grade:7,title:'Demo',learningOutcomes:['Understand'],conceptIds:['concept.c1'],prerequisiteConceptIds:[],lessonTemplates:[],curriculumVersion:'2026.09',sourceRefs:[],legacyIds:[]};
const theory={id:'theory.demo',title:'Theory',conceptIds:['concept.c1'],explanationBlocks:[],representationModes:[],misconceptionCheckIds:[],lifecycleStatus:'ready',approvals:{},version:'1',legacyIds:[]};
const practice={id:'practice.trainer.demo',type:'trainer',title:'Practice',goal:'Practice',conceptIds:['concept.c1'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:[],engineCompatibility:{engine:'trainer',range:'^1'},sourceRefs:[],legacyIds:[],version:'1'};
const mapping={id:'mapping.demo',learningUnitId:'lu.demo',theoryActivityId:'theory.demo',practiceActivityId:'practice.trainer.demo',conceptIds:['concept.c1'],role:'primary',required:true,coverageStatus:'full'};
const repo={
  getLearningUnit:(id)=>id===unit.id?unit:undefined,
  getPrimaryMapping:(id)=>id===unit.id?mapping:undefined,
  getTheoryActivity:(id)=>id===theory.id?theory:undefined,
  getPracticeActivity:(id)=>id===practice.id?practice:undefined,
};
function common(id,activityId,evidenceClass,score){return {id,conceptId:'concept.c1',activityId,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,score,evidenceClass};}

test('minimal LearningRunner executes practice, assessment, mastery, persistence and reload restore',async()=>{
  const factory=createFakeIndexedDb();
  const store=new IndexedDbProgressStore(factory,'runner-db');
  const router=new PracticeRouter();
  router.register('trainer',{run:async()=>({
    evidence:[{...common('ev.practice','practice.trainer.demo','practice-observation',.9),type:'procedure',stepId:'attempt',accepted:true}],
    serializedState:'{"attempt":1}'
  })});
  const assessmentRunner=async()=>[
    {...common('ev.assessment','assessment.demo','concept-assessment',.95),type:'answer',questionId:'q.1',correct:true},
    {...common('ev.transfer','case.demo','transfer-case',.9),type:'decision',rubricScores:{evidenceUse:.9,scientificAccuracy:.9,reasoning:.9,decisionQuality:.9}},
  ];
  const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner,contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at,transferRequired:()=>true});
  const result=await runner.run('lu.demo',{});
  assert.equal(result.ok,true);
  assert.equal(result.value.theory.id,'theory.demo');
  assert.equal(result.value.practice.id,'practice.trainer.demo');
  assert.equal(result.value.evidence.length,3);
  assert.equal(result.value.mastery[0].status,'mastered');
  assert.equal(result.value.progress.status,'mastered');
  assert.equal(result.value.progress.activityStates['practice.trainer.demo'],'{"attempt":1}');

  const reloadedStore=new IndexedDbProgressStore(factory,'runner-db');
  const restored=await reloadedStore.loadProgress('lu.demo');
  assert.equal(restored.status,'mastered');
  assert.equal((await reloadedStore.loadEvidenceForConcept('concept.c1')).length,3);
});

test('LearningRunner returns structured error when canonical primary mapping is missing',async()=>{
  const badRepo={...repo,getPrimaryMapping:()=>undefined};
  const runner=new LearningRunner({repository:badRepo,practiceRouter:new PracticeRouter(),store:new IndexedDbProgressStore(createFakeIndexedDb(),'bad-db'),assessmentRunner:async()=>[],contentVersion:'1',schemaVersion:'1',assessmentVersion:'1',scoringVersion:'1',now:()=>at});
  const result=await runner.run('lu.demo',{});
  assert.deepEqual(result,{ok:false,error:{code:'PRIMARY_MAPPING_NOT_FOUND',learningUnitId:'lu.demo'}});
});
