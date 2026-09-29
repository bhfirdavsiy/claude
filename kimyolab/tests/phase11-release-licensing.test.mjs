import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReleaseLicensing} from '../scripts/release-licensing.ts';

test('release licensing accepts only generated student bundle provenance and rejects legacy template paths',()=>{
  const good=validateReleaseLicensing({files:[
    {path:'index.html',sourcePath:'index.html'},
    {path:'app-preview/app/bootstrap.js',sourcePath:'public/app-preview/app/bootstrap.js'},
    {path:'content/manifest.json',sourcePath:'public/content/manifest.json'},
  ],unlicensedSourceRefs:[]});
  assert.equal(good.releaseReady,true);
  const bad=validateReleaseLicensing({files:[{path:'images/x.png',sourcePath:'images/x.png'}],unlicensedSourceRefs:[]});
  assert.equal(bad.releaseReady,false);
  assert.deepEqual(bad.disallowedProvenance,['images/x.png']);
});
