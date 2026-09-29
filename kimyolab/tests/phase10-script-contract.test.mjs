import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('Phase 10 package scripts expose Beta3 validation, focused tests and full verify chain',()=>{
  assert.equal(pkg.scripts['beta3:validate'],'node --experimental-strip-types scripts/validate-beta3.ts');
  assert.match(pkg.scripts['test:beta3'],/phase10-\*\.test\.mjs/);
  assert.match(pkg.scripts['phase10:verify'],/phase9:verify/);
  assert.match(pkg.scripts['phase10:verify'],/beta3:validate/);
  assert.match(pkg.scripts['phase10:verify'],/test:beta3/);
});
