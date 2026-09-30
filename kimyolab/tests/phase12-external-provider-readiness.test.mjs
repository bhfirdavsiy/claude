import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ExternalLinkLabProvider} from '../src/integrations/external-labs/external-link-provider.ts';
import {validateExternalLabBindings} from '../src/integrations/external-labs/registry.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const bindings=validateExternalLabBindings(JSON.parse(read('content-src/external-lab-bindings.json')));

test('reference/deep-link providers are launch-ready only for approved HTTPS bindings',()=>{
  for(const id of ['chemai','chem-lab-station']){
    const provider=new ExternalLinkLabProvider(id);
    const rows=bindings.filter(x=>x.provider===id);
    assert.ok(rows.length>0);
    for(const row of rows){const state=provider.readiness(row);assert.equal(state.ready,true);assert.equal(state.code,'READY');}
  }
});

test('external provider readiness report is fail-closed for missing NOBOOK partner assets without exposing secrets',()=>{
  const env={...process.env};
  delete env.NOBOOK_APP_KEY;delete env.NOBOOK_APP_SECRET;delete env.NOBOOK_PID_SCOPE;delete env.NOBOOK_EXPERIMENT_URL;delete env.NOBOOK_SDK_SHA256;
  const run=spawnSync(process.execPath,['--experimental-strip-types','scripts/external-provider-readiness.ts'],{cwd:root,env,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(read('reports/external-provider-readiness.json'));
  assert.equal(report.status,'READY_WITH_EXTERNAL_BLOCKER');
  assert.equal(report.readyReferenceBindings,8);
  assert.equal(report.nobook.bindings,3);
  assert.equal(report.nobook.partnerConfigured,false);
  assert.equal(report.nobook.sdkReady,false);
  assert.ok(report.nobook.missing.includes('NOBOOK_SDK_ARTIFACT'));
  assert.ok(report.nobook.missing.includes('NOBOOK_SDK_SHA256'));
  assert.equal(report.nobook.sdkChecksumValid,false);
  assert.equal(report.safety.secretsExposed,false);
  assert.equal(JSON.stringify(report).includes('NOBOOK_APP_SECRET='),false);
});

test('NOBOOK runtime only loads a same-origin vendored SDK artifact and server keeps secret values server-side',()=>{
  const provider=read('src/integrations/external-labs/nobook/nobook-provider.ts');
  const server=read('server/app.mjs');
  // P2.2 changed this assertion: the vendored SDK path is resolved through the host asset base (assetUrl) instead of a
  // site-root literal, so it stays same-origin under a subpath mount too (/kimyolab/vendor/nobook/postmate.js).
  assert.match(provider,/const sdkUrl=assetUrl\('vendor\/nobook\/postmate\.js'\);\s*const sdk:any=await import\(sdkUrl\)/);
  assert.match(provider,/import \{apiUrl,assetUrl\} from '\.\.\/\.\.\/\.\.\/ui\/host-paths\.ts';/);
  assert.ok(!provider.includes('NOBOOK_APP_SECRET'));
  assert.match(server,/publicRoot, 'vendor', 'nobook', 'postmate\.js'/);
  assert.match(server,/NOBOOK_APP_SECRET/);
  assert.match(server,/experimentUrlValid/);
  assert.match(server,/nobookSdkChecksumValid/);
  assert.ok(read('config/nobook.env.example').includes('NOBOOK_SDK_SHA256='));
});

test('student-facing external lab UI hides credential, adapter, evidence and mastery jargon',()=>{
  const ui=read('src/features/labs/external-render.ts');
  const strings=[...ui.matchAll(/text:'([^']*)'/g),...ui.matchAll(/text:`([^`]*)`/g)].map(x=>x[1].toLowerCase()).join(' ');
  for(const forbidden of ['appkey','appsecret','adapter','evidence','mastery','sdk']) assert.equal(strings.includes(forbidden),false,forbidden);
  assert.match(ui,/Hamkor virtual laboratoriya/);
  assert.match(ui,/KimyoLab tajribalariga qaytish/);
});


test('browser evidence runner covers lab catalog and external provider fallback routes',()=>{
  const gates=read('scripts/browser-gates.mjs');
  for(const route of ["{name:'labs',path:'/labs'}","{name:'external-chemai',path:'/external-lab/ext.chemai.rate?lu=lu.8.19'}","{name:'external-nobook-fallback',path:'/external-lab/ext.nobook.inorganic?lu=lu.8.14'}"]) assert.ok(gates.includes(route),route);
  assert.ok(gates.includes('external-provider-readiness.json'));
  const collector=read('scripts/windows/Collect_KimyoLab_Browser_Evidence.ps1');
  assert.ok(collector.includes('external-provider-readiness.json'));
});
