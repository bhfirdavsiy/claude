// In-memory, correctly re-sealed view of the built content pack for ContentClient tests: mutate pack files
// (JSON) without touching disk, while every checksum the client verifies stays consistent.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const sha=(s)=>createHash('sha256').update(s).digest('hex');

export function memoryPackFetch(mutate={}){
  const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
  const packDir=path.join(root,'public/content',pointer.activeVersion);
  const files=new Map();
  const read=(rel)=>files.get(rel)??fs.readFileSync(path.join(packDir,rel),'utf8');
  for(const [rel,fn] of Object.entries(mutate)) files.set(rel,`${JSON.stringify(fn(JSON.parse(read(rel))),null,2)}\n`);
  const manifest=JSON.parse(fs.readFileSync(path.join(packDir,'manifest.json'),'utf8'));
  manifest.files=manifest.files.map(f=>{const body=read(f.path);return {path:f.path,checksum:sha(Buffer.from(body,'utf8')),size:Buffer.byteLength(body)};});
  manifest.checksum=sha(manifest.files.map(x=>`${x.path}:${x.checksum}:${x.size}`).join('\n'));
  files.set('manifest.json',JSON.stringify(manifest));
  const ptr={...pointer,checksum:manifest.checksum};
  return async(u)=>{u=String(u);if(u==='/content/manifest.json')return {ok:true,status:200,json:async()=>ptr};const rel=u.slice(`/content/${pointer.activeVersion}/`.length);const t=read(rel);return {ok:true,status:200,text:async()=>t,json:async()=>JSON.parse(t),arrayBuffer:async()=>new TextEncoder().encode(t).buffer};};
}
