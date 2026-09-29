import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBeta1ReadinessReport } from '../src/runtime/beta1/readiness.ts';
import { loadBeta1ConfigRegistry } from '../src/runtime/beta1/config.ts';

const read=(name)=>JSON.parse(fs.readFileSync(new URL(`../content-src/${name}`,import.meta.url),'utf8'));
const reference=JSON.parse(fs.readFileSync(new URL('../content-src/activity-configs/reference-slices.json',import.meta.url),'utf8'));
const betaRaw=JSON.parse(fs.readFileSync(new URL('../content-src/activity-configs/beta1.json',import.meta.url),'utf8'));
const beta=loadBeta1ConfigRegistry(betaRaw);
const registry={...reference,...beta};

test('Beta1 authoring registry covers all 43 unique grade 7-8 primary practices',()=>{
  const units=read('learning-units.json').filter(x=>x.grade===7||x.grade===8);
  const unitIds=new Set(units.map(x=>x.id));
  const primary=read('mapping-links.json').filter(x=>x.role==='primary'&&unitIds.has(x.learningUnitId));
  assert.equal(primary.length,47);
  assert.equal(new Set(primary.map(x=>x.practiceActivityId)).size,43);
  for(const mapping of primary) assert.ok(registry[mapping.practiceActivityId],`missing config ${mapping.practiceActivityId}`);
});

test('Beta1 technical readiness reaches 47/47 after migration overrides',()=>{
  const report=buildBeta1ReadinessReport({
    units:read('learning-units.json'),practices:read('practice-activities.json'),mappings:read('mapping-links.json'),configRegistry:registry,
  });
  assert.equal(report.technicalReady,47,JSON.stringify(report.rows.filter(x=>!x.technicalReady),null,2));
  assert.equal(report.releaseReady,0,'external approvals must remain pending');
});
