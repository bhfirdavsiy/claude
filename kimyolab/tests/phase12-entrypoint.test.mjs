import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('canonical index is the modular runtime shell and legacy Sinco landing is preserved separately',()=>{
  const root=process.cwd();
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const legacy=fs.readFileSync(path.join(root,'legacy-index.html'),'utf8');
  assert.match(index,/data-kimyolab-entry="canonical"/);
  assert.match(index,/id="app-main"/);
  assert.match(index,/\/app-preview\/app\/bootstrap\.js/);
  assert.doesNotMatch(index,/vendor\/jquery\.min\.js/);
  assert.match(legacy,/js\/home\.js/);
  assert.match(legacy,/KimyoLab v20 — Sinco/);
});

test('production and release builders use canonical index.html as their source entry',()=>{
  const root=process.cwd();
  const prod=fs.readFileSync(path.join(root,'scripts/build-production.ts'),'utf8');
  const release=fs.readFileSync(path.join(root,'scripts/build-release-bundle.ts'),'utf8');
  const vite=fs.readFileSync(path.join(root,'vite.config.ts'),'utf8');
  assert.match(prod,/path\.join\(root,'index\.html'\)/);
  assert.match(release,/path\.join\(projectRoot,'index\.html'\)/);
  assert.match(vite,/input:'index\.html'/);
});
