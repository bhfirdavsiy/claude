import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { balanceEquation } from '../src/domain/chemistry/equation-balancer.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const file = path.join(root, 'tests', 'chemistry-corpus', 'school-review-candidates.json');

test('CHEM-033 review corpus contains 200 distinct school-chemistry candidates awaiting expert review', () => {
  assert.equal(fs.existsSync(file), true, 'school-review-candidates.json must exist');
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(corpus.kind, 'chemistry-review-candidate');
  assert.equal(corpus.chemicallyReviewed, false);
  assert.equal(corpus.expertApproved, false);
  assert.equal(corpus.cases.length, 200);
  assert.equal(new Set(corpus.cases.map((x) => x.equation)).size, 200, 'equations must be unique');
  for (const item of corpus.cases) {
    assert.ok(item.id);
    assert.ok(item.family);
    assert.ok(item.gradeBand);
    assert.equal(item.reviewStatus, 'pending');
    const result = balanceEquation(item.equation);
    assert.ok(Array.isArray(result.coefficients) && result.coefficients.every((x) => Number.isInteger(x) && x > 0), `${item.id}: ${item.equation} must parse and balance`);
  }
});
