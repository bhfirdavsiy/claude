import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('mapping database preserves all 122 theory and 62 practice records',()=>{
  const theory=JSON.parse(read('data/curriculum.json'));
  const practice=JSON.parse(read('data/practices.json'));
  assert.equal(theory.length,122);
  assert.equal(practice.length,62);
});

test('theory record preserves Excel mapping fields',()=>{
  const theory=JSON.parse(read('data/curriculum.json'));
  const t=theory.find(x=>x.id==='7.01');
  assert.equal(t.title,'Kimyo fani va uning vazifalari');
  assert.equal(t.practiceType,'Case');
  assert.match(t.newOrImproved,/kundalik hayot/i);
  assert.match(t.mappingLogic,/fan xaritasi/i);
  assert.ok(t.visualFormat);
  assert.ok(t.interaction);
});

test('practice record is enriched from v19 scenario database',()=>{
  const practice=JSON.parse(read('data/practices.json'));
  const p=practice.find(x=>x.id==='7.2');
  assert.match(p.title,/sof moddani ajratish/i);
  assert.ok(Array.isArray(p.steps) && p.steps.length>=4);
  assert.ok(p.equipment);
  assert.ok(p.materials);
  assert.ok(Array.isArray(p.linkedTheoryIds) && p.linkedTheoryIds.includes('7.03'));
});

test('periodic database preserves 118 elements',()=>{
  const elements=JSON.parse(read('data/elements.json'));
  assert.equal(elements.length,118);
  assert.equal(elements[0].sym,'H');
  assert.equal(elements[117].z,118);
});

test('Sinco legacy design remains preserved while canonical index uses the modular runtime shell',()=>{
  const home=read('index.html');
  assert.match(home,/data-kimyolab-entry="canonical"/);
  assert.match(home,/id="app-main"/);
  assert.match(home,/app-preview\/app\/bootstrap\.js/);
  assert.doesNotMatch(home,/vendor\/jquery\.min\.js/);
  const legacy=read('legacy-index.html');
  assert.match(legacy,/theme-main-menu/);
  assert.match(legacy,/hero-banner-five/);
  assert.match(legacy,/theme-basic-footer/);
  assert.match(legacy,/Mavzu studiyasi/);
  assert.match(legacy,/Virtual laboratoriya/);
  const curriculum=read('curriculum.html');
  assert.match(curriculum,/theme-main-menu/);
  assert.match(curriculum,/theoryGrid/);
});
