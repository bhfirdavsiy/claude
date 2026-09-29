import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBeta2ReadinessReport } from '../src/runtime/beta2/readiness.ts';
import { loadBeta2CapabilityMatrix } from '../src/runtime/beta2/capability.ts';
import { loadBeta1ConfigRegistry } from '../src/runtime/beta1/config.ts';
import { loadBeta2AdvancedRegistry } from '../src/runtime/beta2/advanced.ts';
import { loadBeta2OrganicRegistry } from '../src/runtime/beta2/organic.ts';
const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const report=buildBeta2ReadinessReport({
  units:read('content-src/learning-units.json'), practices:read('content-src/practice-activities.json'), mappings:read('content-src/mapping-links.json'),
  matrix:loadBeta2CapabilityMatrix(read('content-src/beta2-capability-matrix.json')),
  configRegistry:{...loadBeta1ConfigRegistry(read('content-src/activity-configs/beta2-safe.json')),...loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json')),...loadBeta2OrganicRegistry(read('content-src/activity-configs/beta2-organic.json'))},
});

test('all 53 audited Beta2 units are technical-ready after bounded capabilities are implemented',()=>{
  assert.equal(report.totalLearningUnits,53);
  assert.equal(report.technicalReady,53);
  assert.equal(report.releaseReady,0);
  assert.equal(report.blockedByDisposition['needs-capability'],0);
  assert.equal(report.blockedByDisposition['needs-content'],0);
  assert.equal(report.blockedByDisposition['remap-required'],0);
});

test('resolved grade 10 mapping/content gaps are technical-ready with their replacement primaries',()=>{
  for(const legacy of ['10.17','10.19','10.21','10.22','10.23','10.26']){
    const row=report.rows.find(x=>x.legacyId===legacy);
    assert.equal(row.technicalReady,true,legacy);
    assert.deepEqual(row.reasons,[],legacy);
  }
});
