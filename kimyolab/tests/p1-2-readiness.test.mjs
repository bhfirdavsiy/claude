// P1.2 — canonical readiness (LearningActivityReadiness), C4 launch gate and the learning:readiness gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveActivityReadiness,launchDecision,readinessMessage,READINESS_MESSAGES} from '../src/domain/readiness/readiness.ts';
import {ContentClient,contentErrorMessage} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {PracticeRouter} from '../src/runtime/practice-router/router.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {loadSources,evaluateLearningReadiness,buildReports} from '../scripts/learning-readiness.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packDir=path.join(root,'public/content',pointer.activeVersion);
const shipped=JSON.parse(fs.readFileSync(path.join(packDir,'activity-readiness.json'),'utf8'));
const RAW_CODE=/\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;

test('derivation: READY / PENDING / DISABLED / BLOCKED with reasons; review pending is reported, not launch-deciding',()=>{
  const r=(lifecycleStatus,route,reviewPending=[])=>deriveActivityReadiness({id:'a',lifecycleStatus,reviewPending},route,'strict');
  assert.equal(r('ready',{ok:true}).runtime,'READY');
  assert.deepEqual(r('planned',{ok:true}).reasons,['ACTIVITY_NOT_RELEASED']);
  assert.equal(r('planned',{ok:true}).runtime,'PENDING');
  assert.equal(r('planned',{ok:false,code:'ROUTE_NONE'}).runtime,'DISABLED');
  assert.equal(r('ready',{ok:false,code:'ROUTE_NONE'}).runtime,'BLOCKED','a released activity without a route is an inconsistency');
  assert.equal(r('ready',{ok:false,code:'ROUTE_CONFLICT'}).runtime,'BLOCKED');
  const reviewed=r('ready',{ok:true},['didactic','chemistry']);
  assert.equal(reviewed.runtime,'READY');
  assert.deepEqual(reviewed.reasons,['ACTIVITY_REVIEW_PENDING','CHEMISTRY_REVIEW_REQUIRED']);
  assert.equal(reviewed.content,'REVIEW_PENDING','runtime READY does not mean approved by people');
});

test('launch gate is fail-closed: strict launches only READY; observe keeps legacy PENDING; DISABLED/BLOCKED/unknown never',()=>{
  const base={activityId:'a',reasons:[],content:'REVIEW_PENDING'};
  assert.equal(launchDecision({...base,runtime:'READY',enforcement:'strict'}).allowed,true);
  assert.equal(launchDecision({...base,runtime:'PENDING',enforcement:'strict'}).allowed,false);
  assert.equal(launchDecision({...base,runtime:'PENDING',enforcement:'observe'}).allowed,true);
  for(const runtime of ['DISABLED','BLOCKED']) for(const enforcement of ['strict','observe']) assert.equal(launchDecision({...base,runtime,enforcement}).allowed,false,`${runtime}/${enforcement}`);
  assert.equal(launchDecision(undefined).allowed,false);
});

test('every reason has a localized learner-facing message; raw codes never leak',()=>{
  for(const [code,text] of Object.entries(READINESS_MESSAGES)){assert.ok(text.length>10,code);assert.doesNotMatch(text,RAW_CODE,code);}
  assert.equal(readinessMessage([]),READINESS_MESSAGES.ROUTE_INVALID);
  assert.equal(readinessMessage(['ACTIVITY_REVIEW_PENDING','ASSESSMENT_REVIEW_PENDING']),READINESS_MESSAGES.ASSESSMENT_REVIEW_PENDING);
});

// ------------------------------------------------------------------ all 146 activities

test('regression over all 146 activities: READY → accessible, PENDING → not strict-launched, DISABLED → never launched',async()=>{
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  assert.equal(shipped.activities.length,146);
  for(const r of shipped.activities){
    const strict={...r,enforcement:'strict'};
    if(r.runtime==='READY'){
      assert.equal(launchDecision(strict).allowed,true,r.activityId);
      const model=await client.loadPractice(r.activityId);
      assert.equal(model.readiness.runtime,'READY');
      assert.doesNotThrow(()=>new ReferencePracticeSession(model),r.activityId);
    }else if(r.runtime==='PENDING'){
      assert.equal(launchDecision(strict).allowed,false,r.activityId);
    }else{
      assert.equal(launchDecision(strict).allowed,false,r.activityId);
      assert.equal(launchDecision(r).allowed,false,r.activityId);
      await assert.rejects(client.loadPractice(r.activityId),/ACTIVITY_NOT_AVAILABLE/,r.activityId);
    }
  }
  // the pilot's strict activities are all READY; nothing outside the pilot is strict
  const strict=shipped.activities.filter(a=>a.enforcement==='strict');
  assert.deepEqual(strict.map(a=>a.runtime),strict.map(()=>'READY'));
  assert.equal(strict.length,4);
});

test('a PENDING activity under strict enforcement is refused at every layer with a localized reason',async()=>{
  const pending=shipped.activities.find(a=>a.runtime==='PENDING');
  const fetchImpl=memoryPackFetch({'activity-readiness.json':(p)=>({...p,activities:p.activities.map(a=>a.activityId===pending.activityId?{...a,enforcement:'strict'}:a)})});
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const error=await client.loadPractice(pending.activityId).catch(e=>e);
  assert.equal(error.code,'ACTIVITY_NOT_AVAILABLE');
  const text=contentErrorMessage(error,'fallback');
  assert.equal(text,READINESS_MESSAGES.ACTIVITY_NOT_RELEASED);
  assert.doesNotMatch(text,RAW_CODE);
  // defence in depth: a model that reached the session anyway is refused, and so is the router
  const observeClient=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const model=await observeClient.loadPractice(pending.activityId);
  assert.throws(()=>new ReferencePracticeSession({...model,readiness:{...model.readiness,enforcement:'strict'}}),/ACTIVITY_NOT_AVAILABLE/);
  const router=new PracticeRouter(); router.register(model.type,{run:async()=>({evidence:[]})});
  const activity={id:model.id,type:model.type,lifecycleStatus:'ready'};
  assert.equal((await router.run(activity,{},undefined,{...model.readiness,enforcement:'strict'})).error.code,'ACTIVITY_NOT_READY','a synthesized lifecycle cannot override readiness');
  assert.equal((await router.run(activity,{},undefined,{...model.readiness,activityId:'other'})).error.code,'ACTIVITY_NOT_READY');
});

test('learning hub: a refused supporting activity has no launch link, only a localized reason',async()=>{
  const unit=JSON.parse(fs.readFileSync(path.join(root,'content-src/mapping-links.json'),'utf8')).find(m=>m.role==='supporting'&&shipped.activities.find(a=>a.activityId===m.practiceActivityId)?.runtime==='PENDING');
  const fetchImpl=memoryPackFetch({'activity-readiness.json':(p)=>({...p,activities:p.activities.map(a=>a.activityId===unit.practiceActivityId?{...a,enforcement:'strict'}:a)})});
  const hub=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadLearningHub(unit.learningUnitId);
  const card=hub.supportingPractices.find(p=>p.id===unit.practiceActivityId);
  assert.equal(card.launchable,false);
  assert.equal(card.unavailableMessage,READINESS_MESSAGES.ACTIVITY_NOT_RELEASED);
  assert.equal(hub.primaryPractice.launchable,true);
});

// ------------------------------------------------------------------ learning:readiness gate

test('the gate passes on the current content and the shipped pack is exactly the compiled one',()=>{
  const r=evaluateLearningReadiness(loadSources(),shipped);
  assert.deepEqual(r.fatal,[]);
  const reports=buildReports(loadSources(),r);
  assert.equal(reports.impact.activities.total,146);
  assert.equal(reports.impact.globalStrictEnforcement.enabled,false);
  assert.ok(reports.impact.globalStrictEnforcement.wouldBlockCurrentlyLaunchable.length>0,'impact analysis shows why global enforcement stays off');
  assert.deepEqual(reports.mastery.pilotLU.sort(),['lu.7.07','lu.7.11','lu.7.12','lu.9.15']);
  assert.equal(reports.assessment.itemsWithOutcomeMapping,5);
  assert.equal(reports.assessment.approvedItems,0,'nothing was approved without a human');
});

test('the gate separates FATAL inconsistencies from known pending content',()=>{
  const fresh=()=>structuredClone(loadSources());
  // a bank that claims approval without a human review record
  const claimed=fresh(); claimed.bank.items[0].review={chemistry:'approved',didactic:'approved'};
  assert.ok(evaluateLearningReadiness(claimed).fatal.some(f=>f.startsWith('ASSESSMENT_APPROVAL_WITHOUT_REVIEW_RECORD:q.9.15.01')));
  // a concept outside the unit
  const foreign=fresh(); foreign.bank.items[0].conceptIds=['concept.c001'];
  assert.ok(evaluateLearningReadiness(foreign).fatal.some(f=>f.startsWith('ASSESSMENT_CONCEPT_NOT_IN_UNIT')));
  // an unknown pilot unit / a pilot unit whose primary practice is not ready
  const pilot=fresh(); pilot.pilot.learningUnits.push({id:'lu.9.999'});
  assert.ok(evaluateLearningReadiness(pilot).fatal.includes('PILOT_UNIT_UNKNOWN:lu.9.999'));
  const notReady=fresh(); notReady.activities.find(a=>a.id==='practice.trainer.7.4').lifecycleStatus='planned';
  assert.ok(evaluateLearningReadiness(notReady).fatal.includes('PILOT_PRIMARY_NOT_READY:lu.7.11'));
  // stale shipped pack
  assert.ok(evaluateLearningReadiness(fresh(),{...shipped,pilotLearningUnitIds:[]}).fatal.some(f=>f.startsWith('READINESS_PACK_STALE')));
  // known pending content: warnings, never fatal
  const pending=fresh(); delete pending.bank.items[0].outcomeIds;
  const result=evaluateLearningReadiness(pending);
  assert.deepEqual(result.fatal,[]);
  assert.ok(result.warnings.includes('OUTCOME_MAPPING_MISSING:q.9.15.01'));
});
