// deploy:build (P2.8) — builds THE deployment artefact for one mount from the committed source:
//   dist-deploy/<mount>/                 ← upload this directory so it is served at the mount (default /kimyolab/)
//   dist-deploy/<mount>.manifest.json    ← what was built: mount, file list, per-file sha256, tree sha256, content version
// It reuses the production builder (scripts/build-production.ts) and only adds the deploy inputs from the ONE
// configuration surface (scripts/lib/deploy-config.ts). No timestamp is written: the same commit + inputs produce the
// same bytes (the preflight rebuilds and compares).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeTreeHash} from './deploy-surface-hash.ts';
import {resolveDeployConfig,deployPaths,DeployError,rel} from './lib/deploy-config.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

/** Build the artefact for `config` into `artifactDir`; returns the manifest (pure apart from the files it writes). */
export function buildDeployArtifact(config:ReturnType<typeof resolveDeployConfig>,artifactDir:string){
  const r=spawnSync(process.execPath,['--no-warnings',path.join(root,'scripts','build-production.ts'),artifactDir,'--base-path',config.basePath],{cwd:root,encoding:'utf8'});
  if(r.status!==0) throw new DeployError('DEPLOY_BUILD_INCOMPLETE','The production builder failed.',`run "node scripts/build-production.ts" to see the builder message: ${(r.stdout+r.stderr).trim().split('\n').pop()}`);
  // app.html is a local browser-runner alias, not part of the deployment surface
  fs.rmSync(path.join(artifactDir,'app.html'),{force:true});
  if(config.portalHomeUrl){
    const file=path.join(artifactDir,'index.html');
    const html=fs.readFileSync(file,'utf8');
    const meta=`<meta name="kimyolab-portal-home" content="${config.portalHomeUrl.replace(/"/g,'&quot;')}">`;
    fs.writeFileSync(file,html.replace(/(<meta\s+name="kimyolab-base-path"[^>]*>)/i,`$1\n  ${meta}`),'utf8');
  }
  const tree=computeTreeHash(artifactDir);
  const pointer=JSON.parse(fs.readFileSync(path.join(artifactDir,'content','manifest.json'),'utf8'));
  const content=JSON.parse(fs.readFileSync(path.join(artifactDir,'content',pointer.manifest),'utf8'));
  const files=tree.files.map(f=>{ const b=fs.readFileSync(path.join(artifactDir,f)); return {path:f,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}; });
  return {
    schema:'kimyolab.deploy-manifest.v1',
    mount:config.basePath,entry:'index.html',
    config:{basePath:config.basePath,portalHomeUrl:config.portalHomeUrl,assetBase:config.assetBase,contentBase:config.contentBase,apiBase:config.apiBase,storageNamespace:config.storageNamespace,indexedDbName:config.indexedDbName,webLockPrefix:config.webLockPrefix},
    content:{activeVersion:pointer.activeVersion,contentVersion:content.contentVersion,manifestChecksum:pointer.checksum},
    fileCount:tree.fileCount,totalBytes:files.reduce((n,f)=>n+f.bytes,0),sha256:tree.sha256,files,
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const config=resolveDeployConfig();
    const paths=deployPaths(root,config.basePath);
    fs.rmSync(paths.artifact,{recursive:true,force:true});
    fs.mkdirSync(path.dirname(paths.artifact),{recursive:true});
    const manifest=buildDeployArtifact(config,paths.artifact);
    fs.writeFileSync(paths.manifest,`${JSON.stringify(manifest,null,2)}\n`);
    console.log(JSON.stringify({status:'BUILT',artifact:rel(root,paths.artifact),manifest:rel(root,paths.manifest),mount:manifest.mount,fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,sha256:manifest.sha256,contentVersion:manifest.content.contentVersion}));
  }catch(e:any){
    console.error(e instanceof DeployError?`${e.code}: ${e.message}\n  fix: ${e.hint}`:`DEPLOY_BUILD_INCOMPLETE: ${String(e?.message??e).split('\n')[0]}`);
    process.exitCode=1;
  }
}
