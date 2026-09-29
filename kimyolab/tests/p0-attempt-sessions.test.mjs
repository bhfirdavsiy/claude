// P0 review fix — one opened practice page is ONE attempt. Engines re-run over the accumulated input on
// every UI command and re-emit earlier evidence; only new/changed drafts may be appended (no inflation).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const fetchImpl=async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};const t=fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8');return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};
const client=new ContentClient({fetchImpl,baseUrl:'/content'});

const experiment=['selectApparatus','addWater','addMixture','mix','filter','evaporate','observe','observe','observe'].map(type=>({kind:'experiment-action',action:{type}}));
const calculation=[['h-contribution',2],['s-contribution',32],['o-contribution',64],['total',98]].map(([stepId,value])=>({kind:'calculation-response',response:{stepId,value,unit:'relative-mass'}}));

async function runSession(service,id,commands){
  const page=await client.loadPractice(id);
  const engine=new ReferencePracticeSession(page);
  const session=service.beginPracticeSession(page);
  let last;
  for(const c of commands){last=await engine.apply(c);await service.recordPracticeResult(page,last,session);}
  return {page,last};
}

test('a 9-command experiment session is one attempt with each distinct evidence stored once',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p0-session-exp');
  const {last}=await runSession(service,'practice.experiment.7.2',experiment);
  const attempts=await service.storage.listAttempts();
  const evidence=await service.storage.listEvidence();
  assert.equal(attempts.length,1);
  assert.equal(evidence.length,new Set(last.evidence.map(e=>e.id)).size,'no cumulative re-recording');
  assert.equal(new Set(evidence.map(e=>e.sourceEvidenceId)).size,evidence.length);
});

test('multi-step calculation: one attempt, one record per step',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p0-session-calc');
  await runSession(service,'practice.calculation.7.5',calculation);
  assert.equal((await service.storage.listAttempts()).length,1);
  assert.deepEqual((await service.storage.listEvidence()).map(e=>e.stepId).sort(),['h-contribution','o-contribution','s-contribution','total']);
});

test('opening the activity again is a new attempt',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p0-session-two');
  await runSession(service,'practice.calculation.7.5',calculation);
  await runSession(service,'practice.calculation.7.5',calculation);
  const attempts=await service.storage.listAttempts();
  assert.equal(attempts.length,2);
  assert.equal((await service.storage.listEvidence()).length,8);
  assert.notEqual(attempts[0].id,attempts[1].id);
});

test('a changed outcome for the same engine evidence id is recorded (history, not overwrite)',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p0-session-change');
  const page={id:'practice.simulation.7.07.planned',type:'simulation',learningUnit:{id:'lu.7.07',grade:7,title:'x'},activityVersion:'1',contentVersion:'V',schemaVersion:'1.0.0',scoringVersion:'1'};
  const draft=(achieved,at)=>({id:'practice.simulation.7.07.planned.construction',conceptId:'concept.c001',activityId:page.id,activityVersion:'1',contentVersion:'V',scoringVersion:'1',createdAt:at,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:'C-14',achieved});
  const session=service.beginPracticeSession(page);
  await service.recordPracticeResult(page,{evidence:[draft(false,'2026-09-29T10:00:00Z')]},session);
  await service.recordPracticeResult(page,{evidence:[draft(false,'2026-09-29T10:00:05Z')]},session); // identical except timestamp
  await service.recordPracticeResult(page,{evidence:[draft(true,'2026-09-29T10:00:09Z')]},session);
  const evidence=await service.storage.listEvidence();
  assert.equal((await service.storage.listAttempts()).length,1);
  assert.deepEqual(evidence.map(e=>e.achieved).sort(),[false,true]);
});

test('a session cannot be reused for another activity',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p0-session-guard');
  const page=await client.loadPractice('practice.calculation.7.5');
  const session=service.beginPracticeSession(page);
  await assert.rejects(()=>service.recordPracticeResult({...page,id:'practice.trainer.7.4'},{evidence:[]},session),/PRACTICE_SESSION_ACTIVITY_MISMATCH/);
});

test('the browser practice route records through a per-page attempt session',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'src/app/bootstrap.ts'),'utf8');
  // P1.0: the per-page session is opened with the engine and every command goes through it
  // (the behavioural contract "N commands = 1 attempt" is tested in tests/p1-orchestrator-contract.test.mjs).
  assert.match(bootstrap,/const attemptSession=progressService\.beginPracticeSession\(page,new ReferencePracticeSession\(page\)\);/);
  assert.match(bootstrap,/progressService\.applyPracticeCommand\(attemptSession,command\)/);
});
