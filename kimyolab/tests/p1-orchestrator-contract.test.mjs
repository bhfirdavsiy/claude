// P1.0 — Canonical Learning Runtime contract. These tests pin the INVARIANTS of the orchestrator,
// not its implementation: attempts, evidence, versions, concurrency, monotonic achievement, parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {LearningOrchestrator} from '../src/runtime/learning-orchestrator/orchestrator.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {LearningRunner} from '../src/runtime/learning-runner/runner.ts';
import {PracticeRouter} from '../src/runtime/practice-router/router.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {computeConceptMastery} from '../src/domain/mastery/mastery.ts';

const V={contentVersion:'2026.09.1',contentSchemaVersion:'1.0.0',scoringVersion:'1.0.0',curriculumVersion:'2026.09'};
let tick=0; const clock=()=>new Date(Date.UTC(2026,8,29,10,0,tick++)).toISOString();

const draft=(id,conceptId,{score=1,correct=true,cls='trainer-calculation',contentVersion=V.contentVersion,activityId='practice.trainer.demo'}={})=>({id,conceptId,activityId,activityVersion:'1',contentVersion,scoringVersion:V.scoringVersion,createdAt:clock(),score,evidenceClass:cls,type:'answer',questionId:`q.${id}`,correct});
function orchestrator(name,options={}){const store=new IndexedDbProgressStore(createFakeIndexedDb(),name);return {store,o:new LearningOrchestrator(store,{now:clock,...options})};}
const begin=(o,extra={})=>o.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions:V,conceptIds:['concept.c1','concept.c2'],...extra});

// Real content + engine for browser-path tests.
const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const fetchImpl=async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};const t=fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8');return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};
const client=new ContentClient({fetchImpl,baseUrl:'/content'});
const calcCommands=[['h-contribution',1],['h-contribution',2],['s-contribution',30],['s-contribution',32],['o-contribution',60],['o-contribution',64],['total',90],['total',98],['total',98],['total',98]]
  .map(([stepId,value])=>({kind:'calculation-response',response:{stepId,value,unit:'relative-mass'}}));

// ------------------------------------------------------------------ attempt / session lifecycle

test('10 UI commands in one practice page session = exactly 1 Attempt',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p1-ten',{now:clock});
  const page=await client.loadPractice('practice.calculation.7.5');
  const session=service.beginPracticeSession(page,new ReferencePracticeSession(page));
  for(const c of calcCommands){const out=await service.applyPracticeCommand(session,c);assert.equal(out.persistError,undefined);}
  const attempts=await service.storage.listAttempts();
  assert.equal(attempts.length,1);
  const evidence=await service.storage.listEvidence();
  assert.ok(evidence.every(e=>e.attemptId===attempts[0].id));
  // wrong + corrected answers are distinct semantic evidence; exact repeats are not persisted again
  const signatures=evidence.map(e=>`${e.sourceEvidenceId}|${e.value}|${e.score}`);
  assert.equal(new Set(signatures).size,signatures.length,'no duplicate semantic evidence inside the attempt');
});

test('BEGIN_PRACTICE fixes attempt identity; commands never create a new attempt',async()=>{
  const {o,store}=orchestrator('p1-identity');
  const s=begin(o);
  const r1=await o.applyPracticeResult(s,{evidence:[draft('ev.a','concept.c1',{score:0,correct:false})]});
  const r2=await o.applyPracticeResult(s,{evidence:[draft('ev.a','concept.c1',{score:0,correct:false}),draft('ev.b','concept.c1')]});
  assert.equal(r1.session.attemptId,s.attemptId);
  assert.equal(r2.session.attemptId,s.attemptId);
  const [attempt]=await store.listAttempts();
  assert.equal(attempt.id,s.attemptId);
  assert.equal(attempt.startedAt,s.startedAt);
  assert.equal(attempt.status,'in_progress');
  assert.equal(attempt.completedAt,undefined);
});

test('COMPLETE_PRACTICE sets completedAt once; RETRY_PRACTICE always opens a new attempt and leaves the old one unchanged',async()=>{
  const {o,store}=orchestrator('p1-retry');
  const s1=begin(o);
  await o.applyPracticeResult(s1,{evidence:[draft('ev.a','concept.c1')]});
  const done=await o.completePractice(s1);
  assert.equal(done.attempt.status,'completed');
  const before=await store.loadAttempt(s1.attemptId);
  const s2=await o.retryPractice(done.session);
  assert.notEqual(s2.attemptId,s1.attemptId);
  await o.applyPracticeResult(s2,{evidence:[draft('ev.a','concept.c1',{score:0,correct:false})]});
  assert.deepEqual(await store.loadAttempt(s1.attemptId),before,'previous attempt untouched');
  assert.equal((await store.listAttempts()).length,2);
});

test('ABANDON_PRACTICE closes an unfinished attempt as abandoned; it is never shown as a success and accepts no more evidence',async()=>{
  const {o,store}=orchestrator('p1-abandon');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.a','concept.c1',{score:0,correct:false})]});
  const closed=await o.abandonPractice(s);
  assert.equal(closed.status,'abandoned');
  const attempt=await store.loadAttempt(s.attemptId);
  assert.equal(attempt.status,'abandoned');
  assert.ok(attempt.completedAt);
  await assert.rejects(()=>store.appendAttemptEvidence(s.attemptId,[]),/EVIDENCE_ATTEMPT_ABANDONED/);
  assert.equal((await store.loadProgress('lu.demo')).status,'in_progress','abandoning never raises achievement');
  // An abandoned session without evidence leaves no attempt at all.
  const empty=begin(o); await o.abandonPractice(empty);
  assert.equal(await store.loadAttempt(empty.attemptId),undefined);
});

test('evidence stays append-only: the same semantic evidence is persisted once per attempt',async()=>{
  const {o,store}=orchestrator('p1-dup');
  const s=begin(o);
  for(let i=0;i<5;i++) await o.applyPracticeResult(s,{evidence:[draft('ev.a','concept.c1'),draft('ev.b','concept.c2')]});
  assert.equal((await store.listEvidence()).length,2);
  const [a]=await store.loadEvidenceForConcept('concept.c1');
  await assert.rejects(()=>store.saveEvidence({...a,score:0}),/EVIDENCE_ID_COLLISION/);
});

// ------------------------------------------------------------------ mastery

test('mastery is always computed under the explicit content/scoring/curriculum context',async()=>{
  const {o,store}=orchestrator('p1-ctx');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.new','concept.c1')]});
  // evidence from another content version is present in the store but must not count
  const old=begin(o,{versions:{...V,contentVersion:'2025.01.1'}});
  await o.applyPracticeResult(old,{evidence:[draft('ev.old','concept.c1',{score:0,correct:false,contentVersion:'2025.01.1'})]});
  const [m]=await o.recomputeMastery(['concept.c1'],V);
  assert.deepEqual(m.context,{contentVersion:V.contentVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion});
  assert.equal(m.evidenceIds.length,1);
  assert.equal(m.excludedEvidenceIds.length,1);
  assert.equal((await store.listEvidence()).length,2,'excluded evidence is kept as history');
});

test('mastery is derived: dropping the cache and recomputing from evidence gives the same value',async()=>{
  const {o,store}=orchestrator('p1-derived');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.a','concept.c1'),draft('ev.b','concept.c1',{score:0,correct:false,cls:'concept-assessment'})]});
  const cached=await store.loadMastery('concept.c1');
  await store.resetStore('mastery');
  const [rebuilt]=await o.recomputeMastery(['concept.c1'],V);
  assert.deepEqual(rebuilt,cached);
});

test('touched-concept recomputation is equivalent to a full unit recomputation (D6)',async()=>{
  const {o,store}=orchestrator('p1-scope');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1')]});
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1'),draft('ev.2','concept.c2',{score:0,correct:false})]});
  const cached=[await store.loadMastery('concept.c1'),await store.loadMastery('concept.c2')];
  const full=['concept.c1','concept.c2'].map(async c=>computeConceptMastery({conceptId:c,evidence:await store.loadEvidenceForConcept(c),scoringVersion:V.scoringVersion,context:{contentVersion:V.contentVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion}}));
  assert.deepEqual(cached,await Promise.all(full));
});

test('performance guard: one command reads evidence only for the concepts it touched (no full-history scan)',async()=>{
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p1-perf');
  const calls=[];
  const spy=new Proxy(store,{get(target,prop){const v=target[prop];return typeof v==='function'?(...a)=>{calls.push(String(prop));return v.apply(target,a);}:v;}});
  const o=new LearningOrchestrator(spy,{now:clock});
  const s=o.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions:V,conceptIds:['concept.c1','concept.c2','concept.c3']});
  for(let i=0;i<20;i++) await o.applyPracticeResult(s,{evidence:[draft(`ev.${i}`,'concept.c1')]});
  calls.length=0;
  await o.applyPracticeResult(s,{evidence:[draft('ev.last','concept.c2')]});
  assert.equal(calls.filter(c=>c==='loadEvidenceForConcept').length,1);
  assert.equal(calls.filter(c=>c==='listEvidence'||c==='exportSnapshot').length,0);
  calls.length=0;
  await o.applyPracticeResult(s,{evidence:[draft('ev.last','concept.c2')]}); // pure repeat
  assert.equal(calls.filter(c=>c==='loadEvidenceForConcept'||c==='recordAttempt'||c==='appendAttemptEvidence').length,0,'a repeat does no evidence or mastery work');
});

// ------------------------------------------------------------------ atomic progress & monotonicity

test('parallel COMPLETE_THEORY and practice state saves do not overwrite each other (C8)',async()=>{
  const factory=createFakeIndexedDb();
  const a=new LearningOrchestrator(new IndexedDbProgressStore(factory,'p1-race'),{now:clock});
  const b=new LearningOrchestrator(new IndexedDbProgressStore(factory,'p1-race'),{now:clock});
  const s=b.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions:V});
  const s2=a.beginPractice({learningUnitId:'lu.demo',activityId:'practice.case.demo',activityVersion:'1',practiceType:'case',versions:V});
  await Promise.all([
    a.completeTheory('lu.demo',V),
    b.applyPracticeResult(s,{serializedState:'{"step":1}'}),
    a.applyPracticeResult(s2,{serializedState:'{"case":true}'}),
    b.submitReinforcement('lu.demo',V,{mode:'reflection'}),
  ]);
  const progress=await new IndexedDbProgressStore(factory,'p1-race').loadProgress('lu.demo');
  assert.ok(progress.activityStates['cycle.guide']);
  assert.equal(progress.activityStates['practice.trainer.demo'],'{"step":1}');
  assert.equal(progress.activityStates['practice.case.demo'],'{"case":true}');
  assert.ok(progress.activityStates['cycle.reinforcement']);
});

test('updateProgress is one read-modify-write transaction (100 concurrent increments are not lost)',async()=>{
  const store=new IndexedDbProgressStore(createFakeIndexedDb(),'p1-atomic');
  const base={learningUnitId:'lu.demo',status:'in_progress',activityStates:{},lastVisitedAt:clock(),contentVersion:'V',schemaVersion:'2.0.0'};
  await Promise.all(Array.from({length:100},()=>store.updateProgress('lu.demo',cur=>{const p=cur??base;return {...p,activityStates:{...p.activityStates,n:String(Number(p.activityStates.n??0)+1)}};})));
  assert.equal((await store.loadProgress('lu.demo')).activityStates.n,'100');
});

test('monotonic achievement: mastered → retry practice → failure does not regress the unit',async()=>{
  const {o,store}=orchestrator('p1-mono');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.p1','concept.c1',{cls:'practice-observation'})],finalState:{status:'complete'}});
  const assessed=await o.submitAssessment({learningUnitId:'lu.demo',versions:V,assessmentVersion:'1',conceptIds:['concept.c1'],drafts:[
    {...draft('ev.a1','concept.c1',{cls:'concept-assessment',activityId:'assessment.a'})},{...draft('ev.t1','concept.c1',{cls:'transfer-case',activityId:'case.b'})},{...draft('ev.a2','concept.c1',{cls:'concept-assessment',activityId:'assessment.c'})}]});
  assert.equal(assessed.progress.status,'mastered');
  const retry=await o.retryPractice(s);
  const failed=await o.applyPracticeResult(retry,{evidence:[draft('ev.p1','concept.c1',{score:0,correct:false,cls:'practice-observation'})]});
  assert.equal(failed.progress.status,'mastered','historical achievement stays');
  await o.completePractice(retry);
  assert.equal((await store.loadProgress('lu.demo')).status,'mastered');
  const snap=await o.getSnapshot('lu.demo',V,{conceptIds:['concept.c1'],session:retry});
  assert.equal(snap.practiceSession.status,'completed');
  assert.equal(snap.progress.status,'mastered');
});

test('snapshot activeStage follows the cycle (theory → practice → reinforcement → complete)',async()=>{
  const {o}=orchestrator('p1-stage');
  assert.equal((await o.getSnapshot('lu.demo',V)).activeStage,'theory');
  await o.completeTheory('lu.demo',V);
  assert.equal((await o.getSnapshot('lu.demo',V)).activeStage,'practice');
  const s=begin(o); await o.applyPracticeResult(s,{finalState:{status:'complete'}});
  assert.equal((await o.getSnapshot('lu.demo',V)).activeStage,'reinforcement');
  await o.submitReinforcement('lu.demo',V,{mode:'reflection'});
  assert.equal((await o.getSnapshot('lu.demo',V)).activeStage,'complete');
});

// ------------------------------------------------------------------ adapter parity

function normalize(snapshot){
  // Store order is by random UUID key; order attempts semantically so ids never influence the comparison.
  const attempts=[...snapshot.attempts].sort((x,y)=>x.activityId.localeCompare(y.activityId));
  const attemptIndex=new Map(attempts.map((a,i)=>[a.id,i]));
  const strip=(v)=>{try{const o=JSON.parse(v);for(const k of ['completedAt','attemptId','submittedAt','evaluatedAt'])delete o[k];return o;}catch{return v;}};
  return {
    progress:{status:snapshot.progress[0].status,contentVersion:snapshot.progress[0].contentVersion,activityStates:Object.fromEntries(Object.entries(snapshot.progress[0].activityStates).map(([k,v])=>[k,strip(v)]))},
    attempts:attempts.map(a=>({activityId:a.activityId,status:a.status,contentVersion:a.contentVersion,scoringVersion:a.scoringVersion,curriculumVersion:a.curriculumVersion,completed:Boolean(a.completedAt)})),
    evidence:snapshot.evidence.map(e=>({src:e.sourceEvidenceId,concept:e.conceptId,score:e.score,correctness:e.correctness,attempt:attemptIndex.get(e.attemptId)})).sort((x,y)=>x.src.localeCompare(y.src)),
    mastery:snapshot.mastery.map(m=>({concept:m.conceptId,status:m.status,confidence:m.confidence,n:m.evidenceIds.length,excluded:(m.excludedEvidenceIds??[]).length})).sort((x,y)=>x.concept.localeCompare(y.concept)),
    assessments:snapshot.assessmentAttempts.map(a=>({score:a.score,weak:a.weakConceptIds})),
  };
}

test('adapter parity: LearningRunner and BrowserProgressService produce the same canonical state',async()=>{
  const unit={id:'lu.demo',grade:7,title:'Demo',learningOutcomes:['x'],conceptIds:['concept.c1','concept.c2'],prerequisiteConceptIds:[],lessonTemplates:[],curriculumVersion:'2026.09',sourceRefs:[],legacyIds:[]};
  const practice={id:'practice.trainer.demo',type:'trainer',title:'P',goal:'P',conceptIds:['concept.c1'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:[],engineCompatibility:{engine:'trainer',range:'^1'},sourceRefs:[],legacyIds:[],version:'1'};
  const practiceResult=()=>({evidence:[draft('ev.p1','concept.c1',{cls:'practice-observation'}),draft('ev.p2','concept.c2',{score:0,correct:false})],serializedState:'{"answers":2}',finalState:{status:'complete'}});
  const assessment=()=>[draft('ev.a1','concept.c1',{cls:'concept-assessment',activityId:'assessment.demo'}),draft('ev.t1','concept.c2',{cls:'transfer-case',activityId:'case.demo'})];
  const reflection={mode:'reflection',confidence:'understood'};

  // Path A — LearningRunner facade
  const factoryA=createFakeIndexedDb();
  const router=new PracticeRouter(); router.register('trainer',{run:async()=>practiceResult()});
  const runner=new LearningRunner({repository:{getLearningUnit:()=>unit,getPrimaryMapping:()=>({id:'m',learningUnitId:'lu.demo',theoryActivityId:'theory.demo',practiceActivityId:practice.id,conceptIds:['concept.c1'],role:'primary',required:true,coverageStatus:'full'}),getTheoryActivity:()=>({id:'theory.demo'}),getPracticeActivity:()=>practice},
    practiceRouter:router,store:new IndexedDbProgressStore(factoryA,'parity'),assessmentRunner:async()=>assessment(),
    contentVersion:V.contentVersion,schemaVersion:V.contentSchemaVersion,assessmentVersion:'1',scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion,now:clock});
  await runner.completeTheory('lu.demo');
  const run=await runner.run('lu.demo',{});
  assert.equal(run.ok,true);
  await runner.submitReinforcement('lu.demo',reflection);

  // Path B — BrowserProgressService facade
  const factoryB=createFakeIndexedDb();
  const service=new BrowserProgressService(factoryB,'parity',{now:clock});
  const page={id:practice.id,type:'trainer',learningUnit:{id:'lu.demo',grade:7,title:'Demo',conceptIds:unit.conceptIds},activityVersion:'1',contentVersion:V.contentVersion,schemaVersion:V.contentSchemaVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion};
  const runtimeVersions={contentVersion:V.contentVersion,schemaVersion:V.contentSchemaVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion};
  await service.markGuideComplete('lu.demo',runtimeVersions);
  const session=service.beginPracticeSession(page,{apply:async()=>practiceResult()});
  const out=await service.applyPracticeCommand(session,{kind:'trainer-answer',answer:'x'});
  assert.equal(out.persistError,undefined);
  await service.submitAssessment('lu.demo',V,{assessmentVersion:'1',drafts:assessment(),conceptIds:unit.conceptIds});
  await service.recordReinforcement('lu.demo',runtimeVersions,reflection);

  const a=normalize(await new IndexedDbProgressStore(factoryA,'parity').exportSnapshot());
  const b=normalize(await new IndexedDbProgressStore(factoryB,'parity').exportSnapshot());
  assert.deepEqual(b,a);
  assert.equal(a.attempts.length,2);
  assert.equal(a.evidence.length,4);
  // assessment_complete here comes from the OBJECTIVE assessment both paths submit (ev.a1 is a
  // concept-assessment item), not from the reflection: see the next test for the flow without it.
  assert.equal(a.progress.status,'assessment_complete');
  assert.deepEqual(a.progress.activityStates['cycle.assessment'],{complete:true,objectiveItems:1,score:100});
});

test('parity flow WITHOUT an objective assessment never reaches assessment_complete (theory→practice→reflection)',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'parity-no-assessment',{now:clock});
  const runtimeVersions={contentVersion:V.contentVersion,schemaVersion:V.contentSchemaVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion};
  const page={id:'practice.trainer.demo',type:'trainer',learningUnit:{id:'lu.demo',grade:7,title:'Demo',conceptIds:['concept.c1']},activityVersion:'1',contentVersion:V.contentVersion,schemaVersion:V.contentSchemaVersion,scoringVersion:V.scoringVersion,curriculumVersion:V.curriculumVersion};
  await service.markGuideComplete('lu.demo',runtimeVersions);
  const session=service.beginPracticeSession(page,{apply:async()=>({evidence:[draft('ev.p1','concept.c1')],finalState:{status:'complete'}})});
  await service.applyPracticeCommand(session,{});
  const progress=await service.recordReinforcement('lu.demo',runtimeVersions,{mode:'reflection',confidence:'understood'});
  assert.equal(progress.status,'practice_complete');
  assert.equal(progress.activityStates['cycle.assessment'],undefined);
  const snapshot=await service.getCycleSnapshot('lu.demo');
  assert.deepEqual([snapshot.guideComplete,snapshot.practiceComplete,snapshot.reinforcementComplete],[true,true,true]);
  // reflection and practice evidence alone cannot be submitted as an assessment either
  await assert.rejects(service.submitAssessment('lu.demo',V,{assessmentVersion:'1',conceptIds:['concept.c1'],drafts:[draft('ev.r','concept.c1',{cls:'practice-observation'})]}),/ASSESSMENT_NO_OBJECTIVE_ITEMS/);
  assert.equal((await service.loadProgress('lu.demo')).status,'practice_complete');
});
