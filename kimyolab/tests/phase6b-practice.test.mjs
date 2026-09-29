import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAppRoute} from '../src/app/routes.ts';
import {ContentClient} from '../src/app/content-client.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
function fakeFetch(){
  return async(url)=>{
    const u=String(url);
    if(u==='/content/manifest.json') return response(active);
    const prefix=`/content/${active.activeVersion}/`;
    if(!u.startsWith(prefix)) return response({},404);
    const file=path.join(packRoot,u.slice(prefix.length));
    if(!fs.existsSync(file)) return response({},404);
    return rawResponse(fs.readFileSync(file,'utf8'));
  };
}

test('route parser resolves canonical practice deep links',()=>{
  assert.deepEqual(parseAppRoute('/practice/practice.experiment.7.2'),{name:'practice',practiceActivityId:'practice.experiment.7.2'});
  assert.deepEqual(parseAppRoute('/practice/practice.simulation.7.07.planned?x=1'),{name:'practice',practiceActivityId:'practice.simulation.7.07.planned'});
});

test('ContentClient loads a student-safe reference practice model with runtime config',async()=>{
  const client=new ContentClient({fetchImpl:fakeFetch(),baseUrl:'/content'});
  const model=await client.loadPractice('practice.experiment.7.2');
  assert.equal(model.id,'practice.experiment.7.2');
  assert.equal(model.type,'experiment');
  assert.equal(model.learningUnit.id,'lu.7.03');
  assert.equal(model.referenceConfig.sliceId,'slice.7.03.separation');
  assert.equal(model.contentVersion,active.activeVersion);
  const serialized=JSON.stringify(model);
  for(const forbidden of ['approvals','lifecycleStatus','legacyIds','coverageStatus','reviewedHash']) assert.equal(serialized.includes(forbidden),false,`practice model leaked ${forbidden}`);
});

test('reactive practice model includes only the chemistry datasets required by the real adapter',async()=>{
  const client=new ContentClient({fetchImpl:fakeFetch(),baseUrl:'/content'});
  const model=await client.loadPractice('practice.experiment.8.1');
  assert.equal(model.learningUnit.id,'lu.8.16');
  assert.equal(model.referenceConfig.reactionId,'rxn.agno3-nacl');
  assert.ok(model.chemistry.reactions.length>=1);
  assert.ok(model.chemistry.solutionRules.dissociation.length>=1);
});

test('ContentClient rejects non-reference or malformed practice IDs without exposing technical data',async()=>{
  const client=new ContentClient({fetchImpl:fakeFetch(),baseUrl:'/content'});
  await assert.rejects(()=>client.loadPractice('practice.invalid'),/PRACTICE_ACTIVITY_ID_INVALID/);
  await assert.rejects(()=>client.loadPractice('practice.case.7.01'),/PRACTICE_CONFIG_NOT_FOUND|PRACTICE_ACTIVITY_NOT_FOUND/);
});
