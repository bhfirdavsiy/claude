import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('standalone build is self-contained while preserving modular ESM sources',()=>{
  const root=process.cwd();
  const report=JSON.parse(fs.readFileSync(path.join(root,'reports/standalone-build.json'),'utf8'));
  const html=fs.readFileSync(path.join(root,report.output),'utf8');
  assert.equal(report.valid,true);
  assert.ok(report.moduleCount>=50);
  assert.ok(report.contentJsonFiles>=20);
  assert.equal(report.architecture,'modular-esm-in-single-html-delivery');
  assert.match(html,/data-kimyolab-entry="standalone"/);
  assert.match(html,/__KIMYOLAB_STANDALONE__/);
  assert.match(html,/map\.type='importmap'/);
  assert.match(html,/kl\/app\/bootstrap\.js/);
  assert.doesNotMatch(html,/src="\/app-preview\//);
  assert.doesNotMatch(html,/href="\/app-preview\//);
  assert.doesNotMatch(html,/from ["']node:/);
});
