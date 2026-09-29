import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {promoteRelease} from '../scripts/release-registry.ts';

function makeBundle(root,id,body='ok'){
  const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'),body);
  fs.writeFileSync(path.join(dir,'release-manifest.json'),JSON.stringify({releaseId:id,files:[]},null,2));
  return dir;
}

test('stable release registry preserves immutable archive and atomic pointer history',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-stable-registry-'));
  const registry=path.join(root,'registry');
  const a=makeBundle(root,'stable-a');
  const b=makeBundle(root,'stable-b');
  const first=promoteRelease(registry,'stable-a',a); assert.equal(first.activeRelease,'stable-a');
  const second=promoteRelease(registry,'stable-b',b); assert.equal(second.activeRelease,'stable-b'); assert.equal(second.previousRelease,'stable-a');
  assert.ok(fs.existsSync(path.join(registry,'releases','stable-a','release-manifest.json')));
  assert.ok(fs.existsSync(path.join(registry,'releases','stable-b','release-manifest.json')));
});
