import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SpeciesRegistry } from '../src/domain/chemistry/species-registry.ts';

const records=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/species.json',import.meta.url),'utf8'));

test('loads a curated school chemistry species registry with provenance', () => {
  const registry=SpeciesRegistry.from(records);
  assert.ok(registry.size >= 71);
  assert.equal(registry.requireByFormula('H2O').phase,'l');
  assert.equal(registry.requireByFormula('AgNO3').id,'species.agno3');
  assert.ok(records.every(r=>Array.isArray(r.sourceRefs)&&r.sourceRefs.length>0));
});

test('rejects duplicate IDs and duplicate chemical identity records', () => {
  const base=records[0];
  assert.throws(()=>SpeciesRegistry.from([base,{...records[1],id:base.id}]),/SPECIES_DUPLICATE_ID/);
  assert.throws(()=>SpeciesRegistry.from([base,{...base,id:'species.other'}]),/SPECIES_DUPLICATE_IDENTITY/);
});

test('uses structured not-found behavior', () => {
  const registry=SpeciesRegistry.from(records);
  assert.throws(()=>registry.requireByFormula('XeF99'),/SPECIES_NOT_FOUND/);
});
