// P0.15.1 — the noUncheckedIndexedAccess debt may only go down; one new violation fails verify.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {repoRoot} from '../helpers/dist.mjs';
import {GATES,FIELDS} from '../../scripts/p0-acceptance.ts';

const baseline=JSON.parse(fs.readFileSync(path.join(repoRoot,'config/typecheck-ratchet.json'),'utf8'));

function projectWith(extraSource){
  // Inside the repo so that @types/node resolves exactly as in the real project.
  const dir=fs.mkdtempSync(path.join(repoRoot,'.tmp-ratchet-'));
  const include=[path.join(repoRoot,'src/**/*.ts'),path.join(repoRoot,'scripts/**/*.ts')];
  if(extraSource!==undefined){fs.writeFileSync(path.join(dir,'extra.ts'),extraSource);include.push(path.join(dir,'extra.ts'));}
  fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({extends:path.join(repoRoot,'tsconfig.json'),include}));
  return dir;
}
function ratchet(dir){return spawnSync(process.execPath,['scripts/typecheck-ratchet.mjs','--project',path.join(dir,'tsconfig.json')],{cwd:repoRoot,encoding:'utf8'});}

test('the current tree is exactly at the recorded debt (control)',()=>{
  const dir=projectWith();
  try{const r=ratchet(dir);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout.trim().split('\n')[0]).errors,baseline.maxErrors);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test(`one new unchecked indexed access (${baseline.maxErrors} → ${baseline.maxErrors+1}) fails the gate`,()=>{
  const dir=projectWith("const scores: number[] = [];\nexport const first: number = scores[0];\n");
  try{
    const r=ratchet(dir);
    assert.equal(r.status,1);
    assert.match(r.stderr,new RegExp(`TYPECHECK_RATCHET_REGRESSION: ${baseline.maxErrors+1} > ${baseline.maxErrors}`));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('typecheck:next is a verify gate, right after typecheck and before schema',()=>{
  const order=GATES.map(g=>g.id);
  assert.deepEqual(order,['lint','typecheck','typecheck:next','schema','content','chemistry','unit','integration','e2e','build']);
  assert.ok(FIELDS.typecheck.includes('typecheck:next'));
  const pkg=JSON.parse(fs.readFileSync(path.join(repoRoot,'package.json'),'utf8'));
  assert.equal(pkg.scripts.verify,'node scripts/p0-acceptance.ts');
});
