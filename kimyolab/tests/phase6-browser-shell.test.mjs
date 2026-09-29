import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function startServer(){
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});
  let output=''; child.stdout.on('data',c=>output+=c); child.stderr.on('data',c=>output+=c);
  const deadline=Date.now()+5000;
  while(!output.includes('http://127.0.0.1:4173')){
    if(child.exitCode!==null) throw new Error(`server exited: ${output}`);
    if(Date.now()>deadline){child.kill('SIGTERM');throw new Error(`timeout: ${output}`);}
    await new Promise(r=>setTimeout(r,25));
  }
  return child;
}
function request(url){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:4173,path:url},res=>{let body='';res.setEncoding('utf8');res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);req.end();});}
async function stop(child){if(child.exitCode!==null)return;child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1000))]);if(child.exitCode===null)child.kill('SIGKILL');}

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
