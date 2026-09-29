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

// P1.0 closeout §10 — the usual ways around a name-based guard are all caught.
test('guard bypass attempts are caught: alias, namespace, element access, destructuring, re-export, helper',()=>{
  const f='src/features/progress/service.ts';
  const has=(src,rule,detail)=>{const v=checkSource(f,src);assert.ok(v.some(x=>x.rule===rule&&(detail===undefined||x.detail.includes(detail))),`${rule} not reported for: ${src}\n${JSON.stringify(v)}`);};
  // aliased import of a boundary function, then a call under the alias
  has("import {bindDraftsToAttempt as bind} from '../../runtime/evidence/types.ts'; bind(a,b,c);",'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR','bindDraftsToAttempt');
  has("import {reduceProgress as r} from '../../runtime/progress/reducer.ts'; r(p,e);",'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR','reduceProgress');
  // namespace import of the transition module
  has("import * as R from '../../runtime/progress/reducer.ts'; R.reduceProgress(p,e);",'PROGRESS_TRANSITION_OUTSIDE_ORCHESTRATOR');
  // element access with a literal key, and a detached method reference
  has("store['updateProgress']('lu',x=>x);",'STATE_MUTATION_OUTSIDE_BOUNDARY','updateProgress');
  has("store[`saveMastery`](m);",'STATE_MUTATION_OUTSIDE_BOUNDARY','saveMastery');
  has("const f=store.recordAttempt.bind(store); f(a,[]);",'STATE_MUTATION_OUTSIDE_BOUNDARY','recordAttempt');
  // destructuring (plain and renamed)
  has("const {updateProgress}=store; updateProgress('lu',x=>x);",'STATE_MUTATION_OUTSIDE_BOUNDARY','updateProgress');
  has("const {saveProgress:write}=store; write(p);",'STATE_MUTATION_OUTSIDE_BOUNDARY','saveProgress');
  // re-export laundering from a non-privileged module
  has("export {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';",'REEXPORT_OF_BOUNDARY_MODULE');
  has("export * from '../../runtime/progress/reducer.ts';",'REEXPORT_OF_BOUNDARY_MODULE');
  has("export {bindDraftsToAttempt} from '../../runtime/evidence/types.ts';",'REEXPORT_OF_BOUNDARY_MODULE','bindDraftsToAttempt');
  // an indirect helper still has to perform the mutation somewhere — and that place is flagged
  has("export function persist(s,p){ return s.saveProgress(p); }",'STATE_MUTATION_OUTSIDE_BOUNDARY','saveProgress');
  // presentation layers: namespace/default imports of persistence are layer violations too
  assert.ok(checkSource('src/features/practice/render.ts',"import * as S from '../../runtime/progress/indexeddb-store.ts';").some(v=>v.rule==='LAYER_IMPORTS_PERSISTENCE'));
  // aliased mastery computation still needs an explicit context
  assert.ok(checkSource('src/domain/x.ts',"import {computeConceptMastery as cm} from './mastery.ts'; cm({conceptId,evidence,scoringVersion});").some(v=>v.rule==='MASTERY_WITHOUT_CONTEXT'));
  // privileged modules are unaffected
  assert.deepEqual(checkSource('src/runtime/learning-orchestrator/orchestrator.ts',"import {reduceProgress as r} from '../progress/reducer.ts'; const {updateProgress}=this.store; r(p,e);"),[]);
});
