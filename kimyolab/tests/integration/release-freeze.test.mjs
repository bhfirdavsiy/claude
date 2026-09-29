// P0.15.6 — release freeze cannot be bypassed: wrong branch, dirty tree, or a forged acceptance report.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {repoRoot} from '../helpers/dist.mjs';
import {parsePorcelainZ} from '../../scripts/release-freeze.ts';

function sandbox(branch,acceptanceSource){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-freeze-'));
  const app=path.join(dir,'kimyolab');
  fs.mkdirSync(path.join(app,'scripts'),{recursive:true});
  fs.mkdirSync(path.join(app,'reports'),{recursive:true});
  fs.copyFileSync(path.join(repoRoot,'scripts/release-freeze.ts'),path.join(app,'scripts/release-freeze.ts'));
  if(acceptanceSource) fs.writeFileSync(path.join(app,'scripts/p0-acceptance.ts'),acceptanceSource);
  // A tracked report artefact that verify rewrites (as the real reports/*.json are).
  fs.writeFileSync(path.join(app,'reports/beta1-readiness.json'),'{"n":0}\n');
  const g=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  g('init','-q','-b',branch); g('config','user.email','t@example.invalid'); g('config','user.name','t');
  fs.writeFileSync(path.join(dir,'.gitignore'),'/kimyolab/reports/p0-acceptance.json\n/kimyolab/reports/p0-release-freeze.json\n');
  g('add','-A'); g('commit','-q','-m','init');
  // A forged "PASS" report for exactly HEAD must not be enough.
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

// Stand-in for scripts/p0-acceptance.ts: behaves like verify (rewrites a tracked report, writes the manifest).
const fakeAcceptance=(extra='')=>`import fs from 'node:fs';import {execSync} from 'node:child_process';
const head=execSync('git rev-parse HEAD').toString().trim();
fs.writeFileSync('reports/beta1-readiness.json','{"n":1}\\n');
${extra}
fs.writeFileSync('reports/p0-acceptance.json',JSON.stringify({milestone:'P0-INTEGRITY',status:'PASS',partialRun:false,typecheck:'PASS',schema:'PASS',chemistry:'PASS',contentIntegrity:'PASS',security:'PASS',evidence:'PASS',migration:'PASS',unit:'PASS',e2e:'PASS',cleanBuild:'PASS',commit:head,workingTreeCleanAtStart:true,generatedAt:new Date().toISOString(),versions:{appVersion:'20.1.0',contentVersion:'2026.09.1',contentChecksum:'x',schemaVersion:'1.0.0',scoringVersion:'0.0.0',curriculumVersion:'2026.09',dbVersion:2,progressSchemaVersion:'2.0.0'},typecheckDebt:{errors:88}}));
`;

test('happy path: verify rewriting tracked reports does not block the freeze; annotated tag carries the manifest',()=>{
  const {app,g}=sandbox('main',fakeAcceptance());
  const head=g('rev-parse','HEAD');
  const r=freeze(app);
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(g('cat-file','-t','kimyolab-p0-integrity-test'),'tag','annotated tag');
  assert.equal(g('rev-list','-n','1','kimyolab-p0-integrity-test'),head);
  const message=g('tag','-l','--format=%(contents)','kimyolab-p0-integrity-test');
  for(const key of ['appVersion','contentVersion','contentChecksum','schemaVersion','scoringVersion','curriculumVersion','dbVersion','progressSchemaVersion','typecheckDebt',head]) assert.ok(message.includes(key),key);
});

test('verify that mutates a source file blocks the freeze',()=>{
  const {app,g}=sandbox('main',fakeAcceptance("fs.writeFileSync('scripts/release-freeze.ts','// tampered');"));
  const r=freeze(app);
  assert.equal(r.status,1); assert.match(r.stderr,/RELEASE_VERIFY_MUTATED_SOURCE: scripts\/release-freeze\.ts/);
  assert.equal(g('tag'),'');
});

test('porcelain parsing keeps the status columns (regression: trimmed first line shifted the path)',()=>{
  const raw=' M kimyolab/reports/a.json\0M  kimyolab/src/b.ts\0?? kimyolab/new.txt\0R  kimyolab/c.ts\0kimyolab/old.ts\0';
  assert.deepEqual(parsePorcelainZ(raw,'kimyolab/'),['reports/a.json','src/b.ts','new.txt','c.ts']);
});

test('documented flow `npm run verify && npm run release:freeze` works (reports already rewritten)',()=>{
  const {app,g}=sandbox('main',fakeAcceptance());
  fs.writeFileSync(path.join(app,'reports/beta1-readiness.json'),'{"n":99}\n');
  const r=freeze(app);
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(g('cat-file','-t','kimyolab-p0-integrity-test'),'tag');
});
