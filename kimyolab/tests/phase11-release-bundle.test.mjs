import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReleaseBundle} from '../scripts/build-release-bundle.ts';
import {validateReleaseBundleIntegrity} from '../scripts/release-bundle-integrity.ts';

test('buildReleaseBundle emits only the student app, runtime content, and provenance manifest',()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-dist-rc-'));
  const result=buildReleaseBundle(process.cwd(),output,'rc-test');
  assert.equal(fs.existsSync(path.join(output,'index.html')),true);
  assert.equal(fs.existsSync(path.join(output,'app-preview','app','bootstrap.js')),true);
  assert.equal(fs.existsSync(path.join(output,'content','manifest.json')),true);
  for(const legacy of ['css','js','images','fonts','vendor','inc','source']) assert.equal(fs.existsSync(path.join(output,legacy)),false,legacy);
  const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
  assert.doesNotMatch(html,/\/fonts\/gordita/i);
  const manifest=JSON.parse(fs.readFileSync(path.join(output,'release-manifest.json'),'utf8'));
  assert.equal(manifest.releaseId,'rc-test');
  assert.ok(manifest.files.length>20);
  assert.ok(manifest.files.every(file=>file.sourcePath&&file.checksum&&Number.isInteger(file.size)));
  assert.equal(validateReleaseBundleIntegrity(output).valid,true);
  assert.equal(result.fileCount,manifest.files.length);
});
