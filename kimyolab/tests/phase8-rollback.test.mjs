import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {rollbackContentRoot} from '../scripts/release-pointer-io.ts';

function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}

test('rollbackContentRoot atomically returns active pointer to previous pack',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-rollback-'));
  const content=path.join(root,'public/content');
  writeJson(path.join(content,'manifest.json'),{activeVersion:'2026.09.2',checksum:'two',manifest:'2026.09.2/manifest.json',previousVersion:'2026.09.1'});
  writeJson(path.join(content,'2026.09.1/manifest.json'),{contentVersion:'2026.09.1',checksum:'one'});
  const result=rollbackContentRoot(root);
  assert.equal(result.activeVersion,'2026.09.1');
  assert.equal(result.previousVersion,'2026.09.2');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(content,'manifest.json'),'utf8')),result);
  assert.equal(fs.existsSync(path.join(content,'manifest.json.tmp')),false);
});

test('rollbackContentRoot refuses rollback when previous pack manifest is missing',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-rollback-'));
  writeJson(path.join(root,'public/content/manifest.json'),{activeVersion:'2026.09.2',checksum:'two',manifest:'2026.09.2/manifest.json',previousVersion:'2026.09.1'});
  assert.throws(()=>rollbackContentRoot(root),/ROLLBACK_PACK_NOT_FOUND/);
});
