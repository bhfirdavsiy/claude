import fs from 'node:fs';
import path from 'node:path';
import {createRollbackPointer,type ReleasePointer} from '../src/runtime/compatibility/release-pointer.ts';

function contentRoot(projectRoot:string){return path.join(projectRoot,'public/content');}

export function readReleasePointer(projectRoot:string):ReleasePointer|undefined{
  const file=path.join(contentRoot(projectRoot),'manifest.json');
  if(!fs.existsSync(file)) return undefined;
  const value=JSON.parse(fs.readFileSync(file,'utf8')) as ReleasePointer;
  if(!value?.activeVersion||!value?.checksum||!value?.manifest) throw new Error('RELEASE_POINTER_INVALID');
  return value;
}

export function writeReleasePointerAtomic(projectRoot:string,pointer:ReleasePointer):void{
  const file=path.join(contentRoot(projectRoot),'manifest.json');
  const tmp=`${file}.tmp`;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(tmp,`${JSON.stringify(pointer,null,2)}\n`,'utf8');
  fs.renameSync(tmp,file);
}

export function rollbackContentRoot(projectRoot:string,targetVersion?:string):ReleasePointer{
  const current=readReleasePointer(projectRoot);
  if(!current) throw new Error('ROLLBACK_POINTER_NOT_FOUND');
  const target=targetVersion??current.previousVersion;
  if(!target) throw new Error('ROLLBACK_PREVIOUS_VERSION_MISSING');
  if(target!==current.previousVersion) throw new Error('ROLLBACK_TARGET_NOT_PREVIOUS');
  const manifestFile=path.join(contentRoot(projectRoot),target,'manifest.json');
  if(!fs.existsSync(manifestFile)) throw new Error('ROLLBACK_PACK_NOT_FOUND');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')) as {contentVersion?:string;checksum?:string};
  if(manifest.contentVersion!==target||typeof manifest.checksum!=='string'||!manifest.checksum) throw new Error('ROLLBACK_PACK_INVALID');
  const next=createRollbackPointer(current,{contentVersion:target,checksum:manifest.checksum});
  writeReleasePointerAtomic(projectRoot,next);
  return next;
}
