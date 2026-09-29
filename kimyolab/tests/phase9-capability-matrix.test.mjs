import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadBeta2CapabilityMatrix, summarizeBeta2Capabilities } from '../src/runtime/beta2/capability.ts';

const raw=JSON.parse(fs.readFileSync(new URL('../content-src/beta2-capability-matrix.json',import.meta.url),'utf8'));
const matrix=loadBeta2CapabilityMatrix(raw);
const summary=summarizeBeta2Capabilities(matrix);

test('Beta2 capability matrix covers exactly all 53 grade 9-10 learning units',()=>{
  assert.equal(matrix.length,53);
  assert.deepEqual(summary.byDisposition,{
    'existing-engine':53,
    'needs-capability':0,
    'needs-content':0,
    'remap-required':0,
  });
});

test('audited grade 10 semantic mapping gaps are promoted only after explicit canonical replacements exist',()=>{
  const byLegacy=new Map(matrix.map(x=>[x.legacyId,x]));
  for(const legacy of ['10.17','10.19','10.21','10.22','10.23','10.26']) assert.equal(byLegacy.get(legacy).disposition,'existing-engine');
});

test('implemented chemistry capabilities are unblocked while organic capability labels remain explicit',()=>{
  const byLegacy=new Map(matrix.map(x=>[x.legacyId,x]));
  for(const legacy of ['9.05','9.06','9.15','9.23']) assert.equal(byLegacy.get(legacy).disposition,'existing-engine');
  assert.ok(byLegacy.get('10.07').requiredCapabilities.includes('organic-nomenclature'));
  assert.ok(byLegacy.get('10.13').requiredCapabilities.includes('organic-polymerization'));
});
