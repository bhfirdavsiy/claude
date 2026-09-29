// P0.8 — runtime verifies every content file against manifest SHA-256 and fails closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {ContentClient,ContentLoadError,contentErrorMessage} from '../src/app/content-client.ts';
import {sha256HexSync} from '../src/domain/content/sha256.ts';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',pointer.activeVersion);
const manifest=JSON.parse(fs.readFileSync(path.join(packRoot,'manifest.json'),'utf8'));

function fetchFor({tamper={},pack=manifest,ptr=pointer}={}){
  return async(url)=>{
    const u=String(url);
    if(u==='/content/manifest.json') return {ok:true,status:200,json:async()=>ptr};
    const rel=u.slice(`/content/${ptr.activeVersion}/`.length);
    if(rel==='manifest.json') return {ok:true,status:200,json:async()=>pack};
    const file=path.join(packRoot,rel);
    if(!fs.existsSync(file)) return {ok:false,status:404,json:async()=>({})};
    const text=tamper[rel]?tamper[rel](fs.readFileSync(file,'utf8')):fs.readFileSync(file,'utf8');
    return {ok:true,status:200,text:async()=>text,json:async()=>JSON.parse(text)};
  };
}
const isIntegrity=(e)=>e instanceof ContentLoadError&&e.code==='CONTENT_INTEGRITY_ERROR';

test('untampered pack loads through the verified path',async()=>{
  const units=await new ContentClient({fetchImpl:fetchFor(),baseUrl:'/content'}).listLearningUnits(7);
  assert.ok(units.length>0);
});

test('a single changed byte in a content file is rejected with CONTENT_INTEGRITY_ERROR',async()=>{
  const client=new ContentClient({fetchImpl:fetchFor({tamper:{'learning-units/grade-7.json':(t)=>t.replace('"title"','"titlE"')}}),baseUrl:'/content'});
  await assert.rejects(()=>client.listLearningUnits(7),isIntegrity);
});

test('same-length tampering (size unchanged) is still caught by the checksum',async()=>{
  const client=new ContentClient({fetchImpl:fetchFor({tamper:{'concepts.json':(t)=>t.replace('concept.c001','concept.c999')}}),baseUrl:'/content'});
  await assert.rejects(()=>client.loadSearchIndex(),isIntegrity);
});

test('a file absent from manifest.files is refused (no unverified reads)',async()=>{
  const pack={...manifest,files:manifest.files.filter(f=>f.path!=='concepts.json')};
  const aggregate=crypto.createHash('sha256').update(pack.files.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n')).digest('hex');
  const client=new ContentClient({fetchImpl:fetchFor({pack:{...pack,checksum:aggregate},ptr:{...pointer,checksum:aggregate}}),baseUrl:'/content'});
  await assert.rejects(()=>client.loadSearchIndex(),isIntegrity);
});

test('a manifest whose file list does not reproduce its checksum is refused',async()=>{
  const pack={...manifest,files:manifest.files.map(f=>f.path==='concepts.json'?{...f,checksum:'0'.repeat(64)}:f)};
  await assert.rejects(()=>new ContentClient({fetchImpl:fetchFor({pack}),baseUrl:'/content'}).listLearningUnits(7),isIntegrity);
});

test('a response without a readable raw body cannot be verified and is refused',async()=>{
  const base=fetchFor();
  const fetchImpl=async(url)=>{const r=await base(url);return String(url).endsWith('grade-7.json')?{ok:true,status:200,json:r.json}:r;};
  await assert.rejects(()=>new ContentClient({fetchImpl,baseUrl:'/content'}).listLearningUnits(7),isIntegrity);
});

test('integrity failure has an explicit student-facing message',()=>{
  assert.equal(contentErrorMessage(new ContentLoadError('CONTENT_INTEGRITY_ERROR'),'x').startsWith('Kontent fayli tekshiruvdan o‘tmadi.'),true);
  assert.equal(contentErrorMessage(new ContentLoadError('CONTENT_HTTP_ERROR'),'fallback'),'fallback');
});

test('pure SHA-256 fallback (for non-secure origins) matches node:crypto',()=>{
  for(const size of [0,1,55,56,63,64,65,1000,100000]){
    const bytes=crypto.randomBytes(size);
    assert.equal(sha256HexSync(new Uint8Array(bytes)),crypto.createHash('sha256').update(bytes).digest('hex'));
  }
});
