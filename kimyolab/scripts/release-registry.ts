import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export interface ReleaseRegistryPointer {
  activeRelease:string;
  previousRelease?:string;
}

function currentFile(root:string){return path.join(root,'current.json');}
function releasesRoot(root:string){return path.join(root,'releases');}

function copyDirectory(source:string,target:string){
  fs.mkdirSync(target,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){
    const from=path.join(source,entry.name);
    const to=path.join(target,entry.name);
    if(entry.isDirectory()) copyDirectory(from,to);
    else if(entry.isFile()) fs.copyFileSync(from,to);
  }
}

function writeCurrentAtomic(root:string,pointer:ReleaseRegistryPointer){
  fs.mkdirSync(root,{recursive:true});
  const file=currentFile(root);
  const tmp=`${file}.tmp`;
  fs.writeFileSync(tmp,`${JSON.stringify(pointer,null,2)}\n`,'utf8');
  fs.renameSync(tmp,file);
}

export function readCurrentRelease(root:string):ReleaseRegistryPointer{
  const file=currentFile(root);
  if(!fs.existsSync(file)) throw new Error('RELEASE_CURRENT_POINTER_MISSING');
  const value=JSON.parse(fs.readFileSync(file,'utf8')) as ReleaseRegistryPointer;
  if(!value?.activeRelease) throw new Error('RELEASE_CURRENT_POINTER_INVALID');
  return value;
}

export function promoteRelease(root:string,releaseId:string,bundlePath:string):ReleaseRegistryPointer{
  if(!releaseId||releaseId.includes('/')||releaseId.includes('\\')) throw new Error('RELEASE_ID_INVALID');
  if(!fs.existsSync(path.join(bundlePath,'release-manifest.json'))) throw new Error('RELEASE_MANIFEST_MISSING');
  const archive=path.join(releasesRoot(root),releaseId);
  if(!fs.existsSync(archive)) copyDirectory(bundlePath,archive);
  const current=fs.existsSync(currentFile(root))?readCurrentRelease(root):undefined;
  const next:ReleaseRegistryPointer={activeRelease:releaseId,...(current&&current.activeRelease!==releaseId?{previousRelease:current.activeRelease}:current?.previousRelease?{previousRelease:current.previousRelease}:{})};
  writeCurrentAtomic(root,next);
  return next;
}

export function rollbackRelease(root:string,targetRelease?:string):ReleaseRegistryPointer{
  const current=readCurrentRelease(root);
  const target=targetRelease??current.previousRelease;
  if(!target) throw new Error('RELEASE_PREVIOUS_MISSING');
  if(target!==current.previousRelease) throw new Error('RELEASE_ROLLBACK_TARGET_NOT_PREVIOUS');
  const archive=path.join(releasesRoot(root),target);
  if(!fs.existsSync(path.join(archive,'release-manifest.json'))) throw new Error('RELEASE_ARCHIVE_MISSING');
  const next:ReleaseRegistryPointer={activeRelease:target,previousRelease:current.activeRelease};
  writeCurrentAtomic(root,next);
  return next;
}

if(path.resolve(process.argv[1]??'')===path.resolve(fileURLToPath(import.meta.url))){
  const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const registryRoot=path.resolve(projectRoot,process.argv[3]??'release-registry');
  const command=process.argv[2];
  if(command==='promote'){
    const releaseId=process.argv[4]??'rc-current';
    const bundle=path.resolve(projectRoot,process.argv[5]??'dist-rc');
    console.log(JSON.stringify(promoteRelease(registryRoot,releaseId,bundle)));
  }else if(command==='rollback'){
    console.log(JSON.stringify(rollbackRelease(registryRoot,process.argv[4])));
  }else{
    console.error('USAGE: release-registry.ts promote|rollback [registryRoot] [releaseId|target] [bundle]');
    process.exitCode=2;
  }
}
