import fs from 'node:fs';
import path from 'node:path';
import {sha256File} from '../src/domain/content/checksum.ts';

export interface ReleaseIntegrityIssue {code:string;path?:string}

export function validateReleaseBundleIntegrity(bundleRoot:string){
  const issues:ReleaseIntegrityIssue[]=[];
  const manifestPath=path.join(bundleRoot,'release-manifest.json');
  if(!fs.existsSync(manifestPath)) return {valid:false,issues:[{code:'RELEASE_MANIFEST_MISSING'}]};
  let manifest:any;
  try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}
  catch{return {valid:false,issues:[{code:'RELEASE_MANIFEST_INVALID'}]};}
  if(!Array.isArray(manifest.files)) return {valid:false,issues:[{code:'RELEASE_MANIFEST_FILES_INVALID'}]};
  for(const file of manifest.files){
    if(!file||typeof file.path!=='string'||typeof file.checksum!=='string'||typeof file.size!=='number'||typeof file.sourcePath!=='string'){
      issues.push({code:'RELEASE_MANIFEST_ENTRY_INVALID',path:file?.path});
      continue;
    }
    const full=path.resolve(bundleRoot,file.path);
    const rel=path.relative(bundleRoot,full);
    if(rel.startsWith('..')||path.isAbsolute(rel)){
      issues.push({code:'RELEASE_FILE_PATH_INVALID',path:file.path});
      continue;
    }
    if(!fs.existsSync(full)){
      issues.push({code:'RELEASE_FILE_MISSING',path:file.path});
      continue;
    }
    const stat=fs.statSync(full);
    if(!stat.isFile()){
      issues.push({code:'RELEASE_FILE_NOT_REGULAR',path:file.path});
      continue;
    }
    if(stat.size!==file.size) issues.push({code:'RELEASE_FILE_SIZE_MISMATCH',path:file.path});
    if(sha256File(full)!==file.checksum) issues.push({code:'RELEASE_FILE_CHECKSUM_MISMATCH',path:file.path});
  }
  return {valid:issues.length===0,issues};
}
