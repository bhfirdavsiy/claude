import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
// P1.1 (D8): `configFamily` (a routing key guessed at runtime) was replaced by the compiled ActivityExecutionPlan;
// the same invariant — which config source executes the activity — is asserted on plan.configSource.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
const fetchImpl=async(url)=>{const u=String(url);if(u==='/content/manifest.json')return response(active);const prefix=`/content/${active.activeVersion}/`;if(!u.startsWith(prefix))return response({},404);const file=path.join(packRoot,u.slice(prefix.length));if(!fs.existsSync(file))return response({},404);return rawResponse(fs.readFileSync(file,'utf8'));};
const client=()=>new ContentClient({fetchImpl,baseUrl:'/content'});const now=()=> '2026-09-15T00:00:00.000Z';
const organic=JSON.parse(fs.readFileSync(path.join(packRoot,'activity-configs/beta2-organic.json'),'utf8'));

test('all 17 organic configs are loadable through student ContentClient',async()=>{
 assert.equal(Object.keys(organic).length,17);
 for(const id of Object.keys(organic)){const model=await client().loadPractice(id);assert.equal(model.executionPlan.configSource,'beta2-organic',id);assert.ok(model.chemistry.organic,id);}
});

test('organic isomerism simulation exposes the derived field and emits successful construction evidence',async()=>{
 const model=await client().loadPractice('practice.simulation.10.04.isomerism');const ui=buildPracticeUiModel(model);
 assert.equal(ui.kind,'simulation');assert.equal(ui.mode,'generic');assert.deepEqual(ui.controls.map(x=>x.field),['isomerCount']);
 const session=new ReferencePracticeSession(model,{now});const result=await session.apply({kind:'simulation-action',action:{field:'isomerCount',value:2}});
 assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved));
});

test('organic nomenclature trainer derives answer from Organic Knowledge Base',async()=>{
 const model=await client().loadPractice('practice.trainer.10.07.planned');const ui=buildPracticeUiModel(model);assert.equal(ui.kind,'trainer');
 const session=new ReferencePracticeSession(model,{now});const result=await session.apply({kind:'trainer-answer',answer:'butane'});
 assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('organic qualitative experiment exposes authored action sequence and curated observation',async()=>{
 const model=await client().loadPractice('practice.experiment.10.5');const ui=buildPracticeUiModel(model);assert.equal(ui.kind,'experiment');assert.deepEqual(ui.controls.map(x=>x.action),['prepareCuOH2','addGlycerol','record']);
 const session=new ReferencePracticeSession(model,{now});await session.apply({kind:'experiment-action',action:{type:'prepareCuOH2'}});await session.apply({kind:'experiment-action',action:{type:'addGlycerol'}});const result=await session.apply({kind:'experiment-action',action:{type:'record'}});
 assert.ok(result.evidence.some(e=>e.type==='observation'&&e.observation.to==='deep-blue-solution'));
});
