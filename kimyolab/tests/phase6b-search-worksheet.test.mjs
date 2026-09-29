import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {parseAppRoute} from '../src/app/routes.ts';
import {searchStudentContent} from '../src/features/search/model.ts';
import {buildWorksheetModel} from '../src/features/worksheet/model.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
const fetchImpl=async(url)=>{const u=String(url);if(u==='/content/manifest.json')return response(active);const prefix=`/content/${active.activeVersion}/`;if(!u.startsWith(prefix))return response({},404);const file=path.join(packRoot,u.slice(prefix.length));if(!fs.existsSync(file))return response({},404);return response(JSON.parse(fs.readFileSync(file,'utf8')));};

test('worksheet route is canonical and deep-linkable',()=>{
  assert.deepEqual(parseAppRoute('/worksheet/lu.7.07'),{name:'worksheet',learningUnitId:'lu.7.07'});
});

test('student search finds learning units and activities without technical metadata',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const index=await client.loadSearchIndex();
  const results=searchStudentContent('atom',index);
  assert.ok(results.some(x=>x.href==='/learn/lu.7.07/guide'));
  assert.ok(results.every(x=>x.title&&!/coverageStatus|lifecycleStatus|legacyIds/.test(JSON.stringify(x))));
  assert.ok(results.length<=20);
});

test('worksheet model is derived from the current Learning Hub and version-stamped',async()=>{
  const client=new ContentClient({fetchImpl,baseUrl:'/content'});
  const hub=await client.loadLearningHub('lu.7.07');
  const worksheet=buildWorksheetModel(hub,{contentVersion:active.activeVersion,assessmentVersion:'0.0.0'});
  assert.equal(worksheet.learningUnitId,'lu.7.07');
  assert.equal(worksheet.title,hub.title);
  assert.equal(worksheet.contentVersion,active.activeVersion);
  assert.ok(worksheet.sections.some(x=>x.kind==='prediction'));
  assert.ok(worksheet.sections.some(x=>x.kind==='observation'));
  assert.ok(worksheet.sections.some(x=>x.kind==='explanation'));
});

test('search and worksheet renderers are wired into bootstrap and print styles are declared',()=>{
  const bootstrap=fs.readFileSync(path.join(root,'src/app/bootstrap.ts'),'utf8');
  assert.match(bootstrap,/renderSearch/);
  assert.match(bootstrap,/renderWorksheet/);
  assert.doesNotMatch(bootstrap,/Qidiruv sahifasi keyingi UI paketida ulanadi/);
  const worksheetRender=fs.readFileSync(path.join(root,'src/features/worksheet/render.ts'),'utf8');
  assert.match(worksheetRender,/window\.print/);
  assert.doesNotMatch(worksheetRender,/\.innerHTML\s*=/);
  const css=fs.readFileSync(path.join(root,'src/ui/tokens/kimyolab.css'),'utf8');
  assert.match(css,/@media print/);
});
