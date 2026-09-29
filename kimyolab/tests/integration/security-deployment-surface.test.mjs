// P0.1 / P0.14 — only the built deployment surface is reachable over HTTP (allow-list).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startServer,rawRequest,cloneDist,repoRoot} from '../helpers/dist.mjs';

let server, activeVersion;
test.before(async()=>{
  server=await startServer();
  activeVersion=JSON.parse(fs.readFileSync(path.join(repoRoot,'public/content/manifest.json'),'utf8')).activeVersion;
});
test.after(async()=>{await server.close();});

const blocked=[
  '/package.json','/package-lock.json','/server.mjs','/server/app.mjs','/tsconfig.json','/vite.config.ts','/README.md',
  '/scripts/lint.ts','/scripts/build-production.ts','/tests/security.test.mjs','/docs/','/reports/production-build.json',
  '/review-packets/','/content-src/concepts.json','/src/app/bootstrap.ts','/schemas/concept.schema.json','/config/nobook.env.example',
  '/source/KimyoLab_v20_nazariya_amaliyot_mapping.xlsx','/node_modules/ajv/package.json','/.git/config','/.gitignore',
  '/about-us1.html','/legacy-index.html','/app-preview/app/bootstrap.ts','/content/2025.01.1/manifest.json',
];
for(const url of blocked){
  test(`GET ${url} → 404`,async()=>{
    const r=await rawRequest(server.url,url);
    assert.equal(r.status,404,url);
    assert.doesNotMatch(r.body,/"devDependencies"|NOBOOK_APP_SECRET|import .* from/);
  });
}

const allowed=['/','/index.html','/curriculum','/learn/lu.7.01/guide','/practice/practice.trainer.7.01','/assets/home/results.png','/app-preview/app/bootstrap.js','/content/manifest.json'];
for(const url of allowed){
  test(`GET ${url} → 200`,async()=>{assert.equal((await rawRequest(server.url,url)).status,200,url);});
}

test('GET /content/<active-version>/... → 200 with immutable caching',async()=>{
  const r=await rawRequest(server.url,`/content/${activeVersion}/concepts.json`);
  assert.equal(r.status,200);
  assert.match(String(r.headers['cache-control']),/immutable/);
});

const traversal=[
  '/../package.json','/%2e%2e/package.json','/%2E%2E/%2E%2E/etc/passwd','/assets/%2e%2e/%2e%2e/package.json',
  '/assets/..%2f..%2fpackage.json','/assets/%252e%252e/%252e%252e/package.json','/%252e%252e%252fpackage.json',
  '/assets/..%5c..%5cpackage.json','/assets/%c0%ae%c0%ae/package.json','/app-preview/%00.js','/content/../../package.json',
  '/app-preview/../../src/app/bootstrap.ts','//etc/passwd','/assets/.hidden.png',
];
for(const url of traversal){
  test(`traversal ${url} is refused`,async()=>{
    const r=await rawRequest(server.url,url);
    assert.ok([400,404].includes(r.status),`${url} → ${r.status}`);
    assert.doesNotMatch(r.body,/"devDependencies"|root:x:0:0/);
  });
}

test('symlinks inside the public root cannot escape it',async()=>{
  const dist=cloneDist();
  fs.symlinkSync(path.join(repoRoot,'package.json'),path.join(dist,'assets','leak.json'));
  const s=await startServer({publicRoot:dist});
  try{assert.equal((await rawRequest(s.url,'/assets/leak.json')).status,404);}finally{await s.close();}
});

test('only GET/HEAD are accepted for static files',async()=>{
  assert.equal((await rawRequest(server.url,'/index.html',{method:'POST'})).status,405);
  assert.equal((await rawRequest(server.url,'/index.html',{method:'HEAD'})).status,200);
});

test('the production build output contains no repository-internal files',()=>{
  const report=JSON.parse(fs.readFileSync(path.join(repoRoot,'reports/production-build.json'),'utf8'));
  assert.deepEqual(report.forbiddenFiles??[],[]);
});
