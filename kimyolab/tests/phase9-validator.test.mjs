import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

test('beta2 validator reports all 53 units technical-ready with human approvals still pending',()=>{
  const run=spawnSync(process.execPath,['--experimental-strip-types','scripts/validate-beta2.ts'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(fs.readFileSync(new URL('../reports/beta2-readiness.json',import.meta.url),'utf8'));
  assert.equal(report.totalLearningUnits,53);
  assert.equal(report.technicalReady,53);
  assert.equal(report.releaseReady,0);
  assert.equal(report.blocked.total,0);
  assert.deepEqual(report.blocked.byDisposition,{'needs-capability':0,'needs-content':0,'remap-required':0});
  assert.ok(report.pendingApprovals>0);
  assert.equal(report.technicalErrors,0);
});
