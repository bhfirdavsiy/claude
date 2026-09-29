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

test('Learning Hub exposes only chemistry+didactic approved quiz items and keeps pending items hidden',async()=>{
  const {buildLearningHubModel}=await import('../src/features/learning-hub/model.ts');
  const units=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8'));
  const theories=JSON.parse(fs.readFileSync(path.join(root,'content-src/theory-activities.json'),'utf8'));
  const practices=JSON.parse(fs.readFileSync(path.join(root,'content-src/practice-activities.json'),'utf8'));
  const mappings=JSON.parse(fs.readFileSync(path.join(root,'content-src/mapping-links.json'),'utf8'));
  const concepts=JSON.parse(fs.readFileSync(path.join(root,'content-src/concepts.json'),'utf8'));
  const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
  const pending=buildLearningHubModel('lu.9.15',{units,theories,practices,mappings,concepts,assessmentBank:bank});
  assert.equal(pending.reinforcementQuiz.items.length,0);
  assert.equal(pending.reinforcementQuiz.pendingCount,5);
  const approved=structuredClone(bank);approved.items[0].review={chemistry:'approved',didactic:'approved'};
  const model=buildLearningHubModel('lu.9.15',{units,theories,practices,mappings,concepts,assessmentBank:approved});
  assert.equal(model.reinforcementQuiz.items.length,1);
  assert.equal(model.reinforcementQuiz.pendingCount,4);
  assert.equal(model.reinforcementQuiz.items[0].id,'q.9.15.01');
});

test('Phase 11/12 pipelines validate assessment bank before release finalization',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.match(pkg.scripts['phase11:verify'],/assessment:validate/);
  assert.match(pkg.scripts['phase12:technical'],/assessment:validate/);
});
