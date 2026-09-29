import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { balanceEquation } from '../src/domain/chemistry/equation-balancer.ts';

const file=new URL('./chemistry-corpus/equations.json',import.meta.url);

test('technical molecular balancing corpus contains 200 versioned cases and balances 100%',()=>{
  const corpus=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(corpus.kind,'algorithm-regression');
  assert.equal(corpus.expertApproved,false);
  assert.equal(corpus.cases.length,200);
  for(const c of corpus.cases){
    assert.deepEqual(balanceEquation(c.equation).coefficients,c.expectedCoefficients,c.id);
  }
});
