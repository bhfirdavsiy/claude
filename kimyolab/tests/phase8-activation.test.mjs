import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivationPointer,createRollbackPointer} from '../src/runtime/compatibility/release-pointer.ts';

const pack=(contentVersion,checksum)=>({contentVersion,checksum});

test('atomic activation pointer retains the previous release when version changes',()=>{
  const current={activeVersion:'2026.09.1',checksum:'one',manifest:'2026.09.1/manifest.json'};
  assert.deepEqual(createActivationPointer(current,pack('2026.09.2','two')), {
    activeVersion:'2026.09.2',checksum:'two',manifest:'2026.09.2/manifest.json',previousVersion:'2026.09.1'
  });
});

test('rebuilding the same content version never points previousVersion at itself',()=>{
  const current={activeVersion:'2026.09.1',checksum:'old',manifest:'2026.09.1/manifest.json',previousVersion:'2026.08.4'};
  const next=createActivationPointer(current,pack('2026.09.1','new'));
  assert.equal(next.activeVersion,'2026.09.1');
  assert.equal(next.previousVersion,'2026.08.4');
});

test('rollback swaps active and previous using the target pack checksum',()=>{
  const current={activeVersion:'2026.09.2',checksum:'two',manifest:'2026.09.2/manifest.json',previousVersion:'2026.09.1'};
  assert.deepEqual(createRollbackPointer(current,pack('2026.09.1','one')), {
    activeVersion:'2026.09.1',checksum:'one',manifest:'2026.09.1/manifest.json',previousVersion:'2026.09.2'
  });
});

test('rollback rejects a target other than previousVersion',()=>{
  const current={activeVersion:'2026.09.2',checksum:'two',manifest:'2026.09.2/manifest.json',previousVersion:'2026.09.1'};
  assert.throws(()=>createRollbackPointer(current,pack('2026.08.1','old')),/ROLLBACK_TARGET_NOT_PREVIOUS/);
});
