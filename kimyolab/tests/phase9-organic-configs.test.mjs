import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadBeta2OrganicRegistry} from '../src/runtime/beta2/organic.ts';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const matrix=read('content-src/beta2-capability-matrix.json');
const registry=loadBeta2OrganicRegistry(read('content-src/activity-configs/beta2-organic.json'));

test('all 17 organic capability units remain explicit and have one bounded organic config',()=>{
  const organic=matrix.filter(x=>x.grade===10&&x.requiredCapabilities.some(c=>String(c).startsWith('organic-')||c==='homologous-series'||c==='cyclic-structure-model'||c==='aromatic-structure'||c==='saponification'||c==='carbohydrate-reaction-model'));
  assert.ok(organic.every(x=>x.disposition==='existing-engine'));
  assert.equal(organic.length,17);
  assert.equal(Object.keys(registry).length,17);
  for(const row of organic) assert.ok(registry[row.primaryPracticeId],`${row.legacyId} missing ${row.primaryPracticeId}`);
});

test('organic configs keep the audited capability labels instead of silently downgrading to generic interactions',()=>{
  const byId=new Map(matrix.map(x=>[x.primaryPracticeId,x]));
  for(const [id,config] of Object.entries(registry)){
    const row=byId.get(id); assert.ok(row,id);
    assert.ok(row.requiredCapabilities.includes(config.capability),`${row.legacyId}: ${config.capability}`);
  }
});

test('organic capability units have unique primary practice identities so unit-specific configs cannot collide',()=>{
  const organic=matrix.filter(x=>x.grade===10&&x.requiredCapabilities.some(c=>String(c).startsWith('organic-')||c==='homologous-series'||c==='cyclic-structure-model'||c==='aromatic-structure'||c==='saponification'||c==='carbohydrate-reaction-model'));
  const ids=organic.map(x=>x.primaryPracticeId);
  assert.equal(new Set(ids).size,ids.length);
});
