import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OrganicKnowledgeBase} from '../src/domain/chemistry/organic-knowledge.ts';
const data=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/organic.json',import.meta.url),'utf8'));
const kb=OrganicKnowledgeBase.from(data);

test('organic knowledge base exposes bounded structure, nomenclature and homologous-series records',()=>{
  const butane=kb.molecule('butane');
  assert.equal(butane.modeled,true);
  assert.equal(butane.formula,'C4H10');
  assert.equal(butane.carbonValence,4);
  assert.equal(kb.nomenclature('2-methylpropane').name,'2-methylpropane');
  const isomers=kb.isomers('C4H10');
  assert.deepEqual(isomers.map(x=>x.id).sort(),['2-methylpropane','butane']);
  const propane=kb.homolog('alkane',3);
  assert.equal(propane.formula,'C3H8');
});

test('organic reaction templates are curated and condition-aware without guessing unknown chemistry',()=>{
  const addition=kb.reaction('ethene-bromine-addition');
  assert.equal(addition.modeled,true);
  assert.equal(addition.reactionType,'addition');
  assert.equal(addition.observation.type,'color-change');
  const polymer=kb.reaction('styrene-polymerization');
  assert.equal(polymer.productIds[0],'polystyrene-repeat-unit');
  assert.deepEqual(kb.reaction('unknown-reaction'),{modeled:false,code:'ORGANIC_REACTION_NOT_MODELED'});
});

test('organic qualitative and applied transformations cover grade 10 bounded curriculum cases',()=>{
  assert.equal(kb.reaction('glycerol-cuoh2').observation.to,'deep-blue-solution');
  assert.equal(kb.reaction('fat-saponification').reactionType,'saponification');
  assert.equal(kb.reaction('glucose-cuoh2-heating').observation.type,'precipitate');
  assert.equal(kb.molecule('benzene').aromatic,true);
  assert.equal(kb.molecule('cyclohexane').ringSize,6);
});

test('unknown molecule and homolog are explicit not-modeled results',()=>{
  assert.deepEqual(kb.molecule('unobtainium'),{modeled:false,code:'ORGANIC_MOLECULE_NOT_MODELED'});
  assert.deepEqual(kb.homolog('unknown-series',5),{modeled:false,code:'ORGANIC_HOMOLOG_NOT_MODELED'});
});
