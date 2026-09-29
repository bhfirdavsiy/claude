import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBeta3ReadinessReport} from '../src/runtime/beta3/readiness.ts';
import {loadBeta1ConfigRegistry} from '../src/runtime/beta1/config.ts';
import {loadBeta3AdvancedRegistry} from '../src/runtime/beta3/advanced.ts';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));

test('all 22 grade 11 units become technical-ready only when mapping/activity/config gates are satisfied',()=>{
  const matrix=read('content-src/beta3-capability-matrix.json');
  const registry={...loadBeta1ConfigRegistry(read('content-src/activity-configs/beta3-safe.json')),...loadBeta3AdvancedRegistry(read('content-src/activity-configs/beta3-advanced.json'))};
  const report=buildBeta3ReadinessReport({units:read('content-src/learning-units.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json'),matrix,configRegistry:registry});
  assert.equal(report.totalLearningUnits,22);
  assert.equal(report.technicalReady,22);
  assert.equal(report.releaseReady,0);
  assert.equal(report.blockedByDisposition['needs-capability'],0);
  assert.ok(report.rows.every(r=>r.approvalPending.length>0));
});
