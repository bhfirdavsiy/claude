import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLicensing} from '../src/runtime/governance/licensing.ts';

test('licensing validator distinguishes approved, pending and unregistered assets',()=>{
  const result=validateLicensing({
    assets:['images/assets/a.svg','fonts/a.woff2','vendor/tool.js'],
    records:[
      {pathPrefix:'images/assets/',owner:'Sinco',source:'template',license:'unknown',allowedUse:'pending',status:'pending'},
      {pathPrefix:'fonts/',owner:'Example',source:'bundle',license:'OFL-1.1',allowedUse:'redistribution',status:'approved'},
    ],
    sourceRefs:[],
  });
  assert.deepEqual(result.pendingAssets,['images/assets/a.svg']);
  assert.deepEqual(result.missingAssets,['vendor/tool.js']);
  assert.equal(result.releaseReady,false);
});

test('external source references require license metadata while internal references do not',()=>{
  const result=validateLicensing({assets:[],records:[],sourceRefs:[
    {id:'internal',type:'internal',title:'Own content'},
    {id:'external',type:'reference',title:'External chemistry table'},
    {id:'licensed',type:'reference',title:'Licensed source',license:'CC BY 4.0'},
  ]});
  assert.deepEqual(result.unlicensedSourceRefs,['external']);
  assert.equal(result.releaseReady,false);
});
