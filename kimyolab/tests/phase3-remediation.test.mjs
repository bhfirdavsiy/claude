import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRemediation } from '../src/runtime/remediation/router.ts';

test('routes learning problems to the correct remediation mode',()=>{
  assert.deepEqual(routeRemediation('concept-misunderstanding'),{target:'theory'});
  assert.deepEqual(routeRemediation('visual-misconception'),{target:'simulation'});
  assert.deepEqual(routeRemediation('procedure-error'),{target:'experiment-step'});
  assert.deepEqual(routeRemediation('formula-error'),{target:'trainer'});
  assert.deepEqual(routeRemediation('equation-error'),{target:'balancing'});
  assert.deepEqual(routeRemediation('calculation-error'),{target:'calculation-hint'});
  assert.deepEqual(routeRemediation('reasoning-error'),{target:'case-example'});
});

test('rejects unknown remediation reason instead of guessing',()=>{
  assert.throws(()=>routeRemediation('other'),/REMEDIATION_REASON_UNSUPPORTED/);
});
