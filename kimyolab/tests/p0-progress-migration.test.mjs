// P0.6 / P0.7 — progress records and the IndexedDB layout are migrated explicitly, or isolated.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore,CURRENT_DB_VERSION,EVIDENCE_INDEXES,dbMigrations} from '../src/runtime/progress/indexeddb-store.ts';
import {loadProgressRecord,resolveMigrationPath,progressMigrations} from '../src/runtime/progress/migrations.ts';
import {PROGRESS_SCHEMA_VERSION} from '../src/runtime/progress/types.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';

const legacyV1={learningUnitId:'lu.7.01',status:'complete',activityStates:{'practice.x':'{"a":1}'},lastVisitedAt:'2026-09-01T00:00:00.000Z',contentVersion:'2026.09.1',schemaVersion:'1.0.0'};

function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function createV1Database(factory,name){
  const open=factory.open(name,1);
  open.onupgradeneeded=()=>{const db=open.result;for(const s of ['progress','evidence','assessmentAttempts','mastery','appMeta','activityState']) db.createObjectStore(s);};
  const db=await req(open);
  const tx=db.transaction(['progress','evidence','appMeta'],'readwrite');
  tx.objectStore('progress').put(legacyV1,'lu.7.01');
  tx.objectStore('progress').put({learningUnitId:'lu.7.02',status:'teleported',lastVisitedAt:'2026-09-01T00:00:00.000Z',contentVersion:'2026.09.1',schemaVersion:'1.0.0',activityStates:{}},'lu.7.02');
  tx.objectStore('evidence').put({id:'practice.x.answer.1',conceptId:'concept.c1',activityId:'practice.x',activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1',createdAt:'2026-09-01T00:00:00.000Z',score:1,evidenceClass:'trainer-calculation',type:'answer',questionId:'q',correct:true},'practice.x.answer.1');
  tx.objectStore('appMeta').put({installedAt:'2026-09-01'},'install');
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
}

test('migration registry resolves an explicit chain and every step is registered',()=>{
  assert.deepEqual(resolveMigrationPath('0',PROGRESS_SCHEMA_VERSION),['0→1.0.0','1.0.0→2.0.0']);
  assert.deepEqual(resolveMigrationPath('1.0.0','2.0.0'),['1.0.0→2.0.0']);
  assert.equal(resolveMigrationPath('9.9.9','2.0.0'),undefined);
  for(const key of Object.keys(progressMigrations)) assert.match(key,/^[0-9.]+→[0-9.]+$/);
});

test('load → validate → version check → migrate → otherwise isolate',()=>{
  assert.equal(loadProgressRecord({...legacyV1,schemaVersion:'2.0.0',status:'in_progress'}).status,'current');
  const migrated=loadProgressRecord(legacyV1);
  assert.equal(migrated.status,'migrated');
  assert.equal(migrated.record.status,'practice_complete');
  assert.equal(migrated.record.schemaVersion,'2.0.0');
  assert.equal(migrated.record.contentSchemaVersion,'1.0.0');
  const noSchema=loadProgressRecord({learningUnitId:'lu.7.01',status:'complete',lastVisitedAt:'2026-09-01T00:00:00.000Z',contentVersion:'2026.09.1'});
  assert.equal(noSchema.status,'migrated');
  assert.deepEqual(noSchema.steps,['0→1.0.0','1.0.0→2.0.0']);
  assert.equal(loadProgressRecord({...legacyV1,schemaVersion:'7.0.0'}).status,'isolated');
  assert.equal(loadProgressRecord({...legacyV1,status:'teleported'}).code,'PROGRESS_MIGRATION_UNSUPPORTED_STATUS');
  assert.equal(loadProgressRecord({schemaVersion:'2.0.0'}).code,'PROGRESS_RECORD_INVALID');
  assert.equal(loadProgressRecord(null).status,'isolated');
});

test('normal runtime loads use the migration and persist the migrated record',async()=>{
  const factory=createFakeIndexedDb();
  const store=new IndexedDbProgressStore(factory,'p0-runtime-migrate');
  await store.saveProgress(legacyV1);
  const service=new BrowserProgressService(factory,'p0-runtime-migrate');
  const loaded=await service.loadProgress('lu.7.01');
  assert.equal(loaded.schemaVersion,PROGRESS_SCHEMA_VERSION);
  assert.equal(loaded.status,'practice_complete');
  const snapshot=await store.exportSnapshot();
  assert.equal(snapshot.progress[0].schemaVersion,PROGRESS_SCHEMA_VERSION,'migrated record is written back');
});

test('records that cannot be migrated are isolated with their original bytes preserved',async()=>{
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p0-isolate');
  const broken={...legacyV1,schemaVersion:'42.0.0'};
  await store.saveProgress(broken);
  assert.equal(await store.loadProgress('lu.7.01'),undefined);
  const [q]=await store.listQuarantine();
  assert.equal(q.store,'progress');
  assert.equal(q.key,'lu.7.01');
  assert.equal(q.code,'PROGRESS_MIGRATION_PATH_MISSING');
  assert.deepEqual(q.record,broken);
  assert.deepEqual(await store.listProgress(),[]);
});

test('IndexedDB v2 creates the canonical stores and evidence indexes',async()=>{
  const factory=createFakeIndexedDb();
  const store=new IndexedDbProgressStore(factory,'p0-v2-fresh');
  await store.listProgress();
  const db=await req(factory.open('p0-v2-fresh'));
  assert.equal(db.version,CURRENT_DB_VERSION);
  for(const name of ['progress','attempts','evidence','activityState','externalEvidence','metadata','quarantine']) assert.ok(db.objectStoreNames.contains(name),name);
  const tx=db.transaction(['evidence'],'readonly');
  const evidence=tx.objectStore('evidence');
  assert.equal(evidence.keyPath,'id');
  for(const index of EVIDENCE_INDEXES) assert.ok(evidence.indexNames.contains(index),index);
  db.close();
});

test('IndexedDB v1 → v2 migration keeps legacy evidence, progress and metadata',async()=>{
  const factory=createFakeIndexedDb();
  await createV1Database(factory,'p0-v1-to-v2');
  const store=new IndexedDbProgressStore(factory,'p0-v1-to-v2');
  const evidence=await store.loadEvidenceForConcept('concept.c1');
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].sourceEvidenceId,'practice.x.answer.1');
  assert.equal(evidence[0].attemptId,'legacy-attempt:practice.x.answer.1');
  assert.equal(evidence[0].legacy,true);
  assert.notEqual(evidence[0].id,'practice.x.answer.1');
  assert.deepEqual(await store.metadata('install'),{installedAt:'2026-09-01'});
  assert.equal((await store.metadata('db.schema')).migratedFrom,1);
  const rows=await store.listProgress();
  assert.deepEqual(rows.map(r=>[r.learningUnitId,r.status,r.schemaVersion]),[['lu.7.01','practice_complete','2.0.0']]);
  assert.equal((await store.listQuarantine())[0].key,'lu.7.02','unmigratable progress is isolated, not dropped');
});

test('after v1 → v2 migration the learner keeps their mastery (legacy evidence still counts)',async()=>{
  const factory=createFakeIndexedDb();
  await createV1Database(factory,'p0-v1-mastery');
  const service=new BrowserProgressService(factory,'p0-v1-mastery');
  // The browser computes mastery with the full pack context, including curriculumVersion.
  const [m]=await service.recomputeMastery(['concept.c1'],{contentVersion:'2026.09.1',scoringVersion:'1',curriculumVersion:'2026.09'});
  assert.equal(m.evidenceIds.length,1,'migrated evidence must not be silently excluded');
  assert.equal(m.excludedEvidenceIds,undefined);
});

test('a rejected open() is not cached permanently — the next call retries',async()=>{
  const real=createFakeIndexedDb();
  let calls=0;
  const flaky={open:(...args)=>{calls++;if(calls===1)throw new Error('SecurityError');return real.open(...args);}};
  const store=new IndexedDbProgressStore(flaky,'p0-retry');
  await assert.rejects(()=>store.listProgress(),/PROGRESS_STORAGE_UNAVAILABLE/);
  assert.deepEqual(await store.listProgress(),[]);
  assert.equal(calls,2);
});

test('a failing DB migration keeps old data intact and continues in an isolated workspace',async()=>{
  const factory=createFakeIndexedDb();
  await createV1Database(factory,'p0-migration-fails');
  const store=new IndexedDbProgressStore(factory,'p0-migration-fails',CURRENT_DB_VERSION,{migrations:{...dbMigrations,2:(ctx)=>{if(ctx.oldVersion>=1)throw new Error('legacy data cannot be upgraded');dbMigrations[2](ctx);}}});
  assert.deepEqual(await store.listProgress(),[]);
  assert.equal(store.isolation.code,'PROGRESS_MIGRATION_FAILED');
  assert.equal(store.databaseName,'p0-migration-fails.isolated-v2');
  const old=await req(factory.open('p0-migration-fails'));
  assert.equal(old.version,1,'upgrade was rolled back');
  const tx=old.transaction(['progress'],'readonly');
  assert.deepEqual(await req(tx.objectStore('progress').get('lu.7.01')),legacyV1);
  old.close();
});
