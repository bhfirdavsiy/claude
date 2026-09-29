import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function computeTreeHash(root:string,exclude:string[]=[]){
  const excluded=new Set(exclude.map(x=>x.replaceAll('\\','/')));
  const files:string[]=[];
  const walk=(dir:string)=>{
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.isFile()){
        const rel=path.relative(root,full).replaceAll(path.sep,'/');
        if(!excluded.has(rel)) files.push(rel);
      }
    }
  };
  walk(root); files.sort();
  const hash=crypto.createHash('sha256');
  for(const rel of files){hash.update(rel);hash.update('\0');hash.update(fs.readFileSync(path.join(root,rel)));hash.update('\0');}
  return {fileCount:files.length,sha256:hash.digest('hex'),files};
}
