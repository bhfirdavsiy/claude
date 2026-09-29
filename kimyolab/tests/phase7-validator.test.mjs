import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

test('beta1 validator writes a 47/47 technical readiness report without auto-approving release',()=>{
  const run=spawnSync(process.execPath,['--experimental-strip-types','scripts/validate-beta1.ts'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(fs.readFileSync(new URL('../reports/beta1-readiness.json',import.meta.url),'utf8'));
  assert.equal(report.totalLearningUnits,47);
  assert.equal(report.technicalReady,47);
  assert.equal(report.releaseReady,0);
  assert.equal(report.technicalErrors,0);
  assert.ok(report.pendingApprovals>0);
});
