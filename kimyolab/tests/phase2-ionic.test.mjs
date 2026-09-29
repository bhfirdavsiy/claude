import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { IonicEngine } from '../src/domain/chemistry/ionic-engine.ts';
const reactions=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/reactions.json',import.meta.url),'utf8'));
const rules=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/solubility.json',import.meta.url),'utf8'));
const engine=IonicEngine.from({reactions,rules});

test('derives silver chloride net ionic equation using curated dissociation rules',()=>{
  assert.equal(engine.netIonicEquation('rxn.agno3-nacl').equation,'Ag+ + Cl- → AgCl(s)');
});

test('derives neutralization net ionic equation',()=>{
  assert.equal(engine.netIonicEquation('rxn.naoh-hcl').equation,'H+ + OH- → H2O(l)');
});

test('derives barium sulfate precipitation net ionic equation',()=>{
  assert.equal(engine.netIonicEquation('rxn.bacl2-h2so4').equation,'Ba2+ + SO4^2- → BaSO4(s)');
});

test('does not dissociate solids or unmodeled weak species',()=>{
  assert.equal(engine.dissociate('AgCl').modeled,false);
  assert.equal(engine.dissociate('H2CO3').modeled,false);
});
