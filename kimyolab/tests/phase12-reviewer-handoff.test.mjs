import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

test('reviewer handoff command is declared and workspace can be regenerated',()=>{
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.ok(pkg.scripts['reviewer:handoff']);
  const r=spawnSync(process.execPath,['--experimental-strip-types','scripts/generate-reviewer-workspace.ts'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.ok(fs.existsSync('review-packets/reviewer-workspace.html'));
});

test('Windows review-return importer recognizes only fail-closed approval import commands',()=>{
  const cmd=fs.readFileSync('scripts/windows/Import_KimyoLab_Review_Returns.cmd','utf8');
  assert.match(cmd,/approval:import/);
  assert.match(cmd,/beta:approvals:import/);
  assert.match(cmd,/reviewer:return:refresh/);
  assert.doesNotMatch(cmd,/approved\s*=\s*true/i);
});

test('review runbook preserves visual evidence ordering',()=>{
  const md=fs.readFileSync('docs/approvals/REVIEWER_WORKSPACE_RUNBOOK.md','utf8');
  assert.match(md,/VISUAL-001.*unrestricted browser screenshots/s);
  assert.match(md,/exact reviewer role/);
  assert.match(md,/version\/hash stale/);
});


test('browser evidence import refreshes visual reviewer workspace after targets are rebuilt',()=>{
  const cmd=fs.readFileSync('scripts/windows/Import_KimyoLab_Browser_Evidence.cmd','utf8');
  const targets=cmd.indexOf('signoff:targets');
  const workspace=cmd.indexOf('reviewer:workspace');
  const tracker=cmd.indexOf('tracker:build');
  assert.ok(targets>=0&&workspace>targets&&tracker>workspace);
});
