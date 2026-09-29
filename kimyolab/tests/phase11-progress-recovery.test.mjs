import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {saveWithQuotaRecovery,recoverCorruptStore} from '../src/runtime/progress/recovery.ts';

const progress={learningUnitId:'lu.7.01',status:'in_progress',activityStates:{},lastVisitedAt:'2026-09-20T00:00:00.000Z',contentVersion:'2026.09.1',schemaVersion:'1.0.0'};
const evidence={id:'ev.keep',conceptId:'concept.c1',activityId:'practice.demo',activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1',createdAt:'2026-09-20T00:00:00.000Z',score:.8,evidenceClass:'trainer-calculation',type:'answer',questionId:'q',correct:true};

test('quota recovery purges optional cache and retries without deleting progress evidence',async()=>{
  let attempts=0,purges=0;
  const result=await saveWithQuotaRecovery(async()=>{
    attempts++;
    if(attempts===1){const e=new Error('quota');e.name='QuotaExceededError';throw e;}
    return 'saved';
  },async()=>{purges++;});
  assert.equal(result,'saved');
  assert.equal(attempts,2);
  assert.equal(purges,1);
});

test('corruption recovery snapshots all data and resets only the affected store',async()=>{
  const factory=createFakeIndexedDb();
  const store=new IndexedDbProgressStore(factory,'recovery-test');
  await store.saveProgress(progress);
  await store.saveEvidence(evidence);
  const result=await recoverCorruptStore(store,'progress');
  assert.equal(result.snapshot.progress.length,1);
  assert.equal(result.snapshot.evidence.length,1);
  assert.deepEqual(await store.listProgress(),[]);
  assert.deepEqual(await store.loadEvidenceForConcept('concept.c1'),[evidence]);
});
