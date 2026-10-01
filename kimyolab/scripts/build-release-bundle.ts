import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256File} from '../src/domain/content/checksum.ts';
import {CANONICAL_BRAND_SOURCE} from './lib/host-build.ts';

interface ReleaseFile {path:string;sourcePath:string;checksum:string;size:number}

function copyTree(projectRoot:string,sourceRel:string,outputRoot:string,targetRel:string,files:ReleaseFile[]){
  const sourceRoot=path.join(projectRoot,sourceRel);
  if(!fs.existsSync(sourceRoot)) throw new Error(`RELEASE_SOURCE_MISSING:${sourceRel}`);
  const walk=(current:string)=>{
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const full=path.join(current,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.isFile()){
        if(path.relative(path.join(projectRoot,'public'),full).split(path.sep).join('/')===CANONICAL_BRAND_SOURCE) continue;
        const local=path.relative(sourceRoot,full);
        const target=path.join(outputRoot,targetRel,local);
        fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.copyFileSync(full,target);
        const relTarget=path.relative(outputRoot,target).split(path.sep).join('/');
        const sourcePath=path.relative(projectRoot,full).split(path.sep).join('/');
        const stat=fs.statSync(target);
        files.push({path:relTarget,sourcePath,checksum:sha256File(target),size:stat.size});
      }
    }
  };
  walk(sourceRoot);
}

export function buildReleaseBundle(projectRoot:string,outputRoot:string,releaseId:string){
  fs.rmSync(outputRoot,{recursive:true,force:true});
  fs.mkdirSync(outputRoot,{recursive:true});
  const files:ReleaseFile[]=[];

  const indexSource=path.join(projectRoot,'index.html');
  if(!fs.existsSync(indexSource)) throw new Error('RELEASE_INDEX_HTML_MISSING');
  const indexTarget=path.join(outputRoot,'index.html');
  fs.copyFileSync(indexSource,indexTarget);
  const indexStat=fs.statSync(indexTarget);
  files.push({path:'index.html',sourcePath:'index.html',checksum:sha256File(indexTarget),size:indexStat.size});

  copyTree(projectRoot,'public/app-preview',outputRoot,'app-preview',files);
  copyTree(projectRoot,'public/content',outputRoot,'content',files);
  if(fs.existsSync(path.join(projectRoot,'public','assets'))) copyTree(projectRoot,'public/assets',outputRoot,'assets',files);
  files.sort((a,b)=>a.path.localeCompare(b.path));

  const manifest={releaseId,createdAt:new Date().toISOString(),files};
  fs.writeFileSync(path.join(outputRoot,'release-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
  return {releaseId,fileCount:files.length,outputRoot};
}

if(path.resolve(process.argv[1]??'')===path.resolve(fileURLToPath(import.meta.url))){
  const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const outputRoot=path.resolve(projectRoot,process.argv[2]??'dist-rc');
  const releaseId=process.argv[3]??`rc-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  console.log(JSON.stringify(buildReleaseBundle(projectRoot,outputRoot,releaseId)));
}
