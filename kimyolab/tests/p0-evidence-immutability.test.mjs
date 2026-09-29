// P0.4 — evidence is immutable: every attempt is its own entity and nothing is overwritten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {bindEvidenceToAttempt,validatePersistedEvidence} from '../src/runtime/evidence/types.ts';
import {LearningRunner} from '../src/runtime/learning-runner/runner.ts';
import {PracticeRouter} from '../src/runtime/practice-router/router.ts';
import {UUID_PATTERN} from '../src/runtime/shared/ids.ts';

const page={id:'practice.trainer.7.01',type:'trainer',title:'T',goal:'G',accessibility:[],learningUnit:{id:'lu.7.01',grade:7,title:'U'},configFamily:'reference',referenceConfig:{},activityVersion:'2026.09.1',contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0',chemistry:{reactions:[],solutionRules:{version:'1',dissociation:[],insoluble:[]}}};
// Engines derive evidence ids from the activity — identical on every attempt.
const draft=(correct)=>({id:`${page.id}.answer.1`,conceptId:'concept.c001',activityId:page.id,activityVersion:'2026.09.1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:'2026-09-29T10:00:00.000Z',score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:'q.1',correct});

test('the same activity completed 20 times yields 20 attempts and 20 distinct evidence records',async()=>{
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'p0-evidence-20');
  for(let i=0;i<20;i++) await service.recordPracticeResult(page,{evidence:[draft(i%2===0)],serializedState:`{"n":${i}}`,finalState:{status:'complete'}});
  const store=new IndexedDbProgressStore(factory,'p0-evidence-20');
  const attempts=await store.listAttempts('lu.7.01');
  const evidence=await store.loadEvidenceForConcept('concept.c001');
  assert.equal(attempts.length,20);
  assert.equal(evidence.length,20);
  assert.equal(new Set(evidence.map(e=>e.id)).size,20);
  assert.equal(new Set(evidence.map(e=>e.attemptId)).size,20);
  for(const e of evidence){
    assert.match(e.id,UUID_PATTERN);
    assert.notEqual(e.id,e.activityId);
    assert.equal(e.sourceEvidenceId,`${page.id}.answer.1`);
    assert.equal(e.learningUnitId,'lu.7.01');
  }
  assert.deepEqual(evidence.map(e=>e.correctness).filter(x=>x==='correct').length,10);
  const mastery=await store.loadMastery('concept.c001');
  assert.equal(mastery.evidenceIds.length,20,'mastery sees the full history, not just the last attempt');
});

test('persisted evidence is append-only: an existing id is rejected, never overwritten',async()=>{
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p0-append-only');
  let n=0; const newId=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
  const first=bindEvidenceToAttempt({learningUnitId:'lu.7.01',activityId:page.id,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',startedAt:'2026-09-29T10:00:00.000Z',completedAt:'2026-09-29T10:01:00.000Z'},[draft(true)],newId);
  await store.recordAttempt(first.attempt,first.evidence);
  const clash={...first.evidence[0],score:0,correct:false,correctness:'incorrect'};
  await assert.rejects(()=>store.saveEvidence(clash),/EVIDENCE_ID_COLLISION/);
  const [kept]=await store.loadEvidenceForAttempt(first.attempt.id);
  assert.equal(kept.score,1);
});

test('a failing evidence write rolls back the whole attempt',async()=>{
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p0-atomic');
  const ids=['a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002'];
  let i=0; const newId=()=>ids[i++];
  const bound=bindEvidenceToAttempt({learningUnitId:'lu.7.01',activityId:page.id,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',startedAt:'2026-09-29T10:00:00.000Z',completedAt:'2026-09-29T10:01:00.000Z'},[draft(true),draft(false)],newId);
  await assert.rejects(()=>store.recordAttempt(bound.attempt,bound.evidence),/EVIDENCE_ID_COLLISION/);
  assert.deepEqual(await store.listAttempts(),[]);
  assert.deepEqual(await store.listEvidence(),[]);
});

test('evidence.id = activityId (or the engine id) is rejected at the persistence boundary',()=>{
  const base={...draft(true),attemptId:'a',learningUnitId:'lu.7.01',sourceEvidenceId:'x',correctness:'correct'};
  assert.throws(()=>validatePersistedEvidence({...base,id:page.id}),/must not reuse activity or engine ids/);
  assert.throws(()=>validatePersistedEvidence({...base,id:'x'}),/must not reuse activity or engine ids/);
  assert.throws(()=>validatePersistedEvidence({...draft(true)}),/attemptId required/);
});

test('drafts from a different content or scoring version cannot be bound to an attempt',()=>{
  const input={learningUnitId:'lu.7.01',activityId:page.id,activityVersion:'1',contentVersion:'2026.10.1',scoringVersion:'1.0.0',startedAt:'2026-09-29T10:00:00.000Z',completedAt:'2026-09-29T10:01:00.000Z'};
  assert.throws(()=>bindEvidenceToAttempt(input,[draft(true)],()=>crypto.randomUUID()),/EVIDENCE_VERSION_MISMATCH/);
});

test('LearningRunner records a new attempt per run instead of overwriting',async()=>{
  const at='2026-09-29T10:00:00.000Z';
  const unit={id:'lu.demo',grade:7,title:'Demo',learningOutcomes:['x'],conceptIds:['concept.c1'],prerequisiteConceptIds:[],lessonTemplates:[],curriculumVersion:'2026.09',sourceRefs:[],legacyIds:[]};
  const practice={id:'practice.trainer.demo',type:'trainer',title:'P',goal:'P',conceptIds:['concept.c1'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:[],engineCompatibility:{engine:'trainer',range:'^1'},sourceRefs:[],legacyIds:[],version:'1'};
  const repo={getLearningUnit:()=>unit,getPrimaryMapping:()=>({id:'m',learningUnitId:'lu.demo',theoryActivityId:'theory.demo',practiceActivityId:practice.id,conceptIds:['concept.c1'],role:'primary',required:true,coverageStatus:'full'}),getTheoryActivity:()=>({id:'theory.demo'}),getPracticeActivity:()=>practice};
  const ev=(id,cls)=>({id,conceptId:'concept.c1',activityId:practice.id,activityVersion:'1',contentVersion:'c1',scoringVersion:'s1',createdAt:at,score:1,evidenceClass:cls,type:'procedure',stepId:'x',accepted:true});
  const router=new PracticeRouter(); router.register('trainer',{run:async()=>({evidence:[ev('same.id','practice-observation')]})});
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p0-runner');
  const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async()=>[ev('same.assessment','concept-assessment')],contentVersion:'c1',schemaVersion:'1.0.0',assessmentVersion:'a1',scoringVersion:'s1',now:()=>at});
  for(let i=0;i<5;i++) assert.equal((await runner.run('lu.demo',{})).ok,true);
  assert.equal((await store.listAttempts('lu.demo')).length,10);
  assert.equal((await store.loadEvidenceForConcept('concept.c1')).length,10);
});
