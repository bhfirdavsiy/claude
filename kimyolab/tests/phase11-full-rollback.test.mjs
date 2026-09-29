import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {promoteRelease,rollbackRelease,readCurrentRelease} from '../scripts/release-registry.ts';

function makeBundle(parent,name,marker){
  const dir=path.join(parent,name);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'),marker);
  fs.writeFileSync(path.join(dir,'release-manifest.json'),JSON.stringify({releaseId:name,files:[]},null,2));
  return dir;
}

test('full release registry atomically promotes and rolls back app plus content release units',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-release-registry-'));
  const source=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-release-source-'));
  const r1=makeBundle(source,'rc-1','one');
  const r2=makeBundle(source,'rc-2','two');
  promoteRelease(root,'rc-1',r1);
  promoteRelease(root,'rc-2',r2);
  let current=readCurrentRelease(root);
  assert.equal(current.activeRelease,'rc-2');
  assert.equal(current.previousRelease,'rc-1');
  rollbackRelease(root);
  current=readCurrentRelease(root);
  assert.equal(current.activeRelease,'rc-1');
  assert.equal(current.previousRelease,'rc-2');
  assert.equal(fs.readFileSync(path.join(root,'releases','rc-1','index.html'),'utf8'),'one');
  assert.equal(fs.readFileSync(path.join(root,'releases','rc-2','index.html'),'utf8'),'two');
  assert.equal(fs.existsSync(path.join(root,'current.json.tmp')),false);
});
