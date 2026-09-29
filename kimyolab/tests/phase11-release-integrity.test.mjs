import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateReleaseBundleIntegrity} from '../scripts/release-bundle-integrity.ts';

test('release bundle integrity validates every manifest checksum and rejects tampering',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-release-integrity-'));
  fs.writeFileSync(path.join(root,'file.txt'),'stable');
  const checksum=createHash('sha256').update('stable').digest('hex');
  fs.writeFileSync(path.join(root,'release-manifest.json'),JSON.stringify({files:[{path:'file.txt',sourcePath:'app.html',size:6,checksum}]},null,2));
  assert.equal(validateReleaseBundleIntegrity(root).valid,true);
  fs.writeFileSync(path.join(root,'file.txt'),'tampered');
  const result=validateReleaseBundleIntegrity(root);
  assert.equal(result.valid,false);
  assert.ok(result.issues.some(x=>x.code==='RELEASE_FILE_CHECKSUM_MISMATCH'));
});
