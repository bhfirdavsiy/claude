// P1.1 — D8 canonical activity routing: content → ActivityExecutionPlan → runtime → engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileExecutionPlans,deriveActivityExecutionPlan,resolveExecutionPlan,CONFIG_SOURCE_NAMES,EXECUTION_PLAN_SCHEMA} from '../src/runtime/practice-router/execution-plan.ts';
import {PracticeRouter} from '../src/runtime/practice-router/router.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const src=path.join(root,'content-src');
const activities=JSON.parse(fs.readFileSync(path.join(src,'practice-activities.json'),'utf8'));
const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,JSON.parse(fs.readFileSync(path.join(src,'activity-configs',`${n}.json`),'utf8'))]));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const packPlans=JSON.parse(fs.readFileSync(path.join(pack,'execution-plans.json'),'utf8'));

test('every activity of the current content resolves to exactly one plan; released ones all have a route',()=>{
  const {pack:compiled,report,fatal}=compileExecutionPlans(activities,configs);
  assert.deepEqual(fatal,[]);
  assert.deepEqual(compiled,packPlans,'the shipped plans are exactly the compiled ones');
  assert.equal(report.total,activities.length);
  assert.equal(report.ready+report.pending+report.disabled,report.total);
  const ids=compiled.plans.map(p=>p.activityId);
  assert.equal(new Set(ids).size,ids.length,'no activity has two plans');
  for(const a of activities.filter(x=>x.lifecycleStatus==='ready')) assert.equal(ids.filter(id=>id===a.id).length,1,a.id);
  // the only unrouted activity today is unreleased and is reported as disabled, not guessed
  assert.deepEqual(report.errors.map(e=>[e.activityId,e.code]),[['practice.simulation.10.4','ROUTE_NONE']]);
});

const activity={id:'practice.x',type:'trainer',lifecycleStatus:'ready'};
const code=(r)=>r.ok?'OK':r.error.code;

test('conflict: an activity declared by two config sources is an error, never "first match"',()=>{
  const r=deriveActivityExecutionPlan(activity,{beta1:{'practice.x':{type:'trainer',version:'1'}},'beta2-safe':{'practice.x':{type:'trainer',version:'1'}}});
  assert.equal(code(r),'ROUTE_CONFLICT');
  const {fatal}=compileExecutionPlans([activity],{beta1:{'practice.x':{type:'trainer',version:'1'}},'beta2-safe':{'practice.x':{type:'trainer',version:'1'}}});
  assert.equal(fatal[0].code,'ROUTE_CONFLICT');
});

test('type and config disagree → validation FAIL (the two legacy keys may never contradict)',()=>{
  assert.equal(code(deriveActivityExecutionPlan(activity,{beta1:{'practice.x':{type:'simulation',version:'1'}}})),'CONFIG_ENGINE_MISMATCH');
  assert.equal(code(deriveActivityExecutionPlan(activity,{'beta2-advanced':{'practice.x':{type:'trainer',version:'1',capability:'hydrolysis-experiment'}}})),'CONFIG_ENGINE_MISMATCH');
  assert.equal(code(deriveActivityExecutionPlan({...activity,type:'case'},{'beta3-advanced':{'practice.x':{type:'case',version:'1',task:'x'}}})),'CONFIG_ENGINE_MISMATCH');
});

test('unknown engine / unknown capability fail closed',()=>{
  assert.equal(code(deriveActivityExecutionPlan({...activity,type:'hologram'},{beta1:{'practice.x':{type:'hologram',version:'1'}}})),'ENGINE_UNKNOWN');
  assert.equal(code(deriveActivityExecutionPlan(activity,{'beta2-advanced':{'practice.x':{type:'trainer',version:'1',capability:'teleport'}}})),'CAPABILITY_UNKNOWN');
  assert.equal(code(deriveActivityExecutionPlan(activity,{'beta2-organic':{'practice.x':{type:'trainer',version:'1',capability:'teleport'}}})),'CAPABILITY_UNKNOWN');
  assert.equal(code(deriveActivityExecutionPlan(activity,{'beta3-advanced':{'practice.x':{type:'trainer',version:'1',task:'teleport'}}})),'CAPABILITY_UNKNOWN');
  assert.equal(code(deriveActivityExecutionPlan(activity,{beta1:{'practice.x':{type:'trainer',version:'1',capability:'anything'}}})),'CAPABILITY_UNKNOWN');
  assert.equal(code(deriveActivityExecutionPlan(activity,{'reference-slices':{'practice.x':{type:'trainer',version:'1',sliceId:'nope'}}})),'CAPABILITY_UNKNOWN');
});

test('no route: fatal for a released activity, reported as disabled for an unreleased one',()=>{
  assert.equal(compileExecutionPlans([activity],{}).fatal[0].code,'ROUTE_NONE');
  const planned=compileExecutionPlans([{...activity,lifecycleStatus:'planned'}],{});
  assert.deepEqual([planned.fatal.length,planned.report.disabled],[0,1]);
  assert.equal(compileExecutionPlans([activity],{beta1:{'practice.ghost':{type:'trainer',version:'1'}}}).fatal.some(e=>e.activityId==='practice.ghost'),true,'config for an unknown activity is an error');
});

test('runtime lookup never guesses: missing, duplicated or inconsistent plans fail closed',()=>{
  const plan={activityId:'practice.x',engine:'trainer',runtime:'generic',capability:'generic.trainer',configSource:'beta1',configVersion:'1'};
  const pk=(plans)=>({schema:EXECUTION_PLAN_SCHEMA,plans});
  assert.deepEqual(resolveExecutionPlan(pk([plan]),'practice.x'),plan);
  assert.throws(()=>resolveExecutionPlan(pk([]),'practice.x'),/EXECUTION_PLAN_NOT_FOUND/);
  assert.throws(()=>resolveExecutionPlan(pk([plan,plan]),'practice.x'),/EXECUTION_PLAN_CONFLICT/);
  assert.throws(()=>resolveExecutionPlan(pk([{...plan,runtime:'beta2-organic'}]),'practice.x'),/EXECUTION_PLAN_INVALID/);
  assert.throws(()=>resolveExecutionPlan(pk([{...plan,engine:'hologram'}]),'practice.x'),/EXECUTION_PLAN_INVALID/);
  assert.throws(()=>resolveExecutionPlan({plans:[plan]},'practice.x'),/EXECUTION_PLAN_PACK_INVALID/);
});

test('PracticeRouter refuses an activity its plan does not describe',async()=>{
  const router=new PracticeRouter(); router.register('trainer',{run:async()=>({evidence:[]})});
  const a={id:'practice.x',type:'trainer',lifecycleStatus:'ready'};
  assert.equal((await router.run(a,{},{activityId:'practice.x',engine:'trainer'})).ok,true);
  assert.equal((await router.run(a,{},{activityId:'practice.y',engine:'trainer'})).error.code,'EXECUTION_PLAN_MISMATCH');
  assert.equal((await router.run(a,{},{activityId:'practice.x',engine:'case'})).error.code,'EXECUTION_PLAN_MISMATCH');
});

// Real content through the real client: one activity per runtime.
const fetchImpl=async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};const t=fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8');return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};

test('the browser path executes exactly the compiled plan for every runtime; a tampered plan fails closed',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const byRuntime=new Map();
  for(const p of packPlans.plans){const a=activities.find(x=>x.id===p.activityId);if(a.lifecycleStatus==='ready'&&!byRuntime.has(p.runtime))byRuntime.set(p.runtime,p);}
  assert.deepEqual([...byRuntime.keys()].sort(),['beta2-advanced','beta2-organic','beta3-advanced','generic','reference-slice']);
  for(const plan of byRuntime.values()){
    const model=await client.loadPractice(plan.activityId);
    assert.deepEqual(model.executionPlan,plan);
    assert.doesNotThrow(()=>new ReferencePracticeSession(model),plan.activityId);
    assert.throws(()=>new ReferencePracticeSession({...model,executionPlan:{...plan,runtime:'mystery'}}),/EXECUTION_RUNTIME_UNKNOWN/);
    assert.throws(()=>new ReferencePracticeSession({...model,executionPlan:{...plan,engine:plan.engine==='case'?'trainer':'case'}}),/EXECUTION_PLAN_ACTIVITY_MISMATCH/);
  }
});

test('the legacy second routing key cannot return (architecture guard)',()=>{
  assert.deepEqual(checkSource('src/features/practice/session.ts',"if(model.configFamily==='guided'){}").map(v=>v.rule),['LEGACY_ROUTING_KEY']);
  assert.deepEqual(checkSource('src/app/content-client.ts',"return build({configFamily});").map(v=>v.rule),['LEGACY_ROUTING_KEY']);
});
