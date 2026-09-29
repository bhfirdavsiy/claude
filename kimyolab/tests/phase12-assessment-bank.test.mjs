import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('assessment bank pilot is schema-valid and all pilot items remain fail-closed pending review',()=>{
  const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
  assert.equal(bank.schema,'kimyolab.assessment-bank.v1');
  assert.equal(bank.items.length,5);
  assert.equal(new Set(bank.items.map(x=>x.id)).size,5);
  assert.deepEqual(new Set(bank.items.map(x=>x.learningUnitId)),new Set(['lu.9.15']));
  for(const item of bank.items){
    assert.equal(item.type,'single_select');
    assert.equal(item.options.length,4);
    assert.ok(item.options.some(x=>x.id===item.correctOptionId));
    assert.equal(item.review.chemistry,'pending');
    assert.equal(item.review.didactic,'pending');
  }
});

test('assessment bank is packaged and part of PROD-002 didactic review surface',()=>{
  const pack=fs.readFileSync(path.join(root,'scripts/build-content-pack.ts'),'utf8');
  const signoff=fs.readFileSync(path.join(root,'scripts/stable-signoff-targets.ts'),'utf8');
  assert.match(pack,/assessment-items\.json/);
  assert.match(signoff,/content-src\/assessment-items\.json/);
});

// P1.1 (C3): the hub model is now built from the prompt layer (assessment/prompts.json) and exposes an
// `assessment` model without keys. The invariant is unchanged: only chemistry+didactic approved items
// are shown, pending items stay hidden. Added: the view model can never carry a key.
test('Learning Hub exposes only chemistry+didactic approved quiz items and keeps pending items hidden',async()=>{
  const {buildLearningHubModel}=await import('../src/features/learning-hub/model.ts');
  const {splitAssessmentBank}=await import('../src/domain/assessment/model.ts');
  const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
  const theories=JSON.parse(fs.readFileSync(path.join(root,'content-src/theory-activities.json'),'utf8'));
  const practices=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
  const mappings=JSON.parse(fs.readFileSync(path.join(root,'content-src/mapping-links.json'),'utf8'));
  const concepts=JSON.parse(fs.readFileSync(path.join(root,'content-src/concepts.json'),'utf8'));
  const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
  const pending=buildLearningHubModel('lu.9.15',{units,theories,practices,mappings,concepts,assessmentPrompts:splitAssessmentBank(bank).prompts});
  assert.equal(pending.assessment.items.length,0);
  assert.equal(pending.assessment.pendingCount,5);
  const approved=structuredClone(bank);approved.items[0].review={chemistry:'approved',didactic:'approved'};
  const model=buildLearningHubModel('lu.9.15',{units,theories,practices,mappings,concepts,assessmentPrompts:splitAssessmentBank(approved).prompts});
  assert.equal(model.assessment.items.length,1);
  assert.equal(model.assessment.pendingCount,4);
  assert.equal(model.assessment.items[0].id,'q.9.15.01');
  assert.doesNotMatch(JSON.stringify(model),/correctOptionId|explanation|scoringRule/);
});

test('Phase 11/12 pipelines validate assessment bank before release finalization',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.match(pkg.scripts['phase11:verify'],/assessment:validate/);
  assert.match(pkg.scripts['phase12:technical'],/assessment:validate/);
});
