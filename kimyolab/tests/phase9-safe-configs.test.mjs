import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadBeta2CapabilityMatrix } from '../src/runtime/beta2/capability.ts';
import { loadBeta1ConfigRegistry } from '../src/runtime/beta1/config.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const matrix=loadBeta2CapabilityMatrix(read('content-src/beta2-capability-matrix.json'));
const configs=loadBeta1ConfigRegistry(read('content-src/activity-configs/beta2-safe.json'));

test('all 32 generic-safe existing-engine Beta2 units have exactly one safe primary config',()=>{
  const safe=matrix.filter(x=>x.disposition==='existing-engine'&&configs[x.primaryPracticeId]);
  assert.equal(safe.length,32);
  const ids=new Set(safe.map(x=>x.primaryPracticeId));
  assert.equal(ids.size,32);
  assert.equal(Object.keys(configs).length,32);
  for(const row of safe) assert.ok(configs[row.primaryPracticeId],`${row.legacyId} missing ${row.primaryPracticeId}`);
});

test('blocked-only practices are not silently given generic configs',()=>{
  const safePracticeIds=new Set(matrix.filter(x=>x.disposition==='existing-engine').map(x=>x.primaryPracticeId));
  for(const row of matrix.filter(x=>x.disposition!=='existing-engine'&&!safePracticeIds.has(x.primaryPracticeId))){
    assert.equal(configs[row.primaryPracticeId],undefined,`${row.legacyId} must remain blocked`);
  }
});
