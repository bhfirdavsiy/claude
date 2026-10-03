// P0.1 / P0.14 — only the built deployment surface is reachable over HTTP (allow-list).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {startServer,rawRequest,cloneDist,buildDist,repoRoot} from '../helpers/dist.mjs';

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

// P2.9: was "→ 200 with immutable caching". A pack served at its SEMANTIC version only (/content/<version>/…, the source
// layout) can change bytes without a version change, so it is now revalidated (no-cache); only the deployment layout's
// revision-qualified URL (/content/<version>/<revision>/…, revision = pack hash) is immutable (ADR-P2-010 §7).
test('GET /content/<active-version>/... (source layout) → 200, revalidated, never immutable',async()=>{
  const r=await rawRequest(server.url,`/content/${activeVersion}/concepts.json`);
  assert.equal(r.status,200);
  assert.equal(String(r.headers['cache-control']),'no-cache');
});

test('deployment layout: /content/<version>/<revision>/... → 200 immutable; pointer and manifest revalidated; the semantic-only path is gone',async()=>{
  const {applyRevisionLayout}=await import('../../scripts/lib/content-revision.ts');
  const dist=cloneDist();
  const {contentVersion,contentRevision}=applyRevisionLayout(path.join(dist,'content'));
  const deployed=await startServer({publicRoot:dist});
  try{
    const file=await rawRequest(deployed.url,`/content/${contentVersion}/${contentRevision}/concepts.json`);
    assert.equal(file.status,200); assert.match(String(file.headers['cache-control']),/immutable/);
    for(const url of ['/content/manifest.json',`/content/${contentVersion}/${contentRevision}/manifest.json`]){
      const r=await rawRequest(deployed.url,url); assert.equal(r.status,200,url); assert.equal(String(r.headers['cache-control']),'no-cache',url);
    }
    assert.equal((await rawRequest(deployed.url,`/content/${contentVersion}/concepts.json`)).status,404,'no un-revisioned copy is served');
    assert.match(contentRevision,/^[a-f0-9]{64}$/,'the revision is the full 64-hex pack checksum');
    // only the FULL revision path is immutable: a copy under a truncated 16-hex directory is never cached as immutable
    const short=contentRevision.slice(0,16);
    fs.cpSync(path.join(dist,'content',contentVersion,contentRevision),path.join(dist,'content',contentVersion,short),{recursive:true});
    const truncated=await rawRequest(deployed.url,`/content/${contentVersion}/${short}/concepts.json`);
    assert.doesNotMatch(String(truncated.headers['cache-control']??''),/immutable/,'a 16-hex path is not immutable');
  }finally{ await deployed.close(); fs.rmSync(dist,{recursive:true,force:true}); }
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
  const files=[];
  const walk=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())walk(full);else files.push(path.relative(dist,full).split(path.sep).join('/'));}};
  const dist=buildDist(); walk(dist);
  const forbidden=files.filter(f=>/(^|\/)\./.test(f)||/\.(ts|mjs|map|md|xlsx|env|sh|bat)$/.test(f)||/^(src|scripts|tests|docs|reports|review-packets|content-src|schemas|config|source|server|node_modules)\//.test(f)||/^package(-lock)?\.json$/.test(f));
  assert.deepEqual(forbidden,[]);
  assert.ok(files.includes('index.html')&&files.includes('content/manifest.json'));
});

test('only the active and previous content packs are public; an unreferenced pack in dist is not',async()=>{
  const dist=cloneDist();
  const pointerFile=path.join(dist,'content','manifest.json');
  const pointer=JSON.parse(fs.readFileSync(pointerFile,'utf8'));
  for(const v of ['2020.01.1','2025.12.9']){
    fs.mkdirSync(path.join(dist,'content',v),{recursive:true});
    fs.writeFileSync(path.join(dist,'content',v,'concepts.json'),'[]');
  }
  fs.writeFileSync(pointerFile,JSON.stringify({...pointer,previousVersion:'2025.12.9'}));
  const s=await startServer({publicRoot:dist});
  try{
    assert.equal((await rawRequest(s.url,'/content/2020.01.1/concepts.json')).status,404,'unreferenced pack');
    assert.equal((await rawRequest(s.url,'/content/2025.12.9/concepts.json')).status,200,'rollback target');
    assert.equal((await rawRequest(s.url,`/content/${pointer.activeVersion}/concepts.json`)).status,200,'active');
  }finally{await s.close();}
});
