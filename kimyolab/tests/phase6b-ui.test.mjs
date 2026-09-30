import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {spawnServer,rawRequest} from './helpers/dist.mjs';
// Servers are started against a hermetically built dist (the only public surface).
let current;
async function startServer(){current=await spawnServer();return current;}
function request(url){return rawRequest(current.url,url);}
async function stop(server){await server.stop();}

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
const fetchImpl=async(url)=>{const u=String(url);if(u==='/content/manifest.json')return response(active);const prefix=`/content/${active.activeVersion}/`;if(!u.startsWith(prefix))return response({},404);const file=path.join(packRoot,u.slice(prefix.length));if(!fs.existsSync(file))return response({},404);return rawResponse(fs.readFileSync(file,'utf8'));};
async function load(id){return new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice(id);}


test('practice UI model exposes type-specific student controls without engine metadata',async()=>{
  const sim7=await load('practice.simulation.7.07.planned');
  const experiment=buildPracticeUiModel(await load('practice.experiment.7.2'));
  assert.equal(experiment.kind,'experiment');
  assert.deepEqual(experiment.controls.map(x=>x.action),['selectApparatus','addWater','addMixture','mix','filter','evaporate','observe']);
  // P1.4: the atom builder is drawn by the RendererRegistry (rendererRequirement atom-builder@^1); its legacy
  // 'atom' UI model computed the goal label (element-(p+n)) in the presentation layer, so it was removed and
  // the legacy model now refuses the activity instead of silently drawing a generic form.
  assert.throws(()=>buildPracticeUiModel(sim7),/RENDERER_REQUIRED/);
  const sim=buildPracticeUiModel(await load('practice.simulation.9.01.planned'));
  assert.equal(sim.kind,'simulation');
  const trainer=buildPracticeUiModel(await load('practice.trainer.7.4'));
  assert.equal(trainer.expectedInput,'formula');
  const calc=buildPracticeUiModel(await load('practice.calculation.7.5'));
  assert.deepEqual(calc.steps.map(x=>x.id),['h-contribution','s-contribution','o-contribution','total']);
  const c=buildPracticeUiModel(await load('practice.case.7.14'));
  assert.equal(c.evidenceOptions.length,3);
  for(const model of [experiment,sim,trainer,calc,c]) assert.doesNotMatch(JSON.stringify(model),/approvals|lifecycleStatus|reactionId|scoringVersion|schemaVersion/);
});

test('development server serves app shell for canonical practice deep links',async()=>{
  let child;try{child=await startServer();const res=await request('/practice/practice.experiment.7.2');assert.equal(res.status,200);assert.match(res.body,/id="app-main"/);}finally{if(child)await stop(child);}
});

test('practice renderer is semantic and bootstrap owns internal practice navigation',()=>{
  const render=fs.readFileSync(path.join(root,'src/features/practice/render.ts'),'utf8');
  assert.match(render,/fieldset|createElement|el\('button'/);
  assert.match(render,/aria-live|role:'status'/);
  assert.doesNotMatch(render,/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
  const bootstrap=fs.readFileSync(path.join(root,'src/app/bootstrap.ts'),'utf8');
  assert.match(bootstrap,/route\.name==='practice'/);
  assert.match(bootstrap,/ReferencePracticeSession/);
  assert.doesNotMatch(bootstrap,/pathname\.startsWith\('\/practice\/'\)\) return/);
});
