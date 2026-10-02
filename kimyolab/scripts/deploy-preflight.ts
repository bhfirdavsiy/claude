// deploy:preflight (P2.8) — checks a BUILT deployment artefact before it is uploaded. Read-only: it never repairs or
// rewrites a production file. Every failure has a DEPLOY_* code, the file it concerns (repository-relative, never an
// absolute developer path) and the action that fixes it. Exit code 1 on any failure.
//
// Input: dist-deploy/<mount>/ + dist-deploy/<mount>.manifest.json for KIMYOLAB_BASE_PATH (default /kimyolab/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {computeTreeHash} from './deploy-surface-hash.ts';
import {validateContentPackIntegrity} from './content-pack-integrity.ts';
import {rootAbsoluteUrls} from './lib/host-build.ts';
import {resolveDeployConfig,deployPaths,DeployError,rel,DEPLOY_SETTINGS} from './lib/deploy-config.ts';
import {buildDeployArtifact} from './deploy-build.ts';
import {storageNamespaceFor} from '../src/app/host.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export interface PreflightCheck { id:string; pass:boolean; code?:string; message?:string; fix?:string; detail?:unknown }
/** The published check list: every id always appears in the result (no hidden scoring). */
export const PREFLIGHT_CHECKS=['config','build-complete','content-manifest','artifact-checksum','content-integrity','base-path','root-asset-leak','content-base','brand-asset','storage-namespace','service-worker','external-dependency','forbidden-files','line-endings','reproducible-build','config-match'] as const;

const REQUIRED=['index.html','app-preview/app/bootstrap.js','app-preview/ui/tokens/kimyolab.css','content/manifest.json','assets/brand/kimyolab-logo.webp'];
/** The approved brand delivery asset (P2.2 brand integration): its bytes are fixed; a different logo is a failed install. */
const BRAND_ASSET='assets/brand/kimyolab-logo.webp';

const sha=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const walk=(dir:string,ext:RegExp)=>computeTreeHash(dir).files.filter(f=>ext.test(f));

export function runPreflight(opts:{root:string;env?:Record<string,string|undefined>;artifactDir?:string;manifestFile?:string;rebuild?:boolean}):{status:'PASS'|'FAIL';mount:string|null;checks:PreflightCheck[]}{
  const checks:PreflightCheck[]=[];
  const ok=(id:string,detail?:unknown)=>checks.push({id,pass:true,...(detail!==undefined?{detail}:{})});
  const fail=(id:string,code:string,message:string,fix:string,detail?:unknown)=>checks.push({id,pass:false,code,message,fix,...(detail!==undefined?{detail}:{})});
  const done=()=>{ for(const id of PREFLIGHT_CHECKS) if(!checks.some(c=>c.id===id)) fail(id,'DEPLOY_CHECK_NOT_RUN','Not checked because an earlier check failed.','fix the first failing check and run the preflight again.'); checks.sort((a,b)=>PREFLIGHT_CHECKS.indexOf(a.id as any)-PREFLIGHT_CHECKS.indexOf(b.id as any)); return {status:checks.every(c=>c.pass)?'PASS' as const:'FAIL' as const,mount:config?.basePath??null,checks}; };

  let config:ReturnType<typeof resolveDeployConfig>|null=null;
  try{ config=resolveDeployConfig(opts.env??process.env); ok('config',{basePath:config.basePath,storageNamespace:config.storageNamespace}); }
  catch(e:any){ fail('config',e instanceof DeployError?e.code:'DEPLOY_CONFIG_INVALID',e.message,e.hint??'see docs/DEPLOY.md §Configuration'); return done(); }
  const paths=deployPaths(opts.root,config.basePath);
  const dir=opts.artifactDir??paths.artifact, manifestFile=opts.manifestFile??paths.manifest;
  const R=(p:string)=>rel(opts.root,p);

  // build-complete
  if(!fs.existsSync(dir)){ fail('build-complete','DEPLOY_BUILD_INCOMPLETE',`No deployment artefact at ${R(dir)}.`,'run "npm run deploy:build" with the same KIMYOLAB_BASE_PATH.'); return done(); }
  const missing=REQUIRED.filter(f=>!fs.existsSync(path.join(dir,f)));
  if(missing.length) fail('build-complete','DEPLOY_BUILD_INCOMPLETE',`Required files are missing from ${R(dir)}: ${missing.join(', ')}.`,'rebuild with "npm run deploy:build"; do not copy a partial directory.',{missing});
  else ok('build-complete',{required:REQUIRED.length});

  // content-manifest
  const pointerFile=path.join(dir,'content','manifest.json');
  let pointer:any=null;
  try{ pointer=JSON.parse(fs.readFileSync(pointerFile,'utf8')); if(!pointer?.manifest||!fs.existsSync(path.join(dir,'content',pointer.manifest))) throw new Error('x'); ok('content-manifest',{activeVersion:pointer.activeVersion}); }
  catch{ fail('content-manifest','DEPLOY_CONTENT_MANIFEST_MISSING',`The content pack manifest is missing or unreadable in ${R(path.join(dir,'content'))}.`,'rebuild with "npm run deploy:build" (the pack comes from npm run content:pack).'); }

  // artifact-checksum: every file listed in the deploy manifest, with its sha256, and nothing else
  let manifest:any=null;
  try{ manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')); }catch{ /* reported below */ }
  if(!manifest) fail('artifact-checksum','DEPLOY_MANIFEST_MISSING',`The deploy manifest ${R(manifestFile)} is missing.`,'rebuild with "npm run deploy:build"; ship the artefact together with its manifest.');
  else{
    const tree=computeTreeHash(dir);
    const listed=new Map<string,string>(manifest.files.map((f:any)=>[f.path,f.sha256]));
    const changed=tree.files.filter(f=>listed.get(f)!==sha(fs.readFileSync(path.join(dir,f))));
    const absent=[...listed.keys()].filter(f=>!tree.files.includes(f));
    if(changed.length||absent.length||tree.sha256!==manifest.sha256) fail('artifact-checksum','DEPLOY_CHECKSUM_MISMATCH',`${changed.length} file(s) differ from and ${absent.length} file(s) are missing compared with the deploy manifest.`,'do not edit the artefact by hand; rebuild with "npm run deploy:build" and upload it unchanged.',{changed:changed.slice(0,20),absent:absent.slice(0,20)});
    else ok('artifact-checksum',{files:tree.fileCount,sha256:tree.sha256});
  }

  // content-integrity: the same checks the app runs before it trusts a pack (fail closed in the browser too)
  const integrity=validateContentPackIntegrity(opts.root,path.join(dir,'content'));
  if(integrity.valid) ok('content-integrity'); else fail('content-integrity','DEPLOY_CHECKSUM_MISMATCH','The content pack does not match its own checksums.','rebuild the pack ("npm run content:pack") and the artefact; never edit content files after the build.',{issues:integrity.issues.slice(0,20)});

  const htmlFile=path.join(dir,'index.html');
  const html=fs.existsSync(htmlFile)?fs.readFileSync(htmlFile,'utf8'):'';
  const metaBase=html.match(/<meta\s+name="kimyolab-base-path"\s+content="([^"]*)"/i)?.[1]??null;

  // base-path: the built shell declares exactly the configured mount
  if(metaBase!==config.basePath) fail('base-path','DEPLOY_BASE_PATH_INVALID',`The artefact was built for mount "${metaBase}" but KIMYOLAB_BASE_PATH is "${config.basePath}".`,'rebuild with the mount the server will use, or set KIMYOLAB_BASE_PATH to the mount the artefact was built for.');
  else ok('base-path',{basePath:metaBase});

  // root-asset-leak: no shell URL, stylesheet url() or module import escapes the mount
  const leaks=[...rootAbsoluteUrls(html,config.basePath).map(u=>`index.html → ${u}`)];
  for(const f of walk(dir,/\.css$/)) for(const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/url\(\s*["']?(\/[^"')]*)/g)) if(!m[1]!.startsWith(config.basePath)&&!m[1]!.startsWith('//')) leaks.push(`${f} → ${m[1]}`);
  for(const f of walk(dir,/\.js$/)) for(const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/\b(?:import|from)\s*\(?\s*["'](\/[^"']*)["']/g)) leaks.push(`${f} → ${m[1]}`);
  if(leaks.length) fail('root-asset-leak','DEPLOY_ASSET_BASE_INVALID',`${leaks.length} URL(s) point outside the mount ${config.basePath}.`,'rebuild with "npm run deploy:build"; source assets must be relative or rewritten by the builder.',{leaks:leaks.slice(0,20)});
  else ok('root-asset-leak');

  // content-base: the runtime fetches <mount>content/…; the pack must be exactly there
  if(!fs.existsSync(path.join(dir,'content','manifest.json'))||metaBase!==config.basePath) fail('content-base','DEPLOY_CONTENT_BASE_INVALID',`The content pack is not reachable at ${config.contentBase}/manifest.json for this artefact.`,'keep the content/ directory inside the uploaded artefact; do not move or rename it.');
  else ok('content-base',{contentBase:config.contentBase});

  // brand-asset: the approved delivery logo, byte for byte
  const brand=path.join(dir,BRAND_ASSET), canonical=path.join(opts.root,'public',BRAND_ASSET);
  if(!fs.existsSync(brand)) fail('brand-asset','DEPLOY_BRAND_ASSET_MISSING',`${BRAND_ASSET} is missing from the artefact.`,'rebuild with "npm run deploy:build"; the brand asset is part of the build.');
  else if(fs.existsSync(canonical)&&sha(fs.readFileSync(brand))!==sha(fs.readFileSync(canonical))) fail('brand-asset','DEPLOY_BRAND_ASSET_MISMATCH',`${BRAND_ASSET} differs from the approved brand asset.`,'rebuild; never replace the logo in the artefact by hand.');
  else ok('brand-asset');

  // storage-namespace: this mount's IndexedDB/Web Locks namespace must differ from every co-hosted KimyoLab mount
  const others=String((opts.env??process.env).KIMYOLAB_CO_HOSTED_MOUNTS??'').split(',').map(s=>s.trim()).filter(Boolean);
  let clash:string[]=[];
  try{ clash=others.filter(m=>storageNamespaceFor(m)===config!.storageNamespace); }catch{ clash=['(invalid KIMYOLAB_CO_HOSTED_MOUNTS entry)']; }
  if(clash.length) fail('storage-namespace','DEPLOY_STORAGE_NAMESPACE_COLLISION',`Mount ${config.basePath} would share learner storage with: ${clash.join(', ')}.`,'give each KimyoLab deployment on one origin its own mount path.');
  else ok('storage-namespace',{namespace:config.storageNamespace,indexedDb:config.indexedDbName,webLocks:config.webLockPrefix,coHosted:others});

  // service-worker: none may be shipped or registered (it could claim scope beyond the mount)
  const sw=[...walk(dir,/(^|\/)(sw|service-worker)[^/]*\.js$/),...walk(dir,/\.js$/).filter(f=>/serviceWorker\s*\.\s*register\s*\(/.test(fs.readFileSync(path.join(dir,f),'utf8')))];
  if(sw.length) fail('service-worker','DEPLOY_SERVICE_WORKER_PRESENT',`A service worker is shipped or registered: ${sw.join(', ')}.`,'remove it; a worker registered under a portal can intercept pages outside the KimyoLab mount.',{files:sw});
  else ok('service-worker');

  // external-dependency: the learner shell loads nothing from another origin (external labs are opt-in content links)
  const ext:string[]=[];
  for(const m of html.matchAll(/\b(?:src|href)="(https?:)?\/\/([^"/]+)/g)) ext.push(`index.html → ${m[2]}`);
  for(const f of walk(dir,/\.css$/)) for(const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/(?:@import|url\()\s*["']?(?:https?:)?\/\/([^"'/)]+)/g)) ext.push(`${f} → ${m[1]}`);
  for(const f of walk(dir,/\.js$/)) for(const m of fs.readFileSync(path.join(dir,f),'utf8').matchAll(/\b(?:import|from)\s*\(?\s*["'](?:https?:)?\/\/([^"'/]+)/g)) ext.push(`${f} → ${m[1]}`);
  if(ext.length) fail('external-dependency','DEPLOY_EXTERNAL_DEPENDENCY',`${ext.length} script/style/import reference(s) load from another origin.`,'vendor the dependency into the build or remove it; the product must run from its own mount.',{references:ext.slice(0,20)});
  else ok('external-dependency');

  // forbidden-files: only public artefacts (same rule as the production builder)
  const forbidden=computeTreeHash(dir).files.filter(f=>/(^|\/)\./.test(f)||/\.(ts|mjs|map|md|xlsx|env|sh|bat|ps1|cmd|pem|key)$/i.test(f)||/^(src|scripts|tests|docs|reports|review-packets|content-src|schemas|config|source|server|node_modules)\//.test(f)||/package(-lock)?\.json$/.test(f));
  if(forbidden.length) fail('forbidden-files','DEPLOY_FORBIDDEN_FILE',`${forbidden.length} non-public file(s) are in the artefact.`,'rebuild with "npm run deploy:build"; never add files to the artefact by hand.',{files:forbidden.slice(0,20)});
  else ok('forbidden-files');

  // line-endings: build OUTPUT text is canonical (LF only) so every OS ships the same bytes; binaries are untouched
  const crlf=computeTreeHash(dir).files.filter(f=>/\.(html|js|css|json|ya?ml|svg|txt)$/i.test(f)&&fs.readFileSync(path.join(dir,f)).includes(0x0d));
  if(crlf.length) fail('line-endings','DEPLOY_LINE_ENDINGS_NONCANONICAL',`${crlf.length} text file(s) contain carriage returns (CRLF).`,'check out with the repository .gitattributes (no EOL conversion) and rebuild; a CRLF checkout builds different bytes than Linux.',{files:crlf.slice(0,20)});
  else ok('line-endings');

  // reproducible-build: rebuilding the same commit with the same inputs gives the same bytes
  if(opts.rebuild!==false&&manifest){
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-preflight-'));
    try{
      const again=buildDeployArtifact(config,path.join(tmp,'artifact'));
      if(again.sha256!==manifest.sha256) fail('reproducible-build','DEPLOY_NOT_REPRODUCIBLE','Rebuilding this commit with the same configuration gives different bytes than the artefact.','the artefact was built from different sources or inputs: rebuild it from this commit with "npm run deploy:build".',{artifact:manifest.sha256,rebuilt:again.sha256});
      else ok('reproducible-build',{sha256:again.sha256});
    }catch(e:any){ fail('reproducible-build',e instanceof DeployError?e.code:'DEPLOY_NOT_REPRODUCIBLE','The comparison rebuild failed.',e.hint??'run "npm run deploy:build" to see the builder message.'); }
    finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
  }else if(opts.rebuild===false) ok('reproducible-build',{skipped:'rebuild disabled by the caller'});

  // config-match: the manifest records the same configuration the operator supplies now
  if(manifest){
    const diff=['basePath','portalHomeUrl','storageNamespace'].filter(k=>manifest.config?.[k]!==(config as any)[k]);
    if(diff.length) fail('config-match','DEPLOY_CONFIG_MISMATCH',`The artefact was built with a different ${diff.join(', ')} than the current configuration.`,'use the same KIMYOLAB_* values for build, preflight and server (docs/DEPLOY.md §Configuration).',{fields:diff});
    else ok('config-match');
  }
  return done();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=runPreflight({root,rebuild:!process.argv.includes('--no-rebuild')});
  const report={schema:'kimyolab.deployment-preflight.v1',semantics:'Read-only checks of the built deployment artefact (scripts/deploy-preflight.ts). Fails closed; never repairs a file.',settings:DEPLOY_SETTINGS.filter(s=>s.kind==='input').map(s=>s.name),...result,summary:{checks:result.checks.length,pass:result.checks.filter(c=>c.pass).length}};
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports','deployment-preflight.json'),`${JSON.stringify(report,null,2)}\n`);
  for(const c of result.checks) console.log(`${c.pass?'✓':'✗'} ${c.id}${c.pass?'':` — ${c.code}: ${c.message}\n    fix: ${c.fix}`}`);
  console.log(`deploy:preflight ${result.status} (${report.summary.pass}/${report.summary.checks}) for mount ${result.mount??'(invalid)'}`);
  if(result.status!=='PASS') process.exitCode=1;
}
