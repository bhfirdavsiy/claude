import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuantity, nearlyEqualQuantity, roundSignificant } from '../src/domain/chemistry/quantity.ts';

test('converts compatible chemistry quantities', () => {
  assert.deepEqual(convertQuantity({ value: 1000, unit: 'g' }, 'kg'), { value: 1, unit: 'kg' });
  assert.deepEqual(convertQuantity({ value: 1.5, unit: 'L' }, 'mL'), { value: 1500, unit: 'mL' });
  assert.deepEqual(convertQuantity({ value: 25, unit: '°C' }, 'K'), { value: 298.15, unit: 'K' });
  assert.deepEqual(convertQuantity({ value: 101.325, unit: 'kPa' }, 'Pa'), { value: 101325, unit: 'Pa' });
});

test('rejects incompatible unit dimensions', () => {
  assert.throws(() => convertQuantity({ value: 1, unit: 'g' }, 'L'), /UNIT_INCOMPATIBLE/);
});

test('compares quantities with converted tolerance', () => {
  assert.equal(nearlyEqualQuantity({ value: 1, unit: 'L' }, { value: 1000, unit: 'mL' }, { value: 0.5, unit: 'mL' }), true);
  assert.equal(nearlyEqualQuantity({ value: 1, unit: 'L' }, { value: 1002, unit: 'mL' }, { value: 0.5, unit: 'mL' }), false);
});

test('rounds to significant figures', () => {
  assert.equal(roundSignificant(12345, 3), 12300);
  assert.equal(roundSignificant(0.012345, 3), 0.0123);
  assert.equal(roundSignificant(-987.65, 2), -990);
});
