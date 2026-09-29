import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path=new URL('../content-src/beta3-capability-matrix.json',import.meta.url);

test('Beta3 capability matrix explicitly covers all 22 grade 11 learning units',()=>{
  const matrix=JSON.parse(fs.readFileSync(path,'utf8'));
  assert.equal(matrix.length,22);
  assert.equal(new Set(matrix.map(x=>x.learningUnitId)).size,22);
  assert.ok(matrix.every(x=>x.grade===11));
  assert.ok(matrix.every(x=>Array.isArray(x.requiredCapabilities)&&x.requiredCapabilities.length>=1));
});

test('advanced grade 11 domains remain explicit instead of being downgraded to generic interaction labels',()=>{
  const matrix=JSON.parse(fs.readFileSync(path,'utf8'));
  const byLegacy=new Map(matrix.map(x=>[x.legacyId,x]));
  assert.ok(byLegacy.get('11.08').requiredCapabilities.includes('ideal-gas-law'));
  assert.ok(byLegacy.get('11.17').requiredCapabilities.includes('dynamic-equilibrium'));
  assert.ok(byLegacy.get('11.19').requiredCapabilities.includes('redox-half-reaction'));
  assert.ok(byLegacy.get('11.22').requiredCapabilities.includes('faraday-law'));
});
