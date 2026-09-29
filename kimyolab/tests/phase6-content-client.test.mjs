import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ContentClient, ContentLoadError } from '../src/app/content-client.ts';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);

function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
function fakeFetch(){
  const calls=[];
  const fn=async(url)=>{
    calls.push(String(url));
    const u=String(url);
    if(u==='/content/manifest.json') return response(active);
    const prefix=`/content/${active.activeVersion}/`;
    if(!u.startsWith(prefix)) return response({message:'not found'},404);
    const rel=u.slice(prefix.length);
    const file=path.join(packRoot,rel);
    if(!fs.existsSync(file)) return response({message:'not found'},404);
    return response(JSON.parse(fs.readFileSync(file,'utf8')));
  };
  fn.calls=calls;
  return fn;
}

test('ContentClient loads a student Learning Hub from the active versioned content pack',async()=>{
  const fetchImpl=fakeFetch();
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const hub=await client.loadLearningHub('lu.7.03');
  assert.equal(hub.id,'lu.7.03');
  assert.equal(hub.primaryPractice.id,'practice.experiment.7.2');
  assert.ok(fetchImpl.calls.includes(`/content/${active.activeVersion}/learning-units/grade-7.json`));
  assert.ok(fetchImpl.calls.includes(`/content/${active.activeVersion}/mapping-links.json`));
});

test('ContentClient reports structured HTTP failures without leaking stack details',async()=>{
  const client=new ContentClient({fetchImpl:async()=>response({error:'x'},503),baseUrl:'/content'});
  await assert.rejects(()=>client.loadLearningHub('lu.7.03'),err=>{
    assert.ok(err instanceof ContentLoadError);
    assert.equal(err.code,'CONTENT_HTTP_ERROR');
    assert.equal(err.status,503);
    return true;
  });
});

test('ContentClient rejects malformed learning-unit IDs before network access',async()=>{
  let called=false;
  const client=new ContentClient({fetchImpl:async()=>{called=true;return response({});},baseUrl:'/content'});
  await assert.rejects(()=>client.loadLearningHub('topic-7-3'),/LEARNING_UNIT_ID_INVALID/);
  assert.equal(called,false);
});
