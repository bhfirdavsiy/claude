import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbProgressStore } from '../src/runtime/progress/indexeddb-store.ts';
import { createFakeIndexedDb } from './helpers/fake-indexeddb.mjs';

const progress={learningUnitId:'lu.7.01',status:'in_progress',activityStates:{'practice.demo':'{"step":2}'},lastVisitedAt:'2026-09-15T00:00:00.000Z',contentVersion:'2026.09.1',schemaVersion:'2.0.0',contentSchemaVersion:'1.0.0'};
const evidence={id:'6f1c1b7e-2d3a-4c5b-9e8f-0a1b2c3d4e5f',attemptId:'attempt.1',learningUnitId:'lu.7.01',sourceEvidenceId:'ev.1',correctness:'correct',conceptId:'concept.c1',activityId:'practice.demo',activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1',createdAt:'2026-09-15T00:00:00.000Z',score:.8,evidenceClass:'trainer-calculation',type:'answer',questionId:'q.1',correct:true};
const assessment={id:'assessment.1',learningUnitId:'lu.7.01',score:80,conceptEvidenceIds:['6f1c1b7e-2d3a-4c5b-9e8f-0a1b2c3d4e5f'],misconceptionIds:[],weakConceptIds:[],recommendedRemediationIds:[],assessmentVersion:'1',scoringVersion:'1',createdAt:'2026-09-15T00:00:00.000Z'};
const mastery={conceptId:'concept.c1',evidenceIds:['6f1c1b7e-2d3a-4c5b-9e8f-0a1b2c3d4e5f'],confidence:.8,status:'mastered',scoringVersion:'1',lastEvidenceAt:'2026-09-15T00:00:00.000Z'};

test('IndexedDB store persists progress and runtime records across store instances', async()=>{
  const factory=createFakeIndexedDb();
  const a=new IndexedDbProgressStore(factory,'kimyolab-test');
  await a.saveProgress(progress);
  await a.saveEvidence(evidence);
  await a.saveAssessment(assessment);
  await a.saveMastery(mastery);

  const b=new IndexedDbProgressStore(factory,'kimyolab-test');
  assert.deepEqual(await b.loadProgress('lu.7.01'),progress);
  assert.deepEqual(await b.loadEvidenceForConcept('concept.c1'),[evidence]);
  assert.deepEqual(await b.loadAssessment('assessment.1'),assessment);
  assert.deepEqual(await b.loadMastery('concept.c1'),mastery);
});

test('IndexedDB store reports unavailable persistence with a structured code',async()=>{
  const store=new IndexedDbProgressStore(undefined,'no-idb');
  await assert.rejects(()=>store.saveProgress(progress),/PROGRESS_STORAGE_UNAVAILABLE/);
  await assert.rejects(()=>store.loadProgress('lu.7.01'),/PROGRESS_STORAGE_UNAVAILABLE/);
});
