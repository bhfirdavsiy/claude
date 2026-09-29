import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ContentClient,ContentLoadError} from '../src/app/content-client.ts';

const sha=(v)=>crypto.createHash('sha256').update(v).digest('hex');
// A minimal but integrity-valid pack: aggregate checksum reproducible from the file list.
const files=[{path:'concepts.json',checksum:sha('[]'),size:2}];
const aggregate=sha(files.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n'));

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
    {activeVersion:'2026.09.1',checksum:aggregate,manifest:'2026.09.1/manifest.json'},
    {contentVersion:'2026.09.1',schemaVersion:'1.0.0',checksum:aggregate,assessmentVersion:'2.0.0',scoringVersion:'3.0.0',compatibility:{minAppVersion:'20.1.0'},files},
  );
  assert.deepEqual(await client.getRuntimeVersions(),{contentVersion:'2026.09.1',assessmentVersion:'2.0.0',schemaVersion:'1.0.0',scoringVersion:'3.0.0'});
});
