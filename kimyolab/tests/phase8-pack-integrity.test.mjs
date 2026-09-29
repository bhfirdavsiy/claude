import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256Buffer} from '../src/domain/content/checksum.ts';
import {validateContentPackIntegrity} from '../scripts/content-pack-integrity.ts';

function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-pack-'));
  const version='2026.09.1'; const pack=path.join(root,'public/content',version);
  const body='{"ok":true}\n'; write(path.join(pack,'data.json'),body);
  const fileHash=sha256Buffer(body); const size=Buffer.byteLength(body);
  const aggregate=sha256Buffer(`data.json:${fileHash}:${size}`);
  const manifest={contentVersion:version,schemaVersion:'1.0.0',checksum:aggregate,compatibility:{minAppVersion:'20.1.0'},files:[{path:'data.json',checksum:fileHash,size}]};
  write(path.join(pack,'manifest.json'),JSON.stringify(manifest));
  write(path.join(root,'public/content/manifest.json'),JSON.stringify({activeVersion:version,checksum:aggregate,manifest:`${version}/manifest.json`}));
  return {root,pack,manifest};
}

test('content pack integrity passes only when pointer, manifest and every file agree',()=>{
  const {root}=fixture();
  const result=validateContentPackIntegrity(root);
  assert.equal(result.valid,true);
  assert.deepEqual(result.issues,[]);
});

test('content pack integrity catches missing and modified files before release activation',()=>{
  const first=fixture(); fs.rmSync(path.join(first.pack,'data.json'));
  assert.ok(validateContentPackIntegrity(first.root).issues.some(x=>x.code==='PACK_FILE_MISSING'));
  const second=fixture(); write(path.join(second.pack,'data.json'),'tampered');
  const issues=validateContentPackIntegrity(second.root).issues.map(x=>x.code);
  assert.ok(issues.includes('PACK_FILE_SIZE_MISMATCH')||issues.includes('PACK_FILE_CHECKSUM_MISMATCH'));
});
