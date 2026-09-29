import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));

test('migration supports explicit Beta2 practice additions and preserves replaced legacy primaries as supporting',()=>{
  const run=spawnSync('npm',['run','content:migrate'],{cwd:new URL('..',import.meta.url),encoding:'utf8',shell:true});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const practices=read('content-src/practice-activities.json');
  const mappings=read('content-src/mapping-links.json');
  const expected={
    'lu.9.18':'practice.simulation.9.18.water-hardness',
    'lu.9.20':'practice.simulation.9.20.cu-ag-au',
    'lu.9.21':'practice.simulation.9.21.group12',
    'lu.9.25':'practice.case.9.25.steel-process',
  };
  for(const [unitId,practiceId] of Object.entries(expected)){
    assert.ok(practices.some(p=>p.id===practiceId),`missing ${practiceId}`);
    const primary=mappings.find(m=>m.learningUnitId===unitId&&m.role==='primary');
    assert.equal(primary.practiceActivityId,practiceId,unitId);
    assert.equal(primary.coverageStatus,'full',unitId);
    assert.ok(mappings.some(m=>m.learningUnitId===unitId&&m.role==='supporting'),`${unitId} previous practice not preserved`);
  }
});

test('grade 10 semantic mapping gaps use explicit canonical primaries and preserve legacy activities as supporting',()=>{
  const run=spawnSync('npm',['run','content:migrate'],{cwd:new URL('..',import.meta.url),encoding:'utf8',shell:true});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const practices=read('content-src/practice-activities.json');
  const mappings=read('content-src/mapping-links.json');
  const expected={
    'lu.10.17':'practice.simulation.10.17.monohydric-alcohols',
    'lu.10.19':'practice.simulation.10.19.phenols',
    'lu.10.21':'practice.simulation.10.21.carbonyls',
    'lu.10.22':'practice.experiment.10.22.carboxylic-acid',
    'lu.10.23':'practice.simulation.10.23.esters',
    'lu.10.26':'practice.trainer.10.26.fibers',
  };
  for(const [unitId,practiceId] of Object.entries(expected)){
    assert.ok(practices.some(p=>p.id===practiceId),`missing ${practiceId}`);
    const primary=mappings.find(m=>m.learningUnitId===unitId&&m.role==='primary');
    assert.equal(primary.practiceActivityId,practiceId,unitId);
    assert.equal(primary.coverageStatus,'full',unitId);
    assert.ok(mappings.some(m=>m.learningUnitId===unitId&&m.role==='supporting'),`${unitId} previous practice not preserved`);
  }
});
