// P1.1 closeout — kill-critic audit of the assessment/routing surface (docs/reviews/p1.1-kill-critic.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {ContentClient} from '../src/app/content-client.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {splitAssessmentBank,validatePromptPack} from '../src/domain/assessment/model.ts';
import {evaluateAssessment} from '../src/domain/assessment/evaluator.ts';
import {computeConceptMastery} from '../src/domain/mastery/mastery.ts';
import {compileExecutionPlans,CONFIG_SOURCE_NAMES} from '../src/runtime/practice-router/execution-plan.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
const KEY=/correctOptionId|scoringRule/;
// explanation texts live only in the key layer; they must not surface through any learner-facing output
const noKey=(out,label)=>{const json=JSON.stringify(out)??'';assert.doesNotMatch(json,KEY,label);for(const i of bank.items)assert.ok(!json.includes(i.explanation),`${label}: explanation of ${i.id}`);};
const fetchImpl=async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};const t=fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8');return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};

// ------------------------------------------------------------------ §3 key cache

test('after an evaluation loaded the key pack, no other client API, own property or serialisation exposes it',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  await client.loadAssessmentForEvaluation('lu.9.15');          // key pack now cached internally
  assert.equal(Object.keys(client).includes('cache'),false,'the file cache is a true private (#) field');
  for(const k of Object.keys(client)) noKey(client[k] instanceof Map?[...client[k].entries()]:client[k],k);
  assert.equal('cache' in client,false);
  noKey(client,'client');
  noKey(await client.loadLearningHub('lu.9.15'),'hub');          // prompt getter after keys were loaded
  noKey(await client.loadCurriculum(),'curriculum');
  noKey(await client.loadSearchIndex(),'search');
  noKey(await client.getRuntimeVersions(),'versions');
  noKey(await client.loadPractice('practice.trainer.7.4'),'practice');
});

// ------------------------------------------------------------------ §4 wrong-answer evidence semantics

const ev=(id,cls,score,createdAt,activityId)=>({id,conceptId:'c',activityId,activityVersion:'1',contentVersion:'v',scoringVersion:'1',createdAt,score,evidenceClass:cls,type:'answer',questionId:id,correct:score===1});
test('a wrong assessment answer weighs as ONE concept-assessment observation (0.35) — it does not wipe practice evidence',()=>{
  const practice=[ev('p1','trainer-calculation',1,'2026-09-01T00:00:00.000Z','practice.a'),ev('p2','practice-observation',1,'2026-09-02T00:00:00.000Z','practice.b')];
  const wrong=ev('a1','concept-assessment',0,'2026-09-03T00:00:00.000Z','assessment.lu');
  const m=computeConceptMastery({conceptId:'c',evidence:[...practice,wrong],scoringVersion:'1',context:{scoringVersion:'1',contentVersion:'v'}});
  // recency factors 1.0, 1.1, 1.2 → (0.2·1 + 0.15·1.1·1 + 0.35·1.2·0) / (0.2 + 0.165 + 0.42)
  const expected=Math.round((0.2+0.165)/(0.2+0.165+0.42)*10000)/10000;
  assert.equal(m.confidence,expected);
  assert.ok(m.confidence>0&&m.confidence<1);
  assert.deepEqual(m.evidenceIds,['p1','p2','a1'],'practice evidence is still counted');
  assert.equal(m.status,'developing');
});

// ------------------------------------------------------------------ §5 multi-concept items

test('multi-concept item: 1 response → N evidence, unique ids, no duplicated concept, no inflated independence',async()=>{
  const approved=structuredClone(bank); for(const i of approved.items) i.review={chemistry:'approved',didactic:'approved'};
  const multi=approved.items.find(i=>i.conceptIds.length>1);
  assert.ok(multi,'the pilot bank has a multi-concept item');
  const {prompts,keys}=splitAssessmentBank(approved);
  const service=new BrowserProgressService(createFakeIndexedDb(),'mc',{liveness:null,assessmentContent:{loadAssessmentForEvaluation:async()=>({version:prompts.version,prompts:prompts.items,keys:keys.keys})}});
  const V={contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0'};
  await service.submitAssessment(service.beginAssessment('lu.9.15',V,[]),approved.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId})));
  const evidence=await service.storage.listEvidence();
  const forItem=evidence.filter(e=>e.questionId===multi.id);
  assert.deepEqual(forItem.map(e=>e.conceptId).sort(),[...multi.conceptIds].sort(),'exactly one evidence per mapped concept');
  assert.equal(new Set(evidence.map(e=>e.id)).size,evidence.length,'unique persisted ids');
  assert.equal(new Set(evidence.map(e=>e.sourceEvidenceId)).size,evidence.length,'unique source identities');
  // the whole assessment is ONE independent source for mastery (activityId = assessment id)
  assert.equal(new Set(evidence.map(e=>e.independenceKey??e.activityId)).size,1);
  // a duplicated concept mapping is rejected at every layer
  const dup=structuredClone(approved); dup.items[0].conceptIds=[dup.items[0].conceptIds[0],dup.items[0].conceptIds[0]];
  const split=splitAssessmentBank(dup);
  assert.throws(()=>validatePromptPack(split.prompts),/ASSESSMENT_CONCEPT_MAPPING_DUPLICATE/);
  assert.throws(()=>evaluateAssessment({prompts:split.prompts.items,keys:split.keys.keys,submission:{assessmentId:'a',learningUnitId:'lu.9.15',assessmentVersion:'1',responses:dup.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId}))}}),/ASSESSMENT_CONCEPT_MAPPING_DUPLICATE/);
});

// ------------------------------------------------------------------ §6 retry history

test('attempt 1 wrong → attempt 2 correct: both immutable, mastery sees the whole history',async()=>{
  const approved=structuredClone(bank); for(const i of approved.items) i.review={chemistry:'approved',didactic:'approved'};
  const {prompts,keys}=splitAssessmentBank(approved);
  let t=0; const now=()=>new Date(Date.UTC(2026,8,29,13,0,t++)).toISOString();
  const service=new BrowserProgressService(createFakeIndexedDb(),'retry-history',{now,liveness:null,assessmentContent:{loadAssessmentForEvaluation:async()=>({version:prompts.version,prompts:prompts.items,keys:keys.keys})}});
  const V={contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0'};
  const wrong=approved.items.map(i=>({itemId:i.id,selectedOptionId:i.options.find(o=>o.id!==i.correctOptionId).id}));
  const right=approved.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId}));
  const r1=await service.submitAssessment(service.beginAssessment('lu.9.15',V,[]),wrong);
  const snapshot1={attempts:await service.storage.listAttempts(),evidence:await service.storage.listEvidence()};
  const r2=await service.submitAssessment(service.retryAssessment(r1.session),right);
  assert.notEqual(r1.attemptId,r2.attemptId);
  const attempts=await service.storage.listAttempts();
  assert.deepEqual(attempts.find(a=>a.id===r1.attemptId),snapshot1.attempts[0]);
  const evidence=await service.storage.listEvidence();
  for(const e of snapshot1.evidence) assert.deepEqual(evidence.find(x=>x.id===e.id),e,'attempt 1 evidence untouched');
  const conceptId=approved.items[0].conceptIds[0];
  const mastery=await service.storage.loadMastery(conceptId);
  const byAttempt=new Set(evidence.filter(e=>mastery.evidenceIds.includes(e.id)).map(e=>e.attemptId));
  assert.deepEqual([...byAttempt].sort(),[r1.attemptId,r2.attemptId].sort(),'mastery is computed over both attempts');
});

// ------------------------------------------------------------------ §7 execution-plan coverage

test('routing coverage: 118 + 27 + 1 = 146, no released activity with 0 or 2+ plans, the disabled one cannot launch',async()=>{
  const activities=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs',`${n}.json`),'utf8'))]));
  const {pack:plans,report,fatal}=compileExecutionPlans(activities,configs);
  assert.deepEqual([report.total,report.ready,report.pending,report.disabled],[146,118,27,1]);
  assert.equal(report.ready+report.pending+report.disabled,report.total);
  assert.deepEqual(fatal,[]);
  for(const a of activities.filter(x=>x.lifecycleStatus==='ready')) assert.equal(plans.plans.filter(p=>p.activityId===a.id).length,1,a.id);
  const disabled=activities.find(a=>a.id==='practice.simulation.10.4');
  assert.notEqual(disabled.lifecycleStatus,'ready','the disabled activity is not release-eligible');
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  await assert.rejects(client.loadPractice('practice.simulation.10.4'),/PRACTICE_CONFIG_NOT_FOUND/);
});
