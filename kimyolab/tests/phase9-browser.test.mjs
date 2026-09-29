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

test('student ContentClient loads audited Beta2 safe practice configs',async()=>{
  const model=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice('practice.simulation.9.02.planned');
  assert.equal(model.configFamily,'beta2');
  const ui=buildPracticeUiModel(model);
  assert.equal(ui.kind,'simulation');
  assert.equal(ui.mode,'generic');
  const session=new ReferencePracticeSession(model,{now:()=> '2026-09-15T00:00:00.000Z'});
  await session.apply({kind:'simulation-action',action:{field:'sample',value:'NaCl(aq)'}});
  const result=await session.apply({kind:'simulation-action',action:{field:'conductivity',value:'high'}});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved));
});
