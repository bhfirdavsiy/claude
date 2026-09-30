// P1.1 — C2 assessment runtime integration: UI responses → LearningOrchestrator.submitAssessment →
// AssessmentEvaluator → immutable evidence → recomputeMastery. User-visible mastery stays disabled (C1).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {splitAssessmentBank} from '../src/domain/assessment/model.ts';
import {displayStatus,isAssessmentComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {ContentClient} from '../src/app/content-client.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
const LU='lu.9.15';
const unit=units.find(u=>u.id===LU);
const approved=structuredClone(bank); for(const i of approved.items) i.review={chemistry:'approved',didactic:'approved'};
const {prompts,keys}=splitAssessmentBank(approved);
const source={loadAssessmentForEvaluation:async(lu)=>({version:prompts.version,prompts:prompts.items.filter(p=>p.learningUnitId===lu),keys:keys.keys})};
const versions={contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0',curriculumVersion:'2026.09'};
let tick=0; const clock=()=>new Date(Date.UTC(2026,8,29,12,0,tick++)).toISOString();
const service=(name,extra={})=>new BrowserProgressService(createFakeIndexedDb(),name,{now:clock,liveness:null,assessmentContent:source,...extra});
const correct=()=>bank.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId}));
const wrong=()=>bank.items.map(i=>({itemId:i.id,selectedOptionId:i.options.find(o=>o.id!==i.correctOptionId).id}));
const conceptCount=bank.items.reduce((n,i)=>n+i.conceptIds.length,0);

test('objective assessment: one assessment attempt + objective evidence + mastery recompute through the canonical boundary',async()=>{
  const s=service('c2-correct');
  const session=s.beginAssessment(LU,versions,unit.conceptIds);
  const feedback=await s.submitAssessment(session,correct());
  assert.deepEqual([feedback.objectiveItems,feedback.correctItems],[5,5]);
  assert.doesNotMatch(JSON.stringify(feedback),/correctOptionId|explanation|scoringRule|mastered|needs_review|confidence/,'feedback never carries the key or mastery');
  const [attempt]=await s.storage.listAttempts();
  assert.equal(attempt.attemptType,'assessment');
  assert.equal(attempt.activityId,`assessment.${LU}`);
  assert.equal(attempt.activityVersion,bank.version);
  assert.equal(attempt.status,'completed');
  assert.equal(attempt.startedAt,session.startedAt,'startedAt is fixed when the assessment was opened');
  assert.ok(attempt.completedAt>attempt.startedAt,'completedAt = submittedAt');
  assert.deepEqual([attempt.contentVersion,attempt.scoringVersion,attempt.curriculumVersion],['2026.09.1','1.0.0','2026.09']);
  const evidence=await s.storage.listEvidence();
  assert.equal(evidence.length,conceptCount);
  for(const e of evidence){
    assert.equal(e.evidenceClass,'concept-assessment');
    assert.equal(e.attemptId,attempt.id);
    assert.ok(e.questionId&&e.response&&e.itemVersion&&e.conceptId&&e.createdAt&&e.contentVersion&&e.activityVersion&&e.scoringVersion,'full provenance');
  }
  // mastery was recomputed for every assessed concept (cache present), under the explicit context
  for(const conceptId of new Set(evidence.map(e=>e.conceptId))){
    const m=await s.storage.loadMastery(conceptId);
    assert.ok(m&&m.evidenceIds.length>0,conceptId);
    assert.equal(m.context.scoringVersion,'1.0.0');
  }
  const progress=await s.loadProgress(LU);
  assert.equal(isAssessmentComplete(progress),true);
  const result=await s.storage.loadAssessment(`assessment.${LU}.${attempt.id}`);
  assert.equal(result.score,100);
  assert.equal(result.assessmentVersion,bank.version);
});

test('wrong answers are evidence too (history is not a record of correct answers only)',async()=>{
  const s=service('c2-wrong');
  const feedback=await s.submitAssessment(s.beginAssessment(LU,versions,unit.conceptIds),wrong());
  assert.equal(feedback.correctItems,0);
  const evidence=await s.storage.listEvidence();
  assert.equal(evidence.length,conceptCount);
  assert.ok(evidence.every(e=>e.correct===false&&e.score===0&&e.correctness==='incorrect'));
  assert.equal(isAssessmentComplete(await s.loadProgress(LU)),true,'an evaluated assessment is complete regardless of score');
});

test('assessment retry creates a new attempt; the submitted attempt and its evidence never change',async()=>{
  const s=service('c2-retry');
  const first=s.beginAssessment(LU,versions,unit.conceptIds);
  const r1=await s.submitAssessment(first,wrong());
  await assert.rejects(s.submitAssessment(r1.session,correct()),/ASSESSMENT_ALREADY_SUBMITTED/);
  const before={attempts:await s.storage.listAttempts(),evidence:await s.storage.listEvidence()};
  const second=s.retryAssessment(r1.session);
  assert.notEqual(second.id,first.id);
  const r2=await s.submitAssessment(second,correct());
  assert.notEqual(r2.attemptId,r1.attemptId);
  const attempts=await s.storage.listAttempts();
  assert.equal(attempts.length,2);
  assert.deepEqual(attempts.find(a=>a.id===r1.attemptId),before.attempts[0]);
  const evidence=await s.storage.listEvidence();
  assert.equal(evidence.length,2*conceptCount);
  for(const e of before.evidence) assert.deepEqual(evidence.find(x=>x.id===e.id),e);
});

test('an opened but unsubmitted assessment leaves no attempt and no evidence',async()=>{
  const s=service('c2-leave');
  s.leaveAssessment(s.beginAssessment(LU,versions,unit.conceptIds));
  assert.deepEqual(await s.storage.listAttempts(),[]);
  assert.deepEqual(await s.storage.listEvidence(),[]);
});

test('reflection → REINFORCEMENT_COMPLETED only: 0 assessment evidence, 0 attempts, no assessment state',async()=>{
  const s=service('c2-reflection');
  await s.recordReinforcement(LU,versions,{mode:'reflection',conceptReflection:'a',practiceReflection:'b',connectionReflection:'c',confidence:'understood'});
  assert.deepEqual(await s.storage.listEvidence(),[]);
  assert.deepEqual(await s.storage.listAttempts(),[]);
  const progress=await s.loadProgress(LU);
  assert.equal(isAssessmentComplete(progress),false);
  assert.notEqual(progress.status,'assessment_complete');
  // a legacy-shaped "objective_quiz" payload through the reflection path is still not an assessment
  await s.recordReinforcement(LU,versions,{mode:'objective_quiz',quizScore:100});
  assert.deepEqual(await s.storage.listEvidence(),[]);
  assert.equal(isAssessmentComplete(await s.loadProgress(LU)),false);
});

test('assessment evidence of an old scoring version never enters the new mastery',async()=>{
  const factory=createFakeIndexedDb();
  const old=new BrowserProgressService(factory,'c2-versions',{now:clock,liveness:null,assessmentContent:source});
  await old.submitAssessment(old.beginAssessment(LU,{...versions,scoringVersion:'0.9.0'},unit.conceptIds),correct());
  const current=new BrowserProgressService(factory,'c2-versions',{now:clock,liveness:null,assessmentContent:source});
  const conceptId=bank.items[0].conceptIds[0];
  const [m]=await current.recomputeMastery([conceptId],{contentVersion:versions.contentVersion,scoringVersion:'1.0.0',curriculumVersion:'2026.09'});
  assert.deepEqual(m.evidenceIds,[],'0.9.0 evidence is not counted under 1.0.0');
  assert.ok(m.excludedEvidenceIds.length>0,'it stays in history as excluded');
});

// P1.2: C1 is now enabled for pilot units — but as its own MasteryViewModel. The invariant kept here is that the
// LESSON status never carries mastery (progress ≠ mastery), which is what this test asserts.
test('lesson status never shows mastery: a mastered/needs_review unit keeps a lesson label (mastery is a separate view)',async()=>{
  const s=service('c2-c1');
  // enough correct objective evidence to reach mastery on the unit concepts
  for(let i=0;i<3;i++){const session=s.beginAssessment(LU,versions,unit.conceptIds);await s.submitAssessment(session,correct());}
  const progress=await s.loadProgress(LU);
  assert.equal(displayStatus(progress),'assessment_complete');
  assert.equal(displayStatus({...progress,status:'needs_review'}),'assessment_complete');
  assert.equal(displayStatus({...progress,status:'mastered'}),'assessment_complete');
  const [row]=buildProgressViewModel([progress],[{id:LU,grade:9,title:'Elektroliz'}]);
  assert.doesNotMatch(row.statusLabel,/O‘zlashtirilgan|Takrorlash kerak/);
  const snapshot=await s.getCycleSnapshot(LU);
  assert.ok(!['mastered','needs_review'].includes(snapshot.status));
  assert.equal(snapshot.assessmentComplete,true);
});

test('submission is fail-closed: missing source, missing/invalid responses leave no trace',async()=>{
  const noSource=service('c2-nosource',{assessmentContent:undefined});
  await assert.rejects(noSource.submitAssessment(noSource.beginAssessment(LU,versions,unit.conceptIds),correct()),/ASSESSMENT_CONTENT_SOURCE_MISSING/);
  const s=service('c2-invalid');
  await assert.rejects(s.submitAssessment(s.beginAssessment(LU,versions,unit.conceptIds),correct().slice(1)),/ASSESSMENT_RESPONSE_MISSING/);
  await assert.rejects(s.submitAssessment(s.beginAssessment(LU,versions,unit.conceptIds),correct().map((r,i)=>i?r:{...r,selectedOptionId:'Z'})),/ASSESSMENT_RESPONSE_INVALID_OPTION/);
  assert.deepEqual(await s.storage.listAttempts(),[]);
  assert.deepEqual(await s.storage.listEvidence(),[]);
});

// ------------------------------------------------------------------ real content client: keys only at evaluation time

test('page load never fetches the key pack; evaluation loads keys only for presented (approved) items',async()=>{
  const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
  const pack=path.join(root,'public/content',pointer.activeVersion);
  const fetched=[];
  const fetchImpl=async(u)=>{u=String(u);fetched.push(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};const t=fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8');return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const hub=await client.loadLearningHub(LU);
  assert.doesNotMatch(JSON.stringify(hub),/correctOptionId|explanation|scoringRule/);
  assert.ok(!fetched.some(u=>u.endsWith('assessment/keys.json')),'no key pack on page load');
  const forEval=await client.loadAssessmentForEvaluation(LU);
  assert.ok(fetched.some(u=>u.endsWith('assessment/keys.json')));
  // today all pilot items are pending review → nothing is presented, so nothing is scorable (fail closed)
  assert.deepEqual([forEval.prompts.length,forEval.keys.length],[0,0]);
});
