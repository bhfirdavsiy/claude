import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAppRoute } from '../src/app/routes.ts';
import { HOME_COPY } from '../src/features/home/copy.ts';
import { buildLearningHubModel } from '../src/features/learning-hub/model.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={
  units:read('content-src/learning-units.json'),
  theories:read('content-src/theory-activities.json'),
  practices:read('content-src/practice-activities.json'),
  mappings:read('content-src/mapping-links.json'),
  concepts:read('content-src/concepts.json'),
};

test('route parser resolves canonical Learning Hub deep links',()=>{
  assert.deepEqual(parseAppRoute('/learn/lu.7.03'),{name:'learning-unit',learningUnitId:'lu.7.03'});
  assert.deepEqual(parseAppRoute('/'),{name:'home'});
  assert.deepEqual(parseAppRoute('/progress'),{name:'progress'});
  assert.deepEqual(parseAppRoute('/unknown'),{name:'not-found',path:'/unknown'});
});

test('home copy preserves the approved hero title',()=>{
  assert.equal(HOME_COPY.title,'Kimyo fanini tajribalar orqali o‘rganing');
  assert.equal(HOME_COPY.primaryCta,'O‘rganishni boshlash');
});

test('Learning Hub model is canonical and strips technical metadata from student view',()=>{
  const model=buildLearningHubModel('lu.7.03',data);
  assert.equal(model.id,'lu.7.03');
  assert.equal(model.title,'Sof modda va aralashmalar');
  assert.equal(model.primaryPractice.id,'practice.experiment.7.2');
  assert.equal(model.primaryPractice.type,'experiment');
  assert.ok(model.theory.blocks.length>0);
  assert.ok(model.concepts.length>0);
  const serialized=JSON.stringify(model);
  for(const forbidden of ['coverageStatus','lifecycleStatus','approvals','legacyIds','reviewedHash','mapping.']){
    assert.equal(serialized.includes(forbidden),false,`student model leaked ${forbidden}`);
  }
});

test('Learning Hub reports structured missing-content errors',()=>{
  assert.throws(()=>buildLearningHubModel('lu.missing',data),/LEARNING_UNIT_NOT_FOUND/);
  const broken={...data,mappings:data.mappings.filter(x=>x.learningUnitId!=='lu.7.03')};
  assert.throws(()=>buildLearningHubModel('lu.7.03',broken),/PRIMARY_MAPPING_NOT_FOUND/);
});
