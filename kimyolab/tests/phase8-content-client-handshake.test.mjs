import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentClient,ContentLoadError} from '../src/app/content-client.ts';

function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}

function clientFor(pointer,pack){
  const fetchImpl=async(url)=>{
    if(String(url)==='/content/manifest.json') return response(pointer);
    if(String(url)===`/content/${pointer.activeVersion}/manifest.json`) return response(pack);
    return response([],200);
  };
  return new ContentClient({fetchImpl,baseUrl:'/content'});
}

test('ContentClient blocks activation when active pointer checksum does not match pack manifest',async()=>{
  const client=clientFor(
    {activeVersion:'2026.09.1',checksum:'bad',manifest:'2026.09.1/manifest.json'},
    {contentVersion:'2026.09.1',schemaVersion:'1.0.0',checksum:'good',assessmentVersion:'1',scoringVersion:'1',compatibility:{minAppVersion:'20.1.0'}},
  );
  await assert.rejects(()=>client.getRuntimeVersions(),error=>error instanceof ContentLoadError&&error.code==='CONTENT_CHECKSUM_MISMATCH');
});

test('ContentClient accepts a compatible active pack before exposing runtime versions',async()=>{
  const client=clientFor(
    {activeVersion:'2026.09.1',checksum:'good',manifest:'2026.09.1/manifest.json'},
    {contentVersion:'2026.09.1',schemaVersion:'1.0.0',checksum:'good',assessmentVersion:'2.0.0',scoringVersion:'3.0.0',compatibility:{minAppVersion:'20.1.0'}},
  );
  assert.deepEqual(await client.getRuntimeVersions(),{contentVersion:'2026.09.1',assessmentVersion:'2.0.0',schemaVersion:'1.0.0',scoringVersion:'3.0.0'});
});
