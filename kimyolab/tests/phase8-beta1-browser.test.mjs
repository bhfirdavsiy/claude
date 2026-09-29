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
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
const fetchImpl=async(url)=>{const u=String(url);if(u==='/content/manifest.json')return response(active);const prefix=`/content/${active.activeVersion}/`;if(!u.startsWith(prefix))return response({},404);const file=path.join(packRoot,u.slice(prefix.length));if(!fs.existsSync(file))return response({},404);return rawResponse(fs.readFileSync(file,'utf8'));};

test('student ContentClient and practice session support Beta1 generic activity configs',async()=>{
  const model=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice('practice.trainer.8.01.planned');
  assert.equal(model.id,'practice.trainer.8.01.planned');
  assert.equal(model.type,'trainer');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'trainer');
  assert.match(ui.prompt,/NaOH/);
  const session=new ReferencePracticeSession(model,{now:()=> '2026-09-15T00:00:00.000Z'});
  const result=await session.apply({kind:'trainer-answer',answer:'asos'});
  assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('Beta1 generic experiment exposes authored procedural labels and runs in browser session',async()=>{
  const model=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice('practice.experiment.7.6');
  assert.equal(model.configFamily,'beta1');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'experiment');
  assert.match(ui.controls[0].label,/100 ml suvni stakanga quying/);
  const session=new ReferencePracticeSession(model,{now:()=> '2026-09-15T00:00:00.000Z'});
  const result=await session.apply({kind:'experiment-action',action:{type:'step.1'}});
  assert.ok(result.evidence.some(e=>e.type==='procedure'&&e.accepted));
});

test('Beta1 generic simulation exposes generic controls without leaking target values',async()=>{
  const model=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice('practice.simulation.7.02.planned');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'simulation');
  assert.equal(ui.mode,'generic');
  assert.deepEqual(ui.controls.map(x=>x.field),['property','classification']);
  assert.equal(JSON.stringify(ui).includes('density'),false);
  assert.equal(JSON.stringify(ui).includes('physical'),false);
  const session=new ReferencePracticeSession(model,{now:()=> '2026-09-15T00:00:00.000Z'});
  await session.apply({kind:'simulation-action',action:{field:'property',value:'density'}});
  const result=await session.apply({kind:'simulation-action',action:{field:'classification',value:'physical'}});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved));
});

test('Beta1 generic calculation and case configs execute through student session',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const calc=await client.loadPractice('practice.calculation.7.09.planned');
  const calcUi=buildPracticeUiModel(calc);
  assert.equal(calcUi.kind,'calculation');
  assert.equal(calcUi.steps[0].id,'ratio-o-h');
  const calcSession=new ReferencePracticeSession(calc,{now:()=> '2026-09-15T00:00:00.000Z'});
  const calcResult=await calcSession.apply({kind:'calculation-response',response:{stepId:'ratio-o-h',value:16,unit:'ratio'}});
  assert.ok(calcResult.evidence.some(e=>e.type==='calculation'&&e.score===1));

  const caze=await client.loadPractice('practice.case.7.01.planned');
  const caseSession=new ReferencePracticeSession(caze,{now:()=> '2026-09-15T00:00:00.000Z'});
  const caseResult=await caseSession.apply({kind:'case-submit',value:{
    evidenceIds:['water-treatment','medicine'],
    decision:'chemistry',
    justification:'because substance reaction evidence',
    reflection:'evidence',
  }});
  assert.ok(caseResult.evidence.some(e=>e.type==='decision'));
});
