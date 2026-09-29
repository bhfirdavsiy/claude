import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runStablePreflight} from './stable-preflight.ts';
import {buildReleaseBundle} from './build-release-bundle.ts';
import {validateReleaseBundleIntegrity} from './release-bundle-integrity.ts';
import {promoteRelease} from './release-registry.ts';
import {computeTreeHash} from './deploy-surface-hash.ts';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha256File=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function finalizeStable(root=defaultRoot,releaseId?:string){
  const preflight=runStablePreflight(root);
  if(!preflight.stableReady){
    const error:any=new Error(`STABLE_PREFLIGHT_PENDING:${preflight.pending.join(',')}`);
    error.code='STABLE_PREFLIGHT_PENDING';
    error.pending=preflight.pending;
    throw error;
  }

  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const id=releaseId??`stable-v${pkg.version}`;
  const outputRoot=path.join(root,'dist-stable');
  buildReleaseBundle(root,outputRoot,id);
  const integrity=validateReleaseBundleIntegrity(outputRoot);
  if(!integrity.valid) throw new Error(`STABLE_BUNDLE_INTEGRITY_FAILED:${integrity.issues.map(x=>x.code).join(',')}`);

  const productionBuild=JSON.parse(fs.readFileSync(path.join(root,'reports/production-build.json'),'utf8'));
  const deploySurface=computeTreeHash(outputRoot,['release-manifest.json']);
  if(!productionBuild.deploySurfaceSha256||deploySurface.sha256!==productionBuild.deploySurfaceSha256||deploySurface.fileCount!==productionBuild.deployFileCount){
    throw new Error(`STABLE_DEPLOY_SURFACE_MISMATCH:${deploySurface.sha256}:${productionBuild.deploySurfaceSha256??'missing'}`);
  }

  const manifestPath=path.join(outputRoot,'release-manifest.json');
  const bundleManifestSha256=sha256File(manifestPath);
  const registryRoot=path.join(root,'release-registry');
  const archiveRoot=path.join(registryRoot,'releases',id);
  const archiveManifest=path.join(archiveRoot,'release-manifest.json');
  let registryManifestSha256=bundleManifestSha256;
  if(fs.existsSync(archiveManifest)){
    const archiveSurface=computeTreeHash(archiveRoot,['release-manifest.json']);
    if(archiveSurface.sha256!==deploySurface.sha256||archiveSurface.fileCount!==deploySurface.fileCount) throw new Error(`STABLE_RELEASE_IMMUTABILITY_CONFLICT:${id}`);
    registryManifestSha256=sha256File(archiveManifest);
  }

  const pointer=promoteRelease(registryRoot,id,outputRoot);
  const report={generatedAt:new Date().toISOString(),releaseId:id,status:'STABLE',bundleManifestSha256,registryManifestSha256,deploySurfaceSha256:deploySurface.sha256,deployFileCount:deploySurface.fileCount,integrity,pointer,preflightGeneratedAt:preflight.generatedAt};
  fs.writeFileSync(path.join(root,'reports/stable-release.json'),`${JSON.stringify(report,null,2)}\n`,'utf8');
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=finalizeStable(defaultRoot,process.argv[2]);
    console.log(JSON.stringify({releaseId:report.releaseId,status:report.status,activeRelease:report.pointer.activeRelease,manifestSha256:report.registryManifestSha256}));
  }catch(error:any){
    console.error(String(error?.message??error));
    process.exitCode=1;
  }
}
