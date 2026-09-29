import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {electronConfiguration} from '../src/domain/chemistry/electron-configuration.ts';
import {faradayMass} from '../src/domain/chemistry/faraday-model.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
const fetchImpl=async(url)=>{
  const u=String(url);
  if(u==='/content/manifest.json')return response(active);
  const prefix=`/content/${active.activeVersion}/`;
  if(!u.startsWith(prefix))return response({},404);
  const file=path.join(packRoot,u.slice(prefix.length));
  if(!fs.existsSync(file))return response({},404);
  return rawResponse(fs.readFileSync(file,'utf8'));
};
const client=()=>new ContentClient({fetchImpl,baseUrl:'/content'});
const now=()=> '2026-09-15T00:00:00.000Z';
const safe=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/beta3-safe.json'),'utf8'));
const advanced=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/beta3-advanced.json'),'utf8'));

test('all 22 Beta3 configs are loadable through student ContentClient with explicit families',async()=>{
  assert.equal(Object.keys(safe).length+Object.keys(advanced).length,22);
  for(const id of Object.keys(safe)){
    const model=await client().loadPractice(id);
    assert.equal(model.configFamily,'beta3',id);
  }
  for(const id of Object.keys(advanced)){
    const model=await client().loadPractice(id);
    assert.equal(model.configFamily,'beta3-advanced',id);
  }
});

test('Beta3 electron configuration simulation exposes authored field and derives evidence',async()=>{
  const model=await client().loadPractice('practice.simulation.11.01.planned');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'simulation');
  assert.equal(ui.mode,'generic');
  assert.deepEqual(ui.controls.map(x=>x.field),['configuration']);
  const session=new ReferencePracticeSession(model,{now});
  const result=await session.apply({kind:'simulation-action',action:{field:'configuration',value:electronConfiguration(11)}});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved===true));
});

test('Beta3 ionic trainer uses bounded chemistry data in browser session',async()=>{
  const model=await client().loadPractice('practice.trainer.11.10.planned');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'trainer');
  const session=new ReferencePracticeSession(model,{now});
  const result=await session.apply({kind:'trainer-answer',answer:'Ag+ + Cl- → AgCl(s)'});
  assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct===true));
});

test('Beta3 electrolysis experiment and Faraday calculation are executable in browser model',async()=>{
  const electroModel=await client().loadPractice('practice.experiment.11.2');
  const electroUi=buildPracticeUiModel(electroModel);
  assert.equal(electroUi.kind,'experiment');
  assert.deepEqual(electroUi.controls.map(x=>x.action),['connectCurrent','observeCathode','observeAnode']);
  const electroSession=new ReferencePracticeSession(electroModel,{now});
  await electroSession.apply({kind:'experiment-action',action:{type:'connectCurrent'}});
  await electroSession.apply({kind:'experiment-action',action:{type:'observeCathode'}});
  const electroResult=await electroSession.apply({kind:'experiment-action',action:{type:'observeAnode'}});
  assert.ok(electroResult.evidence.some(e=>e.type==='observation'));

  const faradayModel=await client().loadPractice('practice.calculation.11.22.planned');
  const faradayUi=buildPracticeUiModel(faradayModel);
  assert.equal(faradayUi.kind,'calculation');
  assert.deepEqual(faradayUi.steps.map(x=>x.id),['mass']);
  const faradaySession=new ReferencePracticeSession(faradayModel,{now});
  const value=faradayMass({molarMassGPerMol:63.546,currentA:2,timeS:965,electronNumber:2});
  const faradayResult=await faradaySession.apply({kind:'calculation-response',response:{stepId:'mass',value,unit:'g'}});
  assert.ok(faradayResult.evidence.some(e=>e.type==='calculation'&&e.score===1&&e.stepId==='mass'));
  assert.ok(faradayResult.outcomes.some(o=>o.status==='accepted'));
});
