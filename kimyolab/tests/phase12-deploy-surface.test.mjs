import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {computeTreeHash} from '../scripts/deploy-surface-hash.ts';

function copyTree(src,dst){
  fs.mkdirSync(dst,{recursive:true});
  for(const entry of fs.readdirSync(src,{withFileTypes:true})){
    const from=path.join(src,entry.name),to=path.join(dst,entry.name);
    if(entry.isDirectory()) copyTree(from,to); else fs.copyFileSync(from,to);
  }
}

test('canonical source deploy surface and RC release bundle are byte-identical',()=>{
  const root=process.cwd();
  const expected=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-deploy-surface-'));
  fs.copyFileSync(path.join(root,'index.html'),path.join(expected,'index.html'));
  copyTree(path.join(root,'public','app-preview'),path.join(expected,'app-preview'));
  copyTree(path.join(root,'public','content'),path.join(expected,'content'));
  if(fs.existsSync(path.join(root,'public','assets'))) copyTree(path.join(root,'public','assets'),path.join(expected,'assets'));
  const source=computeTreeHash(expected);
  const release=computeTreeHash(path.join(root,'dist-rc'),['release-manifest.json']);
  assert.equal(release.fileCount,source.fileCount);
  assert.equal(release.sha256,source.sha256);
});


test('release and production builders rebuild the deterministic content pack before packaging',()=>{
  const pkg=JSON.parse(fs.readFileSync(path.join(process.cwd(),'package.json'),'utf8'));
  assert.match(pkg.scripts['release:build'],/^npm run content:pack && npm run preview:build/);
  assert.match(pkg.scripts['prod:build'],/^npm run content:pack && npm run preview:build/);
});
