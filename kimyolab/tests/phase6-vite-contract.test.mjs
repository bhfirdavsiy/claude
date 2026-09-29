import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('Phase 6 source declares Vite as the production build contract',()=>{
  const configUrl=new URL('../vite.config.ts',import.meta.url);
  assert.equal(fs.existsSync(configUrl),true);
  const config=fs.readFileSync(configUrl,'utf8');
  assert.match(config,/index\.html/);
  assert.match(config,/publicDir\s*:\s*['"]public['"]/);
  assert.equal(pkg.scripts['vite:build'],'vite build');
  assert.equal(pkg.scripts['vite:dev'],'vite --host 127.0.0.1');
});
