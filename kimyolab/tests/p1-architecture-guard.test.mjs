// P1.0 §31 — canonical-runtime boundaries, enforced on the AST (imports / calls), not with regexes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkSource,checkTree} from '../scripts/lib/architecture-guard.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const rules=(v)=>v.map(x=>x.rule).sort();

test('the current source tree respects every boundary',()=>{
  assert.deepEqual(checkTree(root),[]);
});

test('the guard catches the pre-P1.0 orchestration spread (service, runner) — it is not vacuous',()=>{
  // Verbatim copies of these files at tag kimyolab-p0-integrity-20.1.0 (CI checkouts have no tags).
  const old=(file)=>fs.readFileSync(path.join(root,'tests/fixtures/pre-p1',`${path.basename(file)}.txt`),'utf8');
  const service=checkSource('src/features/progress/service.ts',old('src/features/progress/service.ts'));
  assert.ok(service.some(v=>v.rule==='STATE_MUTATION_OUTSIDE_BOUNDARY'&&v.detail==='saveProgress'));
  assert.ok(service.some(v=>v.rule==='PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR'&&v.detail==='reduceProgress'));
  const runner=checkSource('src/runtime/learning-runner/runner.ts',old('src/runtime/learning-runner/runner.ts'));
  assert.ok(runner.some(v=>v.detail==='saveMastery'));
  assert.ok(runner.some(v=>v.detail==='bindEvidenceToAttempt'));
});

test('render/bootstrap/engine layers may not import persistence or transition modules',()=>{
  const v=checkSource('src/features/practice/render.ts',"import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';\nexport const x=1;");
  assert.deepEqual(rules(v),['LAYER_IMPORTS_PERSISTENCE']);
  const typeOnly=checkSource('src/app/bootstrap.ts',"import type {LearningUnitProgress} from '../runtime/progress/reducer.ts';");
  assert.deepEqual(typeOnly,[],'type-only imports carry no behaviour');
});

test('only the orchestrator/persistence boundary may mutate state or bind evidence',()=>{
  assert.deepEqual(rules(checkSource('src/features/progress/service.ts','store.updateProgress("lu",x=>x); bindDraftsToAttempt(a,b,c);')),['PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR','STATE_MUTATION_OUTSIDE_BOUNDARY']);
  assert.deepEqual(checkSource('src/runtime/learning-orchestrator/orchestrator.ts','this.store.updateProgress("lu",x=>x); bindDraftsToAttempt(a,b,c);'),[]);
  // identifiers that merely share a name are not calls on a store
  assert.deepEqual(checkSource('src/features/x.ts','const saveProgress=1; export {saveProgress};'),[]);
});

test('mastery must always be computed with an explicit version context',()=>{
  assert.deepEqual(rules(checkSource('src/domain/x.ts','computeConceptMastery({conceptId,evidence,scoringVersion});')),['MASTERY_WITHOUT_CONTEXT']);
  assert.deepEqual(checkSource('src/domain/x.ts','computeConceptMastery({conceptId,evidence,scoringVersion,context});'),[]);
});
