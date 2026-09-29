// P1.1 kill-critic #10 — no regression over the existing content: every LearningUnit still builds its hub,
// and every released practice activity still loads through its compiled plan and constructs its engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const cache=new Map();
const fetchImpl=async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>pointer};if(!cache.has(u))cache.set(u,fs.readFileSync(path.join(pack,u.slice(`/content/${pointer.activeVersion}/`.length)),'utf8'));const t=cache.get(u);return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t)};};
const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
const activities=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));

test('all 122 learning units still build their learning hub (prompt-only assessment model)',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  assert.equal(units.length,122);
  for(const unit of units){
    const hub=await client.loadLearningHub(unit.id);
    assert.equal(hub.id,unit.id);
    assert.ok(Array.isArray(hub.assessment.items));
    assert.doesNotMatch(JSON.stringify(hub.assessment),/correctOptionId|explanation/);
  }
});

test('every released practice activity loads through exactly its plan and constructs its engine',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const ready=activities.filter(a=>a.lifecycleStatus==='ready');
  assert.ok(ready.length>=118);
  for(const a of ready){
    const model=await client.loadPractice(a.id);
    assert.equal(model.executionPlan.activityId,a.id);
    assert.equal(model.executionPlan.engine,a.type);
    assert.doesNotThrow(()=>new ReferencePracticeSession(model),a.id);
  }
});
