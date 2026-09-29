import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateContentPackCompatibility} from '../src/runtime/compatibility/content-pack.ts';

const pointer={activeVersion:'2026.09.1',checksum:'abc',manifest:'2026.09.1/manifest.json'};
const manifest={contentVersion:'2026.09.1',schemaVersion:'1.0.0',checksum:'abc',compatibility:{minAppVersion:'20.1.0'}};
const app={appVersion:'20.1.0',supportedSchemaRange:{min:'1.0.0',max:'1.0.0'}};

test('compatible content pointer and pack are allowed',()=>{
  assert.deepEqual(evaluateContentPackCompatibility(pointer,manifest,app),{status:'allow',version:'2026.09.1'});
});

test('content activation blocks checksum and pointer/manifest mismatches',()=>{
  assert.equal(evaluateContentPackCompatibility({...pointer,checksum:'bad'},manifest,app).code,'CONTENT_CHECKSUM_MISMATCH');
  assert.equal(evaluateContentPackCompatibility(pointer,{...manifest,contentVersion:'2026.09.2'},app).code,'CONTENT_VERSION_POINTER_MISMATCH');
});

test('content activation blocks unsupported app or schema versions',()=>{
  assert.equal(evaluateContentPackCompatibility(pointer,{...manifest,compatibility:{minAppVersion:'21.0.0'}},app).code,'APP_VERSION_INCOMPATIBLE');
  assert.equal(evaluateContentPackCompatibility(pointer,{...manifest,schemaVersion:'2.0.0'},app).code,'SCHEMA_VERSION_INCOMPATIBLE');
});
