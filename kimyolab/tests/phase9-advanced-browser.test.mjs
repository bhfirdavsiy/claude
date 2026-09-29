import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
const fetchImpl=async(url)=>{
  const u=String(url);
  if(u==='/content/manifest.json')return response(active);
  const prefix=`/content/${active.activeVersion}/`;
  if(!u.startsWith(prefix))return response({},404);
  const file=path.join(packRoot,u.slice(prefix.length));
  if(!fs.existsSync(file))return response({},404);
  return response(JSON.parse(fs.readFileSync(file,'utf8')));
};
const client=()=>new ContentClient({fetchImpl,baseUrl:'/content'});
const now=()=> '2026-09-15T00:00:00.000Z';

test('advanced ionic trainer loads in browser model and derives the net ionic answer from chemistry data',async()=>{
  const model=await client().loadPractice('practice.trainer.9.05.planned');
  assert.equal(model.configFamily,'beta2-advanced');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'trainer');
  assert.match(ui.prompt,/AgNO3|AgNO₃/);
  const session=new ReferencePracticeSession(model,{now});
  const result=await session.apply({kind:'trainer-answer',answer:'Ag+ + Cl- → AgCl(s)'});
  assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct===true));
});

test('advanced hydrolysis experiment exposes bounded salt/medium controls and evidence',async()=>{
  const model=await client().loadPractice('practice.experiment.9.14');
  assert.equal(model.configFamily,'beta2-advanced');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'experiment');
  assert.deepEqual(ui.controls.map(x=>x.action),['selectSalt','addIndicator','recordMedium']);
  const session=new ReferencePracticeSession(model,{now});
  await session.apply({kind:'experiment-action',action:{type:'selectSalt',payload:{salt:'AlCl3'}}});
  await session.apply({kind:'experiment-action',action:{type:'addIndicator'}});
  const result=await session.apply({kind:'experiment-action',action:{type:'recordMedium',payload:{medium:'acidic'}}});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved===true));
});

test('advanced electrolysis experiment exposes electrode observation controls and bounded model evidence',async()=>{
  const model=await client().loadPractice('practice.experiment.9.10');
  assert.equal(model.configFamily,'beta2-advanced');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'experiment');
  assert.deepEqual(ui.controls.map(x=>x.action),['connectCurrent','observeCathode','observeAnode']);
  const session=new ReferencePracticeSession(model,{now});
  await session.apply({kind:'experiment-action',action:{type:'connectCurrent'}});
  await session.apply({kind:'experiment-action',action:{type:'observeCathode'}});
  const result=await session.apply({kind:'experiment-action',action:{type:'observeAnode'}});
  assert.ok(result.evidence.some(e=>e.type==='observation'));
});

test('advanced manganese simulation exposes medium control and reaches the target model',async()=>{
  const model=await client().loadPractice('practice.simulation.9.23.planned');
  assert.equal(model.configFamily,'beta2-advanced');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'simulation');
  assert.equal(ui.mode,'generic');
  assert.deepEqual(ui.controls.map(x=>x.field),['medium']);
  const session=new ReferencePracticeSession(model,{now});
  const result=await session.apply({kind:'simulation-action',action:{field:'medium',value:'acidic'}});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved===true));
});
