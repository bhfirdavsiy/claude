import {fileURLToPath} from 'node:url';
// P0.11 / P0.12 — one canonical external URL policy; external evidence out of localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateExternalLabUrl,frameSourcesFor} from '../src/integrations/external-labs/url-policy.ts';
import {validateExternalLabBindings} from '../src/integrations/external-labs/registry.ts';
import {validateExternalLabEvidence,EXTERNAL_EVIDENCE_LIMITS} from '../src/integrations/external-labs/evidence.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));

test('validateExternalLabUrl accepts only approved hosts over HTTPS',()=>{
  assert.equal(validateExternalLabUrl('chemai','https://chemai.in/virtual%20lab/index.html').ok,true);
  assert.equal(validateExternalLabUrl('chem-lab-station','https://chemlaboratory.vercel.app/').ok,true);
  assert.equal(validateExternalLabUrl('nobook','https://school.nobook.com/lab').ok,true);
  const rejected={
    'http://chemai.in/':'EXTERNAL_URL_NOT_HTTPS',
    'https://evil.example/':'EXTERNAL_URL_HOST_NOT_ALLOWED',
    'https://chemai.in.evil.example/':'EXTERNAL_URL_HOST_NOT_ALLOWED',
    'https://evilchemai.in/':'EXTERNAL_URL_HOST_NOT_ALLOWED',
    'https://user:pw@chemai.in/':'EXTERNAL_URL_CREDENTIALS',
    'https://chemai.in:8443/':'EXTERNAL_URL_PORT',
    'javascript:alert(1)':'EXTERNAL_URL_NOT_HTTPS',
    'not a url':'EXTERNAL_URL_INVALID',
  };
  for(const [url,code] of Object.entries(rejected)) assert.equal(validateExternalLabUrl('chemai',url).code,code,url);
  assert.equal(validateExternalLabUrl('chem-lab-station','https://other.vercel.app/').code,'EXTERNAL_URL_HOST_NOT_ALLOWED','shared hosting is exact-host only');
  assert.equal(validateExternalLabUrl('nobook','https://nobook.com.evil.example/').ok,false);
  assert.equal(validateExternalLabUrl('toString','https://chemai.in/').code,'EXTERNAL_URL_PROVIDER_UNKNOWN');
});

test('runtime binding validation, build validator and server all use the same policy',()=>{
  const bad=[{id:'ext.bad',provider:'chemai',mode:'deep-link',status:'active',title:'x',description:'',learningUnitIds:['lu.7.01'],externalUrl:'https://evil.example/',evidencePolicy:'self_report',localAssessmentRequired:true}];
  assert.throws(()=>validateExternalLabBindings(bad),/EXTERNAL_URL_HOST_NOT_ALLOWED/);
  assert.match(fs.readFileSync(path.join(root,'scripts/validate-external-labs.ts'),'utf8'),/validateExternalLabUrl\(binding\.provider/);
  assert.match(fs.readFileSync(path.join(root,'server/app.mjs'),'utf8'),/validateExternalLabUrl\('nobook'/);
  assert.deepEqual(frameSourcesFor('nobook'),['https://nobook.com','https://*.nobook.com']);
});

const expected={bindingId:'ext.nobook.electrolysis',learningUnitId:'lu.9.15',provider:'nobook'};
const good={provider:'nobook',bindingId:expected.bindingId,learningUnitId:expected.learningUnitId,evidencePolicy:'scene_state',capturedAt:'2026-09-29T10:00:00.000Z',sceneData:'{"scene":1}',screenshotDataUrl:'data:image/png;base64,iVBORw0KGgo='};

test('external evidence validation enforces provider, binding, schema and size limits',()=>{
  assert.deepEqual(validateExternalLabEvidence(good,expected),good);
  const bad=[
    [{...good,provider:'chemai'},/provider does not match/],
    [{...good,bindingId:'ext.other'},/bindingId does not match/],
    [{...good,learningUnitId:'lu.7.01'},/learningUnitId does not match/],
    [{...good,extra:1},/unknown property/],
    [{...good,capturedAt:'yesterday'},/capturedAt/],
    [{...good,screenshotDataUrl:'data:text/html;base64,PHNjcmlwdD4='},/screenshotDataUrl/],
    [{...good,sceneData:'x'.repeat(EXTERNAL_EVIDENCE_LIMITS.maxSceneDataBytes+1)},/sceneData too large/],
    [{...good,note:'hi'},/note only allowed/],
  ];
  for(const [value,pattern] of bad) assert.throws(()=>validateExternalLabEvidence(value,expected),pattern);
});

test('external evidence is stored in IndexedDB.externalEvidence and re-validated on restore',async()=>{
  const factory=createFakeIndexedDb();
  const store=new IndexedDbProgressStore(factory,'p0-external');
  await store.saveExternalEvidence(good,expected);
  const restored=await store.loadExternalEvidence(expected);
  assert.equal(restored.sceneData,good.sceneData);
  await assert.rejects(()=>store.saveExternalEvidence({...good,bindingId:'ext.other'},expected),/EXTERNAL_EVIDENCE_INVALID/);
  // Tamper with the stored record directly: restore must refuse it and isolate it.
  const db=await new Promise((resolve,reject)=>{const r=factory.open('p0-external');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction(['externalEvidence'],'readwrite');tx.objectStore('externalEvidence').put({...restored,screenshotDataUrl:'javascript:alert(1)'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
  assert.equal(await store.loadExternalEvidence(expected),undefined);
  assert.equal((await store.listQuarantine())[0].code,'EXTERNAL_EVIDENCE_INVALID');
});

test('no browser runtime code writes to localStorage',()=>{
  const ui=fs.readFileSync(path.join(root,'src/features/labs/external-render.ts'),'utf8');
  assert.equal(/localStorage\s*\./.test(ui),false);
  assert.match(ui,/saveExternalEvidence\(/);
  assert.match(ui,/loadExternalEvidence\(/);
});

test('anonymous installation id is a random UUID, created once and stable across store instances',async()=>{
  const factory=createFakeIndexedDb();
  const a=await new IndexedDbProgressStore(factory,'p0-installation').getOrCreateInstallationId();
  const b=await new IndexedDbProgressStore(factory,'p0-installation').getOrCreateInstallationId();
  const other=await new IndexedDbProgressStore(createFakeIndexedDb(),'p0-installation').getOrCreateInstallationId();
  assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(a,b);
  assert.notEqual(a,other);
});

test('NOBOOK client sends only the opaque learnerRef, never profile data',()=>{
  const provider=fs.readFileSync(path.join(root,'src/integrations/external-labs/nobook/nobook-provider.ts'),'utf8');
  assert.match(provider,/body:JSON\.stringify\(\{bindingId:binding\.id,learningUnitId,learnerRef\}\)/);
  assert.match(provider,/NOBOOK_LEARNER_REF_REQUIRED/);
});
