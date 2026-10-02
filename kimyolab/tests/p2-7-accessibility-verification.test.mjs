// P2.7 — accessibility verification: one state rule, every activity accounted for, debt recomputed only from
// measured facts, no fabricated human review, no pedagogical inflation, no runtime dependency.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {a11yStateOf,A11Y_STATES} from '../scripts/lib/accessibility-verification.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const evidence=json('reports/accessibility-browser-evidence.json');
const verification=json('reports/accessibility-verification.json');
const summary=json('reports/accessibility-gap-summary.json');
const baseline=json('reports/learning-depth-baseline.json');

const row=(checks,issues=[])=>({activityId:'x',family:'trainer',checks,issues});

test('state rule: FAILED on any failing check or missing evidence; BLOCKED only for content; NOT_APPLICABLE never counts as a pass',()=>{
  assert.equal(a11yStateOf(undefined,false).state,'NOT_APPLICABLE');
  assert.deepEqual(a11yStateOf(undefined,true),{state:'FAILED',level:null,blockedBy:[],failing:['NO_BROWSER_EVIDENCE']});
  assert.equal(a11yStateOf(row({keyboard:'PASS',reflow320:'FAIL'}),true).state,'FAILED');
  assert.equal(a11yStateOf(row({keyboard:'PASS',reflow320:'FAIL'},['CONTENT_COLOR_OBSERVATION_UNDESCRIBED']),true).state,'FAILED','a technical failure is never hidden behind a content block');
  assert.equal(a11yStateOf(row({keyboard:'PASS'},['CONTENT_COLOR_OBSERVATION_UNDESCRIBED']),true).state,'BLOCKED');
  assert.deepEqual(a11yStateOf(row({keyboard:'PASS',errorAnnouncement:'NOT_APPLICABLE'}),true),{state:'VERIFIED',level:'AUTOMATED_VERIFIED',blockedBy:[],failing:[]});
});

test('every activity of the baseline has an explicit state — none silently absent',()=>{
  assert.equal(verification.activities.length,baseline.activities.length);
  assert.deepEqual(verification.activities.map(a=>a.activityId).sort(),baseline.activities.map(a=>a.activityId).sort());
  for(const a of verification.activities) assert.ok(A11Y_STATES.includes(a.state),a.activityId);
  const launchable=baseline.activities.filter(a=>a.canSucceed!=='NOT_LAUNCHABLE').map(a=>a.activityId).sort();
  assert.deepEqual(evidence.activities.map(a=>a.activityId).sort(),launchable,'the browser sweep measured every launchable activity');
  assert.equal(verification.activities.find(a=>a.activityId==='practice.simulation.10.4').state,'NOT_APPLICABLE');
  const t=verification.totals.byState; assert.equal(t.VERIFIED+t.FAILED+t.BLOCKED+t.NOT_APPLICABLE,baseline.activities.length);
});

test('each launchable row reports every required field (D) with test evidence and unresolved issues',()=>{
  const FIELDS=['activityId','learningUnits','activityType','family','renderer','interactionDepth','keyboardOperability','focusVisibility','accessibleName','groupSemantics','statusAnnouncement','errorAnnouncement','nonColorEquivalence','zoomReflow','mobileTargetSize','reducedMotion','screenReaderTextState','testEvidence','unresolvedIssues','humanAccessibilityReview'];
  for(const a of verification.activities.filter(x=>x.state!=='NOT_APPLICABLE')) for(const f of FIELDS) assert.ok(f in a,`${a.activityId}: ${f}`);
  // a VERIFIED row has no failing check and no content block; a non-applicable check is labelled, never PASS
  for(const a of verification.activities.filter(x=>x.state==='VERIFIED')){
    assert.ok(!Object.values(a.checks).includes('FAIL'),a.activityId);
    if(a.errorAnnouncement==='NOT_APPLICABLE') assert.ok(a.errorAnnouncementNotApplicable,`${a.activityId}: reason for no error probe`);
  }
});

test('automated verification is not human review: the human count is factual (0) and no approval is fabricated',()=>{
  assert.equal(summary.totals.humanReviewed,0); assert.equal(verification.totals.humanReviewed,0);
  assert.ok(verification.activities.every(a=>a.humanAccessibilityReview==='NOT_REVIEWED'));
  for(const rel of ['reports/accessibility-verification.json','reports/accessibility-gap-summary.json','reports/accessibility-browser-evidence.json','reports/learning-depth-baseline.json'])
    assert.ok(!fs.readFileSync(path.join(root,rel),'utf8').includes('HUMAN_ACCESSIBILITY_APPROVED'),rel);
});

test('ACCESSIBILITY_UNVERIFIED is removed only where every launchable activity of the unit is VERIFIED (no blanket clearing)',()=>{
  const state=new Map(verification.activities.map(a=>[a.activityId,a.state]));
  const gap=json('reports/learning-unit-gap-map.json');
  for(const u of baseline.learningUnits){
    const acts=baseline.activities.filter(a=>a.learningUnits.includes(u.learningUnitId)&&a.canSucceed!=='NOT_LAUNCHABLE');
    const unit=gap.units.find(x=>x.learningUnitId===u.learningUnitId);
    const flagged=unit.blockingGaps.some(g=>g.gap==='ACCESSIBILITY_UNVERIFIED');
    assert.equal(flagged,acts.some(a=>state.get(a.activityId)!=='VERIFIED'),u.learningUnitId);
  }
  assert.equal(summary.affectedLearningUnits.withAccessibilityGapCount,gap.units.filter(u=>u.blockingGaps.some(g=>g.gap==='ACCESSIBILITY_UNVERIFIED')).length);
});

test('no pedagogical inflation: MODEL_BASED, learning product and overall are exactly the P2.6 numbers',()=>{
  const p=json('reports/project-progress.json');
  assert.equal(p.learningProductProgress.percent,12.189); assert.equal(p.overallManagementEstimate.percent,47.313); assert.equal(p.foundationProgress.percent,100);
  assert.equal(baseline.activities.filter(a=>a.depth==='MODEL_BASED').length,7);
  assert.equal(baseline.learningUnits.filter(u=>u.dimensions.practice==='MODEL_BASED').length,9);
  assert.ok(!JSON.stringify(p.learningProductProgress.weights).includes('accessib'),'accessibility is not a progress input');
});

test('standalone parity: every family representative gives identical results in both hosts',()=>{
  const families=[...new Set(evidence.activities.map(a=>a.family))];
  assert.equal(evidence.standaloneParity.length,families.length);
  assert.ok(evidence.standaloneParity.every(p=>p.identical));
});

test('flow plans (they contain answers) never reach the committed evidence',()=>{
  const raw=fs.readFileSync(path.join(root,'reports/accessibility-browser-evidence.json'),'utf8');
  assert.ok(!/"success"|"op":/.test(raw));
});

test('performance: no runtime dependency; the harness is test-only; the bundle delta is measured',()=>{
  const pkg=json('package.json');
  assert.equal(pkg.dependencies,undefined,'still no runtime dependency at all');
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(),['@playwright/test','@types/node','ajv','ajv-formats','fake-indexeddb','typescript','vite'],'no accessibility framework added, not even as a dev dependency');
  const perf=summary.performance;
  assert.ok(perf.delta.learnerModules===0,'no new learner module: the fixes live in existing primitives');
  // P2.9: was `perf.delta.learnerModuleBytes<8000`. The report measures the CURRENT build against the P2.6 baseline, so
  // it now also contains the P2.9 feedback-semantics growth, which P2.9 measures and records separately
  // (reports/feedback-semantics-expansion.json#bundleDelta); P2.7's own growth (the difference) keeps the same bound
  const p29=json('reports/feedback-semantics-expansion.json').bundleDelta.delta;
  const p27=perf.delta.learnerModuleBytes-p29.learnerModuleBytes;
  assert.ok(p27>0&&p27<8000,`P2.7 learner module growth stays small (${p27} B)`);
  const app=fs.readdirSync(path.join(root,'public/app-preview'),{recursive:true}).map(String);
  assert.ok(!app.some(f=>/a11y/.test(f)),'the accessibility harness never ships');
});
