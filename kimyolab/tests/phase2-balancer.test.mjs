import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceEquation, balanceSpecies } from '../src/domain/chemistry/equation-balancer.ts';

const cases = [
  ['Fe + O2 -> Fe2O3', [4,3,2]],
  ['H2 + O2 -> H2O', [2,1,2]],
  ['KMnO4 -> K2MnO4 + MnO2 + O2', [2,1,1,1]],
  ['Al + H2SO4 -> Al2(SO4)3 + H2', [2,3,1,3]],
  ['C2H6 + O2 -> CO2 + H2O', [2,7,4,6]],
  ['P4 + O2 -> P2O5', [1,5,2]],
  ['KClO3 -> KCl + O2', [2,2,3]],
  ['Na3PO4 + MgCl2 -> NaCl + Mg3(PO4)2', [2,3,6,1]],
];

test('balances molecular equations algorithmically to smallest positive integers', () => {
  for (const [eq, expected] of cases) assert.deepEqual(balanceEquation(eq).coefficients, expected, eq);
});

test('balances array input and formats the result', () => {
  const out = balanceSpecies(['Fe','O2'], ['Fe2O3']);
  assert.deepEqual(out.reactantCoefficients, [4,3]);
  assert.deepEqual(out.productCoefficients, [2]);
  assert.equal(out.equation, '4Fe + 3O2 → 2Fe2O3');
});

test('rejects impossible or underdetermined molecular equations', () => {
  assert.throws(() => balanceEquation('H2 -> H2O'), /EQUATION_NO_POSITIVE_SOLUTION/);
  assert.throws(() => balanceEquation('H2 + O2 -> H2O + H2O2'), /EQUATION_UNDERDETERMINED/);
});
