// P2.8 — the ONE deployment configuration surface (ADR-P2-009). Every deploy-sensitive value is listed here, with how
// it is supplied, its default, what it is derived from and who consumes it. docs/DEPLOY.md documents the same table and
// reports/deployment-config-audit.json proves the code agrees with it. No other file may introduce a deployment
// value; derived values (asset/content/API base, storage and lock namespace) are never configured separately, so they
// cannot drift from the mount.
import path from 'node:path';
import {normalizeBasePath,storageNamespaceFor,runtimeDbName,attemptLockPrefix} from '../../src/app/host.ts';

export type DeploySettingKind='input'|'derived'|'server'|'build-output';
export interface DeploySetting { name:string; kind:DeploySettingKind; supply:string; default:string; derivedFrom?:string; consumers:string[]; note:string }

/** Production mount of the deployment target (the portal's KimyoLab section). */
export const DEFAULT_DEPLOY_BASE_PATH='/kimyolab/';

export const DEPLOY_SETTINGS:ReadonlyArray<DeploySetting>=[
  {name:'basePath',kind:'input',supply:'env KIMYOLAB_BASE_PATH (deploy:build, deploy:preflight, deploy:smoke, npm start)',default:DEFAULT_DEPLOY_BASE_PATH,
    consumers:['scripts/deploy-build.ts → <meta name="kimyolab-base-path">','src/app/host.ts (createPathHost)','server/app.mjs (normalizeMountPath)'],
    note:'the ONLY path the operator chooses; leading and trailing slash; letters, digits, . _ ~ - and / only'},
  {name:'portalHomeUrl',kind:'input',supply:'env KIMYOLAB_PORTAL_HOME_URL (deploy:build)',default:'(none — the KimyoLab header links to its own home)',
    consumers:['scripts/deploy-build.ts → <meta name="kimyolab-portal-home">','src/app/host.ts (resolveHost)'],
    note:'optional link back to the hosting portal; an absolute https URL or a root-absolute path; supplied by the portal owner, never guessed'},
  {name:'assetBase',kind:'derived',supply:'never configured',default:'= basePath',derivedFrom:'basePath',consumers:['src/app/host.ts'],note:'brand and page assets resolve under the mount'},
  {name:'contentBase',kind:'derived',supply:'never configured',default:'= basePath + "content"',derivedFrom:'basePath',consumers:['src/app/host.ts','src/app/content-client.ts'],note:'the content pack (manifest + checksummed files) is served under the mount'},
  {name:'apiBase',kind:'derived',supply:'never configured',default:'= basePath + "api/"',derivedFrom:'basePath',consumers:['src/app/host.ts','server/app.mjs'],note:'only the optional external-lab session API lives here'},
  {name:'storageNamespace',kind:'derived',supply:'never configured',default:'"kimyolab" for "/", "kimyolab@<basePath>" otherwise',derivedFrom:'basePath',consumers:['src/app/host.ts (storageNamespaceFor, runtimeDbName, attemptLockPrefix)'],note:'IndexedDB name and Web Locks prefix; two mounts on one origin never share learner data or locks'},
  {name:'environment/mode',kind:'build-output',supply:'none: there is exactly one production build; no dev/prod switch exists in the learner runtime',default:'production',consumers:['scripts/deploy-build.ts'],note:'tests build the same artefact; nothing behaves differently "in production"'},
  {name:'publicDeploymentPath',kind:'build-output',supply:'derived output directory',default:'dist-deploy/<mount>/ (dist-deploy/kimyolab/)',derivedFrom:'basePath',consumers:['scripts/deploy-build.ts','scripts/deploy-preflight.ts'],note:'upload THIS directory\'s contents so that they are served at basePath'},
  {name:'contentManifestVersion',kind:'build-output',supply:'content pack (content-src → npm run content:pack)',default:'public/content/manifest.json packVersion',consumers:['src/app/content-client.ts','scripts/deploy-preflight.ts'],note:'the pack version and per-file sha256 travel with the artefact; changing content means rebuilding'},
  {name:'PORT / HOST',kind:'server',supply:'env PORT, HOST (only for the bundled Node server, npm start)',default:'4173 / 127.0.0.1',consumers:['server.mjs'],note:'irrelevant when another web server serves the static artefact'},
  {name:'KIMYOLAB_PUBLIC_ROOT',kind:'server',supply:'env (only for the bundled Node server)',default:'./dist',consumers:['server/paths.mjs'],note:'point it at dist-deploy/<mount>/ to serve the deployment artefact'},
  {name:'external-lab secrets (NOBOOK_*)',kind:'server',supply:'server env only, never in the artefact',default:'(unset → external NOBOOK lab reports "not configured")',consumers:['server/app.mjs'],note:'optional partner integration; never needed for the KimyoLab product itself'},
];

export class DeployError extends Error {
  code:string; hint:string;
  constructor(code:string,message:string,hint:string){ super(message); this.code=code; this.hint=hint; }
}

/** Resolve the deploy inputs from the environment. Fails closed with an actionable code; never echoes secrets. */
export function resolveDeployConfig(env:Record<string,string|undefined>=process.env){
  const raw=env.KIMYOLAB_BASE_PATH??DEFAULT_DEPLOY_BASE_PATH;
  let basePath:string;
  try{ basePath=normalizeBasePath(raw); }
  catch{ throw new DeployError('DEPLOY_BASE_PATH_INVALID',`KIMYOLAB_BASE_PATH "${raw}" is not a valid mount path.`,'use a path like /kimyolab/ (leading and trailing slash; letters, digits, . _ ~ - only).'); }
  const portalHomeUrl=env.KIMYOLAB_PORTAL_HOME_URL?.trim()||null;
  if(portalHomeUrl&&!/^(https:\/\/[^\s"<>]+|\/[^\s"<>]*)$/.test(portalHomeUrl)) throw new DeployError('DEPLOY_PORTAL_HOME_INVALID','KIMYOLAB_PORTAL_HOME_URL must be an https URL or a root-absolute path.','for example https://portal.example/ or /');
  const namespace=storageNamespaceFor(basePath);
  return {
    basePath,portalHomeUrl,
    assetBase:basePath,contentBase:`${basePath}content`,apiBase:`${basePath}api/`,
    storageNamespace:namespace,indexedDbName:runtimeDbName(namespace),webLockPrefix:attemptLockPrefix(namespace),
    mountDir:mountDirName(basePath),
  };
}

/** `/kimyolab/` → `kimyolab`, `/a/b/` → `a/b`, `/` → `root` (directory name of the upload folder). */
export function mountDirName(basePath:string):string{
  const trimmed=normalizeBasePath(basePath).replace(/^\/|\/$/g,'');
  return trimmed||'root';
}

export function deployPaths(root:string,basePath:string){
  const out=path.join(root,'dist-deploy');
  return {out,artifact:path.join(out,...mountDirName(basePath).split('/')),manifest:path.join(out,`${mountDirName(basePath).replaceAll('/','_')}.manifest.json`)};
}

/** A path relative to the repository root with forward slashes — never an absolute developer path in operator output. */
export function rel(root:string,p:string):string{
  const r=path.relative(root,p).split(path.sep).join('/')||'.';
  // outside the repository: name only the last two segments, never the machine's directory layout
  return r.startsWith('..')||path.isAbsolute(r)?`<outside the repository>/${p.split(/[\\/]/).filter(Boolean).slice(-2).join('/')}`:r;
}
