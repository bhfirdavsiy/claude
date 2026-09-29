import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnServer,rawRequest} from './helpers/dist.mjs';
// Servers are started against a hermetically built dist (the only public surface).
let current;
async function startServer(){current=await spawnServer();return current;}
function request(url){return rawRequest(current.url,url);}
async function stop(server){await server.stop();}

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));


test('student app shell is served for canonical /learn deep links and contains progressive hero content',async()=>{
  let child; try{
    child=await startServer();
    const res=await request('/learn/lu.7.03');
    assert.equal(res.status,200);
    assert.match(res.body,/Kimyo fanini tajribalar orqali o‘rganing/);
    assert.match(res.body,/<main[^>]+id="app-main"/);
    assert.doesNotMatch(res.body,/coverageStatus|lifecycleStatus|validationStatus|Excel mapping/);
  }finally{if(child)await stop(child);}
});

test('development server exposes Vite-compatible /content runtime path without exposing source',async()=>{
  let child; try{
    child=await startServer();
    const manifest=await request('/content/manifest.json');
    assert.equal(manifest.status,200);
    const parsed=JSON.parse(manifest.body);
    assert.match(parsed.activeVersion,/^2026\./);
    const source=await request('/content/../content-src/manifest.yaml');
    assert.notEqual(source.status,200);
  }finally{if(child)await stop(child);}
});

test('browser renderer source avoids unsafe innerHTML',()=>{
  const files=['src/app/bootstrap.ts','src/features/home/render.ts','src/features/learning-hub/render.ts'];
  for(const rel of files){
    const file=path.join(root,rel);
    assert.ok(fs.existsSync(file),`missing ${rel}`);
    const source=fs.readFileSync(file,'utf8');
    assert.doesNotMatch(source,/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
  }
});
