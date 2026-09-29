// P0.15.6 — release freeze cannot be bypassed: wrong branch, dirty tree, or a forged acceptance report.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {repoRoot} from '../helpers/dist.mjs';

function sandbox(branch){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-freeze-'));
  const app=path.join(dir,'kimyolab');
  fs.mkdirSync(path.join(app,'scripts'),{recursive:true});
  fs.copyFileSync(path.join(repoRoot,'scripts/release-freeze.ts'),path.join(app,'scripts/release-freeze.ts'));
  const g=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  g('init','-q','-b',branch); g('config','user.email','t@example.invalid'); g('config','user.name','t');
  fs.writeFileSync(path.join(dir,'.gitignore'),'/kimyolab/reports/\n');
  g('add','-A'); g('commit','-q','-m','init');
  // A forged "PASS" report for exactly HEAD must not be enough.
  fs.mkdirSync(path.join(app,'reports'));
  fs.writeFileSync(path.join(app,'reports/p0-acceptance.json'),JSON.stringify({milestone:'P0-INTEGRITY',status:'PASS',commit:g('rev-parse','HEAD'),workingTreeCleanAtStart:true,generatedAt:new Date(Date.now()+86400000).toISOString(),versions:{}}));
  return {dir,app,g};
}
const freeze=(app)=>spawnSync(process.execPath,['scripts/release-freeze.ts','--tag','kimyolab-p0-integrity-test'],{cwd:app,encoding:'utf8'});

test('refuses to freeze outside main',()=>{
  const {app,g}=sandbox('feature');
  const r=freeze(app);
  assert.equal(r.status,1); assert.match(r.stderr,/RELEASE_BRANCH_MISMATCH/);
  assert.equal(spawnSync('git',['tag'],{cwd:app,encoding:'utf8'}).stdout.trim(),'');
});

test('refuses a dirty tree even with a forged PASS report',()=>{
  const {app}=sandbox('main');
  fs.writeFileSync(path.join(app,'scripts','local-edit.ts'),'export {}\n');
  const r=freeze(app);
  assert.equal(r.status,1); assert.match(r.stderr,/RELEASE_TREE_DIRTY/);
});

test('with a clean tree it re-runs acceptance itself instead of trusting the report file',()=>{
  const {app}=sandbox('main');
  const r=freeze(app); // p0-acceptance.ts does not exist in the sandbox → verify must fail
  assert.equal(r.status,1); assert.match(r.stderr,/ACCEPTANCE_NOT_PASS/);
  assert.equal(spawnSync('git',['tag'],{cwd:app,encoding:'utf8'}).stdout.trim(),'','no tag from a forged report');
});

test('freeze script has no bypass switches',()=>{
  const src=fs.readFileSync(path.join(repoRoot,'scripts/release-freeze.ts'),'utf8');
  assert.doesNotMatch(src,/allow-any-branch|--force|--skip/);
  assert.match(src,/scripts\/p0-acceptance\.ts/);
});
