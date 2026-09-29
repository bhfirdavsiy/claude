import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBeta2ReadinessReport} from '../src/runtime/beta2/readiness.ts';
import {loadBeta2CapabilityMatrix} from '../src/runtime/beta2/capability.ts';
import {loadBeta1ConfigRegistry} from '../src/runtime/beta1/config.ts';
import {loadBeta2AdvancedRegistry} from '../src/runtime/beta2/advanced.ts';
import {loadBeta2OrganicRegistry} from '../src/runtime/beta2/organic.ts';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const report=buildBeta2ReadinessReport({
 units:read('content-src/learning-units.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json'),matrix:loadBeta2CapabilityMatrix(read('content-src/beta2-capability-matrix.json')),
 configRegistry:{...loadBeta1ConfigRegistry(read('content-src/activity-configs/beta2-safe.json')),...loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json')),...loadBeta2OrganicRegistry(read('content-src/activity-configs/beta2-organic.json'))}
});

test('all 53 grade 9-10 Beta2 units are technically runnable after bounded organic capabilities are implemented',()=>{
 assert.equal(report.totalLearningUnits,53);
 assert.equal(report.technicalReady,53);
 assert.equal(report.releaseReady,0);
 assert.deepEqual(report.blockedByDisposition,{'needs-capability':0,'needs-content':0,'remap-required':0});
 for(const row of report.rows) assert.deepEqual(row.reasons,[],`${row.legacyId}:${row.reasons.join(',')}`);
});
