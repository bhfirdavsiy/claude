import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateExternalLabBindings,bindingsForLearningUnit} from '../src/integrations/external-labs/registry.ts';
import {parseAppRoute} from '../src/app/routes.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raw=JSON.parse(fs.readFileSync(path.join(root,'content-src/external-lab-bindings.json'),'utf8'));

test('external lab registry is valid and maps the priority curriculum topics',()=>{
  const bindings=validateExternalLabBindings(raw);
  assert.ok(bindings.length>=10);
  const rate=bindingsForLearningUnit(bindings,'lu.8.19');
  assert.ok(rate.some(x=>x.provider==='chemai'&&x.externalUrl?.includes('Rate_of_Reaction_Lab.html')));
  const equilibrium=bindingsForLearningUnit(bindings,'lu.11.18');
  assert.ok(equilibrium.some(x=>x.provider==='nobook'&&x.nobookModuleId===9));
  const electrochem=bindingsForLearningUnit(bindings,'lu.11.22');
  assert.ok(electrochem.some(x=>x.provider==='nobook'&&x.nobookModuleId===27));
  assert.ok(bindings.every(x=>x.localAssessmentRequired));
});

test('external lab routes are first-class app routes',()=>{
  assert.deepEqual(parseAppRoute('/labs'),{name:'labs'});
  assert.deepEqual(parseAppRoute('/external-lab/ext.chemai.rate'),{name:'external-lab',bindingId:'ext.chemai.rate'});
});

test('NOBOOK adapter keeps app_secret on the server side',()=>{
  const provider=fs.readFileSync(path.join(root,'src/integrations/external-labs/nobook/nobook-provider.ts'),'utf8');
  const server=fs.readFileSync(path.join(root,'server/app.mjs'),'utf8');
  assert.ok(!provider.includes('NOBOOK_APP_SECRET'));
  assert.ok(server.includes('NOBOOK_APP_SECRET'));
  assert.ok(server.includes("https://nbapi.nobook.com/v1/auth"));
  assert.ok(server.includes("createHash('md5')"));
  // P0.10: the browser-facing /auth endpoint is removed; the partner token never leaves the server.
  assert.ok(!server.includes('/api/external-labs/nobook/auth'));
});

test('browser preview contains external lab integration modules',()=>{
  assert.ok(fs.existsSync(path.join(root,'public/app-preview/integrations/external-labs/providers.js')));
  assert.ok(fs.existsSync(path.join(root,'public/content/2026.09.1/external-lab-bindings.json')));
});
