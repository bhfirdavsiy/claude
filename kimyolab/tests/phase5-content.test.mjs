import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const node=process.execPath;
const run=(script)=>execFileSync(node,['--experimental-strip-types',script],{cwd:root,stdio:'pipe'});
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

const expected=[
  'practice.experiment.7.2',
  'practice.simulation.7.07.planned',
  'practice.trainer.7.4',
  'practice.calculation.7.5',
  'practice.case.7.14',
  'practice.experiment.8.1',
];

test('reference activity overrides apply after legacy and planned activities exist',()=>{
  run('scripts/migrate-legacy.ts');
  const practices=read('content-src/practice-activities.json');
  for(const id of expected){
    const activity=practices.find(x=>x.id===id);
    assert.ok(activity,`missing ${id}`);
    assert.equal(activity.lifecycleStatus,'ready',`${id} should be ready`);
    assert.ok(activity.conceptIds.length>0,`${id} should carry canonical conceptIds`);
  }
});

test('reference slice configs are copied into versioned runtime pack',()=>{
  run('scripts/migrate-legacy.ts');
  run('scripts/build-content-pack.ts');
  const manifest=read('public/content/manifest.json');
  const rel=`public/content/${manifest.activeVersion}/activity-configs/reference-slices.json`;
  assert.ok(fs.existsSync(path.join(root,rel)),rel);
  const configs=read(rel);
  assert.equal(Object.keys(configs).length,6);
  for(const id of expected) assert.ok(configs[id],`missing config for ${id}`);
});
