import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ReactionMatcher } from '../src/domain/chemistry/reaction-matcher.ts';

const records=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/reactions.json',import.meta.url),'utf8'));
const matcher=ReactionMatcher.from(records);

test('matches curated precipitation independent of reactant order', () => {
  const a=matcher.match({reactants:[{formula:'AgNO3',phase:'aq'},{formula:'NaCl',phase:'aq'}]});
  const b=matcher.match({reactants:['NaCl','AgNO3']});
  assert.equal(a.modeled,true); assert.equal(a.reaction.id,'rxn.agno3-nacl');
  assert.equal(b.modeled,true); assert.equal(b.reaction.id,'rxn.agno3-nacl');
  assert.equal(a.reaction.observations[0].type,'precipitate');
});

test('matches a known acid-metal reaction', () => {
  const out=matcher.match({reactants:['Zn','HCl']});
  assert.equal(out.modeled,true);
  assert.equal(out.reaction.id,'rxn.zn-hcl');
});

test('requires conditions when reactants have multiple curated outcomes', () => {
  const ambiguous=matcher.match({reactants:['C','O2']});
  assert.deepEqual(ambiguous,{modeled:false,code:'REACTION_CONDITION_REQUIRED'});
  const complete=matcher.match({reactants:['C','O2'],conditions:{tags:['oxygen-excess','ignition']}});
  assert.equal(complete.modeled,true);
  assert.equal(complete.reaction.id,'rxn.c-combustion');
});

test('rejects explicit phase mismatch and unknown chemistry without guessing', () => {
  assert.deepEqual(matcher.match({reactants:[{formula:'AgNO3',phase:'s'},{formula:'NaCl',phase:'aq'}]}),{modeled:false,code:'REACTION_NOT_MODELED'});
  assert.deepEqual(matcher.match({reactants:['Xe','NaCl']}),{modeled:false,code:'REACTION_NOT_MODELED'});
});
