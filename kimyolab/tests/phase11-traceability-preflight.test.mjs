import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extractRequirementIds,evaluateRcTraceability,runRcPreflight} from '../scripts/rc-preflight.ts';

test('RC traceability covers every frozen spec requirement with no internal implementation gaps',()=>{
  const spec=fs.readFileSync('docs/specs/KimyoLab_v20_Master_TT_v2.1_FINAL_IMPLEMENTATION_SPEC.md','utf8');
  const trace=JSON.parse(fs.readFileSync('reports/rc-traceability.json','utf8'));
  const result=evaluateRcTraceability(extractRequirementIds(spec),trace);
  assert.equal(result.specRequirementCount,150);
  assert.equal(result.traceabilityRowCount,156);
  assert.deepEqual(result.missing,[]);
  assert.deepEqual(result.duplicates,[]);
  assert.deepEqual(result.internalBlockers,[]);
  assert.equal(result.counts.PARTIAL,0);
  assert.equal(result.counts.NOT_IMPLEMENTED,0);
  assert.equal(result.internalReady,true);
  assert.equal(result.stableReady,false);
  assert.deepEqual(result.reviewPending,['CHEM-033','PROD-002']);
  assert.equal(result.externalPending.length,8);
});

test('RC preflight fails closed when a frozen requirement is missing or internally incomplete',()=>{
  const specIds=['REQ-001','REQ-002'];
  const result=evaluateRcTraceability(specIds,{rows:[{id:'REQ-001',status:'PARTIAL',module:'src',test:'tests/x',gate:'AUTOMATED'}]});
  assert.equal(result.internalReady,false);
  assert.deepEqual(result.missing,['REQ-002']);
  assert.deepEqual(result.internalBlockers,['REQ-001']);
});

test('machine-readable RC preflight is GREEN technically while external/human gates remain pending',()=>{
  const report=runRcPreflight();
  assert.equal(report.technicalPreflight,'GREEN');
  assert.equal(report.stableReleaseGate,'PENDING');
  assert.equal(report.counts.PASS,146);
  assert.equal(report.counts.REVIEW_PENDING,2);
  assert.equal(report.counts.EXTERNAL_PENDING,8);
});
