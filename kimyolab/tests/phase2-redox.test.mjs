import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceRedox } from '../src/domain/chemistry/redox-balancer.ts';

test('balances permanganate and iron in acidic medium', () => {
  const r=balanceRedox({reactants:['MnO4^-','Fe^2+'],products:['Mn^2+','Fe^3+'],medium:'acidic'});
  assert.equal(r.equation, 'MnO4^- + 5Fe^2+ + 8H+ → Mn^2+ + 5Fe^3+ + 4H2O');
});

test('balances dichromate and iodide in acidic medium', () => {
  const r=balanceRedox({reactants:['Cr2O7^2-','I^-'],products:['Cr^3+','I2'],medium:'acidic'});
  assert.equal(r.equation, 'Cr2O7^2- + 6I^- + 14H+ → 2Cr^3+ + 3I2 + 7H2O');
});

test('balances a supported basic-medium redox equation', () => {
  const r=balanceRedox({reactants:['MnO4^-','I^-'],products:['MnO2','IO3^-'],medium:'basic'});
  assert.equal(r.equation, '2MnO4^- + I^- + H2O → 2MnO2 + IO3^- + 2OH-');
});

test('does not guess when bounded redox model cannot produce a unique positive balance', () => {
  assert.throws(() => balanceRedox({reactants:['H2'],products:['H2O'],medium:'neutral'}), /REDOX_NOT_BALANCED/);
});
