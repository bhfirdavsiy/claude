import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));

test('content pack contains versioned chemistry datasets with manifest checksums',()=>{
  execFileSync(process.execPath,['--experimental-strip-types','scripts/build-content-pack.ts'],{cwd:root,stdio:'pipe'});
  const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
  const dir=path.join(root,'public/content',active.activeVersion);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  for(const rel of ['chemistry/species.json','chemistry/reactions.json','chemistry/solubility.json','chemistry/constants.json']){
    assert.equal(fs.existsSync(path.join(dir,rel)),true,rel);
    assert.ok(manifest.files.some(x=>x.path===rel&&x.checksum&&x.size>0),rel);
  }
});

test('chemistry validator writes machine-readable zero-error technical report',()=>{
  execFileSync(process.execPath,['--experimental-strip-types','scripts/validate-chemistry.ts'],{cwd:root,stdio:'pipe'});
  const report=JSON.parse(fs.readFileSync(path.join(root,'reports/chemistry-validation.json'),'utf8'));
  assert.ok(report.speciesRecords>=71);
  assert.ok(report.reactionRecords>=27);
  assert.equal(report.formulaErrors,0);
  assert.equal(report.reactionBalanceErrors,0);
  assert.equal(report.referenceErrors,0);
  assert.equal(report.unknownReactionPolicy,'REACTION_NOT_MODELED');
});
