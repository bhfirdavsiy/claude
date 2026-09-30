// P2.2 — portal-safe single product host foundation (ADR-P2-003). One product, one runtime, one content pack; the
// host adapter is the only thing that differs. These tests check the host boundary, the content-integrity guarantee
// of the embedded (standalone) transport, the storage and Web Lock namespaces, and that every generated host report
// is current and honest. The browser behaviour itself is proven by tests/e2e/{portal-subpath,standalone-host,host-parity}.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {normalizeBasePath,storageNamespaceFor,runtimeDbName,attemptLockPrefix,toLogicalPath,toHostHref,toHashHref,createPathHost,createEmbeddedHost,embeddedContentFetch} from '../src/app/host.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {createWebLocksLiveness,DEFAULT_ATTEMPT_LOCK_PREFIX} from '../src/features/progress/liveness.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {applyBasePath,rootAbsoluteUrls} from '../scripts/lib/host-build.ts';
import {buildHostAudit} from '../scripts/lib/host-audit.ts';
import {APPROVED_LOGO_SHA256,BRAND_ASSET} from '../scripts/host-readiness.ts';
import {WEIGHTS} from '../scripts/learning-depth.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));

// ------------------------------------------------------------------ host boundary: pure mapping

test('route model: one logical route, two transports; outside the mount is not the product',()=>{
  assert.equal(normalizeBasePath('/kimyolab'),'/kimyolab/'); assert.equal(normalizeBasePath(undefined),'/');
  for(const bad of ['kimyolab','/a/../b','//evil','/a b/','/x/./y']) assert.throws(()=>normalizeBasePath(bad),/HOST_BASE_PATH_INVALID/,bad);
  assert.equal(toHostHref('/learn/lu.8.16/practice','/kimyolab/'),'/kimyolab/learn/lu.8.16/practice');
  assert.equal(toHostHref('/learn/lu.8.16/practice','/'),'/learn/lu.8.16/practice');
  assert.equal(toHashHref('/learn/lu.8.16/practice'),'#/learn/lu.8.16/practice');
  assert.equal(toHostHref('https://example.org/x','/kimyolab/'),'https://example.org/x');
  assert.equal(toLogicalPath('/kimyolab/learn/lu.8.16/practice','/kimyolab/'),'/learn/lu.8.16/practice');
  assert.equal(toLogicalPath('/kimyolab','/kimyolab/'),'/'); assert.equal(toLogicalPath('/kimyolab/','/kimyolab/'),'/');
  assert.equal(toLogicalPath('/curriculum','/kimyolab/'),null); assert.equal(toLogicalPath('/kimyolab-x/','/kimyolab/'),null);
});

function fakeWindow(pathname='/',search='',hash=''){
  const listeners={}; const pushed=[];
  return {pushed,location:{pathname,search,hash},history:{pushState(_d,_u,url){ pushed.push(url); const u=new URL(url,'https://h.invalid'); this.owner.location.pathname=u.pathname; this.owner.location.search=u.search; }},addEventListener(t,l){ (listeners[t]??=[]).push(l); },fire(t){ for(const l of listeners[t]??[]) l(); }};
}

test('path host (/kimyolab/): navigation, current location, content/asset/API bases and namespace come from the base path',()=>{
  const win=fakeWindow('/kimyolab/learn/lu.7.12/guide','?q=atom'); win.history.owner=win;
  const host=createPathHost({basePath:'/kimyolab/',win,fetch:async()=>{throw new Error('unused');}});
  assert.deepEqual({kind:host.kind,base:host.basePath,content:host.contentBase,api:host.apiBase,ns:host.storageNamespace},{kind:'path',base:'/kimyolab/',content:'/kimyolab/content',api:'/kimyolab/api/',ns:'kimyolab@/kimyolab/'});
  assert.equal(host.currentLocation().pathname,'/learn/lu.7.12/guide'); assert.equal(host.currentLocation().searchParams.get('q'),'atom');
  let changes=0; host.onLocationChange(()=>changes++);
  host.navigate('/practice/practice.trainer.7.4');
  assert.deepEqual(win.pushed,['/kimyolab/practice/practice.trainer.7.4']); assert.equal(changes,1);
  assert.equal(host.currentLocation().pathname,'/practice/practice.trainer.7.4');
  win.fire('popstate'); assert.equal(changes,2);
  assert.equal(host.assetUrl('assets/brand/kimyolab-logo.webp'),'/kimyolab/assets/brand/kimyolab-logo.webp');
  assert.equal(host.apiUrl('api/external-labs/nobook/status'),'/kimyolab/api/external-labs/nobook/status');
  win.location.pathname='/elsewhere'; assert.equal(host.currentLocation().pathname,'/__outside__','outside the mount → the not-found route');
});

test('embedded host (standalone): hash transport, embedded assets, root namespace (same as before P2.2)',()=>{
  const win=fakeWindow('/x.html','', '#/learn/lu.7.12/guide');
  const host=createEmbeddedHost({content:{},assets:{'assets/brand/kimyolab-logo.webp':'data:image/webp;base64,AAAA'},win});
  assert.equal(host.currentLocation().pathname,'/learn/lu.7.12/guide');
  host.navigate('/curriculum'); assert.equal(win.location.hash,'#/curriculum');
  assert.equal(host.href('/labs'),'#/labs'); assert.equal(host.assetUrl('assets/brand/kimyolab-logo.webp'),'data:image/webp;base64,AAAA');
  assert.equal(host.assetUrl('assets/none.png'),'','a missing embedded asset is never a site-root URL');
  assert.equal(host.storageNamespace,'kimyolab');
});

// ------------------------------------------------------------------ standalone never bypasses pack integrity

function packFiles(){
  const files={}; const dir=path.join(root,'public/content');
  const walk=(rel)=>{ for(const e of fs.readdirSync(path.join(dir,rel),{withFileTypes:true})){ const r=rel?`${rel}/${e.name}`:e.name; if(e.isDirectory()) walk(r); else if(r.endsWith('.json')) files[r]=fs.readFileSync(path.join(dir,r),'utf8'); } };
  walk(''); return files;
}
test('embedded content transport runs the SAME manifest/checksum checks; a tampered file fails closed',async()=>{
  const files=packFiles();
  const ok=new ContentClient({baseUrl:'/content',fetchImpl:embeddedContentFetch(files)});
  assert.ok((await ok.listLearningUnits(7)).length>0);
  const pointer=JSON.parse(files['manifest.json']); const key=`${pointer.activeVersion}/learning-units/grade-7.json`;
  const tampered={...files,[key]:files[key].replace('"title": "','"title": "X')};
  const bad=new ContentClient({baseUrl:'/content',fetchImpl:embeddedContentFetch(tampered)});
  await assert.rejects(()=>bad.listLearningUnits(7),(e)=>e.code==='CONTENT_INTEGRITY_ERROR');
  assert.throws(()=>new ContentClient({fetchImpl:embeddedContentFetch(files)}),(e)=>e.code==='CONTENT_BASE_MISSING','no hidden /content default');
});

// ------------------------------------------------------------------ storage and Web Lock namespaces

test('storage namespace: root/standalone keep the pre-P2.2 database (existing learner data stays readable); a subpath mount is isolated',async()=>{
  assert.equal(runtimeDbName(storageNamespaceFor('/')),'kimyolab-runtime');
  assert.equal(runtimeDbName(storageNamespaceFor('/kimyolab/')),'kimyolab@/kimyolab/.runtime');
  assert.notEqual(runtimeDbName(storageNamespaceFor('/kimyolab/')),runtimeDbName(storageNamespaceFor('/kimyolab-staging/')));
  const idb=createFakeIndexedDb();
  const row={learningUnitId:'lu.7.01',status:'in_progress',activityStates:{},lastVisitedAt:'2026-09-15T00:00:00.000Z',contentVersion:'1',schemaVersion:'2.0.0'};
  // data written by the pre-P2.2 code (hard-coded 'kimyolab-runtime') is found by the root host's namespace
  await new IndexedDbProgressStore(idb,'kimyolab-runtime').saveProgress(row);
  assert.deepEqual((await new IndexedDbProgressStore(idb,runtimeDbName(storageNamespaceFor('/'))).listProgress()).map(r=>r.learningUnitId),['lu.7.01']);
  // a /kimyolab/ deployment on the same origin does not see (or overwrite) it
  assert.deepEqual(await new IndexedDbProgressStore(idb,runtimeDbName(storageNamespaceFor('/kimyolab/'))).listProgress(),[]);
});

function fakeLocks(){
  const held=[];
  return {held,request(name,_o,cb){ held.push({name}); return Promise.resolve(cb()).finally(()=>held.splice(held.findIndex(h=>h.name===name),1)); },query:async()=>({held:[...held],pending:[]})};
}
test('Web Lock namespace: two deployments never read each other’s attempt locks; the liveness semantics are unchanged',async()=>{
  assert.equal(attemptLockPrefix(storageNamespaceFor('/')),DEFAULT_ATTEMPT_LOCK_PREFIX);
  const locks=fakeLocks();
  const root=createWebLocksLiveness(locks,attemptLockPrefix(storageNamespaceFor('/')));
  const portal=createWebLocksLiveness(locks,attemptLockPrefix(storageNamespaceFor('/kimyolab/')));
  root.claim('a-1'); portal.claim('p-1');
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual([...await root.liveAttemptIds()],['a-1']);
  assert.deepEqual([...await portal.liveAttemptIds()],['p-1']);
  assert.ok(locks.held.some(h=>h.name==='kimyolab@/kimyolab/.attempt.p-1'));
  portal.release('p-1'); await new Promise(r=>setTimeout(r,0));
  assert.deepEqual([...await portal.liveAttemptIds()],[]); assert.deepEqual([...await root.liveAttemptIds()],['a-1']);
});

// ------------------------------------------------------------------ deployment: base path of the shell

test('the shell is base-path safe: /kimyolab/ build has no root-absolute URL; the root build is unchanged',()=>{
  const index=read('index.html');
  assert.match(index,/<meta name="kimyolab-base-path" content="\/">/);
  const sub=applyBasePath(index,'/kimyolab/');
  assert.match(sub,/<meta name="kimyolab-base-path" content="\/kimyolab\/">/);
  assert.deepEqual(rootAbsoluteUrls(sub,'/kimyolab/'),[]);
  assert.match(sub,/href="\/kimyolab\/curriculum" data-kl-route="\/curriculum"/);
  assert.equal(applyBasePath(index,'/'),index);
  assert.throws(()=>applyBasePath('<html></html>','/kimyolab/'),/HOST_BASE_META_MISSING/);
});

// ------------------------------------------------------------------ generated reports are current and honest

const strip=(a)=>{ const {before,...rest}=a; return JSON.parse(JSON.stringify(rest)); };
test('host-architecture audit: current; no host type checks, no root paths, no global CSS, no service worker',()=>{
  const committed=json('reports/host-architecture-audit.json');
  assert.deepEqual(strip(committed),strip(buildHostAudit(root)),'run node scripts/host-readiness.ts');
  assert.equal(committed.hardcodedPaths.after.violations,0);
  assert.deepEqual(committed.hardcodedPaths.shell.rootAbsoluteUrlsWhenMountedAtKimyolab,[]);
  assert.equal(committed.hostBoundary.onlyBootstrapImports,true);
  assert.ok(Object.values(committed.hostBoundary.bootstrapUsesHost).every(Boolean));
  assert.deepEqual(committed.css.global,[]); assert.deepEqual(committed.css.rootNonNamespacedDeclarations,[]);
  assert.equal(committed.serviceWorker.pass,true);
  // the "before" column is the P2.1 merge (measured with git when the report was generated)
  assert.ok(committed.before.violations>0&&committed.before.shell.rootAbsoluteUrlsWhenMountedAtKimyolab.length>0&&committed.before.css.global.length>0);
});

test('portal readiness is proven on a SIMULATED mount and is not called integrated',()=>{
  const r=json('reports/portal-subpath-readiness.json');
  assert.equal(r.portalIntegrated,false); assert.equal(r.realDeployment,'P3'); assert.equal(r.mount,'/kimyolab/');
  const ids=r.checks.map(c=>c.id);
  for(const id of ['route-base','asset-base','content-base','deep-links','refresh','storage-namespace','lock-namespace','css-isolation','standalone-parity','service-worker','outside-scope-404']) assert.ok(ids.includes(id),id);
  assert.ok(r.checks.every(c=>c.pass),JSON.stringify(r.checks.filter(c=>!c.pass)));
  assert.equal(r.summary.status,'READY_IN_SIMULATION');
});

test('host parity: every representative scenario gives identical semantic outputs in both hosts',()=>{
  const r=json('reports/host-parity.json');
  const ids=[...read('tests/e2e/host-scenarios.mjs').matchAll(/\{id: '([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(r.scenarioIds,ids); assert.deepEqual(r.scenarios.map(s=>s.id),ids);
  for(const id of ['home-to-curriculum','unit-guide-practice','atom-builder','hydrolysis','ionic','manganese-9.23','static-check-form','progress-persistence']) assert.ok(ids.includes(id),id);
  assert.ok(r.scenarios.every(s=>s.status==='PASS'));
  assert.equal(r.summary.status,'PASS');
  // parity compares real engine output: the chemistry scenarios produced evidence with scores
  for(const id of ['atom-builder','hydrolysis','ionic','manganese-9.23','static-check-form']) assert.ok(r.scenarios.find(s=>s.id===id).semantic.evidence.some(e=>e.score===1),id);
});

test('standalone artifact: same content bytes, same runtime (no fetch patch, no flag), integrity kept, parity PASS',()=>{
  const r=json('reports/standalone-parity.json');
  const html=fs.readFileSync(path.join(root,'dist-standalone/KimyoLab_standalone.html'));
  assert.equal(r.artifact.sha256,crypto.createHash('sha256').update(html).digest('hex'),'report matches the committed artifact');
  assert.equal(r.artifact.sizeBytes,html.length);
  assert.equal(r.sameContent.byteIdenticalToPublicContentPack,true);
  assert.deepEqual({patched:r.sameRuntime.globalFetchPatched,flag:r.sameRuntime.standaloneFlag,host:r.sameRuntime.embeddedHostConfig,integrity:r.sameRuntime.integrityChecked},{patched:false,flag:false,host:true,integrity:true});
  assert.equal(r.status,'PASS');
});

test('brand: the user-approved logo is used byte-for-byte in both hosts; the temporary letter mark is gone',()=>{
  const r=json('reports/brand-integration.json');
  const bytes=fs.readFileSync(path.join(root,BRAND_ASSET));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),APPROVED_LOGO_SHA256,'the approved binary, not a redraw');
  assert.equal(r.status,'INTEGRATED'); assert.equal(r.asset.identicalToApproved,true); assert.deepEqual(r.asset.dimensions,{width:1254,height:1254});
  assert.deepEqual(r.hosts,{portal:'resolves',standalone:'resolves'});
  assert.equal(r.shell.temporaryLetterMarkRemoved,true);
});

test('OPTION_SET_MISSING stays a human authoring queue: no machine-made alternatives',()=>{
  const q=json('review-packets/option-set-authoring/queue.json');
  const audit=json('reports/learner-answer-input-audit.json');
  assert.equal(q.counts.activities,23); assert.equal(q.counts.fields,audit.fields.filter(f=>f.status==='OPTION_SET_MISSING').length);
  for(const a of q.activities) for(const f of a.fields){
    assert.equal(f.status,'AWAITING_HUMAN_AUTHOR');
    assert.deepEqual(Object.keys(f).sort(),['answerCategory','authorMustProvide','canonicalTarget','field','fieldLabel','reviewRequirement','status','whyMissing']);
  }
  assert.equal(q.status,'AWAITING_HUMAN_AUTHOR');
});

test('progress: portal readiness is a separate metric, not in the management formula; depth is not inflated',()=>{
  const p=json('reports/project-progress.json');
  assert.deepEqual(Object.keys(WEIGHTS.learningProduct).sort(),['assessmentCoverage','governance','learningCoverage','localization','modelBasedInteraction','release']);
  assert.deepEqual(WEIGHTS.overall,{foundation:0.4,learningProduct:0.6});
  assert.equal(p.separateMetrics.portalSubpathReadiness.inManagementFormula,false);
  assert.equal(p.separateMetrics.portalSubpathReadiness.status,'READY_IN_SIMULATION');
  assert.ok(Math.abs(0.4*p.foundationProgress.percent+0.6*p.learningProductProgress.percent-p.overallManagementEstimate.percent)<0.01);
  const b=json('reports/learning-depth-baseline.json');
  assert.equal(b.activities.filter(a=>a.depth==='MODEL_BASED').length,4);
  assert.equal(p.learningProductProgress.components.modelBasedInteraction,4.918,'6/122 units');
  assert.ok(p.whereWeAreNow.facts.includes('0 human approvals, 0 human releases, 0 pilot sign-offs'));
});
