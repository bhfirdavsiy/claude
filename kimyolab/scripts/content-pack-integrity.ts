import fs from 'node:fs';
import path from 'node:path';
import {sha256Buffer,sha256File} from '../src/domain/content/checksum.ts';

export interface PackIntegrityIssue {code:string;path?:string}

// P2.8: `contentDir` lets the deploy preflight run the SAME check on a built artefact (default: the committed pack)
export function validateContentPackIntegrity(projectRoot:string,contentDir:string=path.join(projectRoot,'public/content')){
  const issues:PackIntegrityIssue[]=[];
  const pointerFile=path.join(contentDir,'manifest.json');
  if(!fs.existsSync(pointerFile)) return {valid:false,issues:[{code:'PACK_POINTER_MISSING'}]};
  const pointer=JSON.parse(fs.readFileSync(pointerFile,'utf8'));
  if(!pointer?.activeVersion||!pointer?.checksum||!pointer?.manifest) return {valid:false,issues:[{code:'PACK_POINTER_INVALID'}]};
  const manifestFile=path.join(contentDir,pointer.manifest);
  if(!fs.existsSync(manifestFile)) return {valid:false,issues:[{code:'PACK_MANIFEST_MISSING',path:pointer.manifest}]};
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.contentVersion!==pointer.activeVersion) issues.push({code:'PACK_VERSION_POINTER_MISMATCH'});
  if(manifest.checksum!==pointer.checksum) issues.push({code:'PACK_POINTER_CHECKSUM_MISMATCH'});
  const packRoot=path.dirname(manifestFile);
  const actualEntries:Array<{path:string;checksum:string;size:number}>=[];
  for(const file of manifest.files??[]){
    const full=path.resolve(packRoot,file.path);
    const rel=path.relative(packRoot,full);
    if(rel.startsWith('..')||path.isAbsolute(rel)){issues.push({code:'PACK_FILE_PATH_INVALID',path:file.path});continue;}
    if(!fs.existsSync(full)){issues.push({code:'PACK_FILE_MISSING',path:file.path});continue;}
    const stat=fs.statSync(full);
    if(stat.size!==file.size) issues.push({code:'PACK_FILE_SIZE_MISMATCH',path:file.path});
    const checksum=sha256File(full);
    if(checksum!==file.checksum) issues.push({code:'PACK_FILE_CHECKSUM_MISMATCH',path:file.path});
    actualEntries.push({path:file.path,checksum,size:stat.size});
  }
  if(actualEntries.length===(manifest.files??[]).length){
    actualEntries.sort((a,b)=>a.path.localeCompare(b.path));
    const aggregate=sha256Buffer(actualEntries.map(x=>`${x.path}:${x.checksum}:${x.size}`).join('\n'));
    if(aggregate!==manifest.checksum) issues.push({code:'PACK_AGGREGATE_CHECKSUM_MISMATCH'});
  }
  return {valid:issues.length===0,issues};
}
