import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));

test('Beta3 authoring registries cover all 22 grade 11 primary practices without duplicate ids',()=>{
  const safe=read('content-src/activity-configs/beta3-safe.json');
  const advanced=read('content-src/activity-configs/beta3-advanced.json');
  const all={...safe,...advanced};
  assert.equal(Object.keys(safe).length,3);
  assert.equal(Object.keys(advanced).length,19);
  assert.equal(Object.keys(all).length,22);
  const matrix=read('content-src/beta3-capability-matrix.json');
  for(const row of matrix) assert.ok(all[row.primaryPracticeId],`${row.legacyId}: ${row.primaryPracticeId}`);
});

test('advanced Beta3 configs preserve domain capability labels',()=>{
  const matrix=read('content-src/beta3-capability-matrix.json');
  const advanced=read('content-src/activity-configs/beta3-advanced.json');
  const byId=new Map(matrix.map(x=>[x.primaryPracticeId,x]));
  for(const [id,c] of Object.entries(advanced)) assert.ok(byId.get(id).requiredCapabilities.includes(c.capability),id);
});
