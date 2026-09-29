import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, FormulaError } from '../src/domain/chemistry/formula-parser.ts';

const atoms = f => parseFormula(f).atoms;

test('parses simple, grouped, nested and hydrate formulas', () => {
  assert.deepEqual(atoms('H2O'), { H:2, O:1 });
  assert.deepEqual(atoms('Ca(OH)2'), { Ca:1, O:2, H:2 });
  assert.deepEqual(atoms('Al2(SO4)3'), { Al:2, S:3, O:12 });
  assert.deepEqual(atoms('K4[Fe(CN)6]'), { K:4, Fe:1, C:6, N:6 });
  assert.deepEqual(atoms('CuSO4·5H2O'), { Cu:1, S:1, O:9, H:10 });
});

test('parses supported ionic charges without corrupting subscripts', () => {
  assert.equal(parseFormula('NH4+').charge, 1);
  assert.deepEqual(atoms('NH4+'), { N:1, H:4 });
  assert.equal(parseFormula('SO4^2-').charge, -2);
  assert.deepEqual(atoms('SO4^2-'), { S:1, O:4 });
  assert.equal(parseFormula('Fe3+').charge, 3);
  assert.deepEqual(atoms('Fe3+'), { Fe:1 });
});

test('accepts supported leading isotope notation without changing atom count', () => {
  const parsed = parseFormula('^14C');
  assert.equal(parsed.isotopeMass, 14);
  assert.deepEqual(parsed.atoms, { C:1 });
});

test('rejects malformed, unsupported and oversized formulas with structured codes', () => {
  for (const [input, code] of [
    ['Ca(OH2', 'FORMULA_INVALID'],
    ['2', 'FORMULA_INVALID'],
    ['Xx2', 'FORMULA_INVALID'],
    ['SO42-', 'FORMULA_SYNTAX_UNSUPPORTED'],
    ['C'.repeat(300), 'INPUT_TOO_LONG'],
  ]) {
    assert.throws(() => parseFormula(input), err => err instanceof FormulaError && err.code === code);
  }
});
