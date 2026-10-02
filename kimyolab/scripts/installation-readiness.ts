// deploy:readiness (P2.8) — Installation Readiness: a SEPARATE metric (ADR-P2-009). It is not an input of the
// 0.4 × foundation + 0.6 × learning-product formula and never changes a learning number.
//
// Writes (facts only):
//   reports/ci-reproducibility.json       — pinned runners, verified action runtimes, application Node, toolchain
//   reports/deployment-config-audit.json  — the one configuration surface vs the code (no hidden host/path)
//   reports/deployment-artifacts.json     — exactly what is shipped (paths, file counts, sizes, sha256, content version)
//   reports/installation-readiness.json   — every published check with its evidence; percent = passed / total
// Inputs it reads: dist-deploy/<mount>.manifest.json and the reports of deploy:preflight, deploy:smoke,
// deploy:rollback-drill, deploy:drill, host:readiness and the standalone smokes. A check whose evidence is missing or
// belongs to a different artefact FAILS (no stale evidence).  `--strict` exits 1 unless every check passes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DEPLOY_SETTINGS,DEFAULT_DEPLOY_BASE_PATH,resolveDeployConfig,deployPaths,rel} from './lib/deploy-config.ts';
import {readWorkflows,workflowFindings,declaredToolchain,VERIFIED_ACTIONS,PINNED_RUNNERS} from './lib/ci-workflow.ts';
import {runPreflight,PREFLIGHT_CHECKS} from './deploy-preflight.ts';
import {computeTreeHash} from './deploy-surface-hash.ts';
import {bundle} from './lib/computed-model-interaction.ts';
import {resolveRollbackBaseline} from './lib/rollback-baseline.ts';
import {createCommitBuilder} from './lib/commit-artifact.ts';
import {readAcceptance} from './lib/target-acceptance.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repoTop=path.resolve(root,'..');
const readJson=(rel:string)=>{ const f=path.join(root,rel); return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null; };
const write=(rel:string,data:unknown)=>fs.writeFileSync(path.join(root,rel),`${JSON.stringify(data,null,2)}\n`);

/** Literals in learner/server code that look like a host or a deployment path, and why each allowed one is allowed. */
const ALLOWED_HOST_LITERALS:Record<string,string>={
  'kimyolab.invalid':'reserved .invalid parse base for new URL() — never fetched',
  'nbapi.nobook.com':'external-lab partner API default (server-side, optional, overridable by NOBOOK_AUTH_URL)',
  'nobook.com':'external-lab provider allow-list (url-policy): the only origins an external lab may frame',
  'chemai.in':'external-lab provider allow-list (url-policy)',
  'chemlaboratory.vercel.app':'external-lab provider allow-list (url-policy)',
};
/** Environment variables read by tooling that are NOT deployment configuration. */
const NON_DEPLOY_ENV:Record<string,string>={
  CHROME_BIN:'test/smoke tooling: which Chromium binary to drive',KIMYOLAB_BROWSER_HOST:'browser-gate tooling',PROGRAMFILES:'Windows browser discovery (tooling)',LOCALAPPDATA:'Windows browser discovery (tooling)',
  KIMYOLAB_SESSION_RATE_LIMIT:'server tuning (optional; documented in DEPLOY.md)',KIMYOLAB_STATUS_RATE_LIMIT:'server tuning (optional; documented in DEPLOY.md)',KIMYOLAB_ALLOWED_ORIGINS:'server CORS allow-list for the optional session API (documented in DEPLOY.md)',
  NOBOOK_APP_KEY:'external-lab secret (server env only)',NOBOOK_APP_SECRET:'external-lab secret (server env only)',NOBOOK_PID_SCOPE:'external-lab setting',NOBOOK_EXPERIMENT_URL:'external-lab setting',NOBOOK_SDK_SHA256:'external-lab setting',NOBOOK_SDK_VERSION:'external-lab setting',NOBOOK_AUTH_URL:'external-lab setting',NOBOOK_IDENTITY_KEY:'external-lab secret (server env only)',
};

function configAudit(){
  const files:string[]=[];
  const walk=(d:string)=>{ for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){ const r=`${d}/${e.name}`; if(e.isDirectory()) walk(r); else if(/\.(ts|mjs)$/.test(e.name)) files.push(r); } };
  walk('src'); walk('server'); files.push('index.html','server.mjs');
  const stripComments=(s:string)=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:"'`\\])\/\/.*$/gm,'$1').replace(/<!--[\s\S]*?-->/g,'');
  const hosts:Array<{file:string;literal:string;allowed:boolean;reason:string}>=[]; const paths:Array<{file:string;literal:string}>=[]; const env=new Set<string>();
  for(const f of files){
    const code=stripComments(fs.readFileSync(path.join(root,f),'utf8'));
    for(const m of code.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.push({file:f,literal:m[1]!,allowed:m[1]! in ALLOWED_HOST_LITERALS,reason:ALLOWED_HOST_LITERALS[m[1]!]??'NOT ALLOWED'});
    for(const m of code.matchAll(/['"`]([a-z0-9-]+\.(?:com|uz|app|in|org|net|io|ru))['"`]/gi)) hosts.push({file:f,literal:m[1]!,allowed:m[1]! in ALLOWED_HOST_LITERALS,reason:ALLOWED_HOST_LITERALS[m[1]!]??'NOT ALLOWED'});
    for(const m of code.matchAll(/['"`](\/kimyolab\b[^'"`]*)['"`]/g)) paths.push({file:f,literal:m[1]!});
    for(const m of code.matchAll(/\benv(?:\.|\[['"])([A-Z][A-Z0-9_]{3,})/g)) env.add(m[1]!);
  }
  const deployDoc=fs.existsSync(path.join(root,'docs/DEPLOY.md'))?fs.readFileSync(path.join(root,'docs/DEPLOY.md'),'utf8'):'';
  const envNames=['KIMYOLAB_BASE_PATH','KIMYOLAB_PORTAL_HOME_URL','KIMYOLAB_PUBLIC_ROOT','KIMYOLAB_CO_HOSTED_MOUNTS','KIMYOLAB_SMOKE_URL','KIMYOLAB_ROLLBACK_FROM','PORT','HOST'];
  const undocumentedSettings=DEPLOY_SETTINGS.filter(s=>!deployDoc.includes(s.name.split(' ')[0]!)).map(s=>s.name);
  const undocumentedEnv=[...envNames,...[...env].filter(e=>!(e in NON_DEPLOY_ENV))].filter(e=>!deployDoc.includes(e));
  const unknownEnv=[...env].filter(e=>!envNames.includes(e)&&!(e in NON_DEPLOY_ENV)).sort();
  const violations=[...hosts.filter(h=>!h.allowed).map(h=>`hardcoded host ${h.literal} in ${h.file}`),...paths.map(p=>`hardcoded deployment path ${p.literal} in ${p.file}`),...unknownEnv.map(e=>`environment variable ${e} is read but is not part of the configuration surface`),...undocumentedSettings.map(s=>`setting ${s} is not documented in docs/DEPLOY.md`),...undocumentedEnv.map(e=>`variable ${e} is not documented in docs/DEPLOY.md`)];
  return {
    schema:'kimyolab.deployment-config-audit.v1',
    semantics:'Every deploy-sensitive value, how it is supplied and who consumes it (scripts/lib/deploy-config.ts), checked against the code: learner/server sources (comments excluded) may not hardcode a host or the deployment path, may not read an undeclared environment variable, and every setting must be documented in docs/DEPLOY.md.',
    onePlace:{code:'scripts/lib/deploy-config.ts (DEPLOY_SETTINGS)',guide:'docs/DEPLOY.md §3 Configuration',defaultMount:DEFAULT_DEPLOY_BASE_PATH},
    settings:DEPLOY_SETTINGS,
    derivedForDefaultMount:resolveDeployConfig({}),
    scanned:{files:files.length,roots:['src/**','server/**','server.mjs','index.html']},
    hostLiterals:[...new Map(hosts.map(h=>[`${h.file}|${h.literal}`,h])).values()],
    deploymentPathLiterals:paths,
    environmentVariables:{deploy:envNames,nonDeploy:NON_DEPLOY_ENV,readButUndeclared:unknownEnv},
    portalHomeUrlNote:'resolved at the host boundary (src/app/host.ts) and written by deploy:build when supplied; no learner screen links to it yet — supplying it changes nothing visible today (reported, not hidden)',
    violations,status:violations.length?'FAIL':'PASS',
  };
}

function artifacts(){
  const cfg=resolveDeployConfig(process.env);
  const paths=deployPaths(root,cfg.basePath);
  const manifest=fs.existsSync(paths.manifest)?JSON.parse(fs.readFileSync(paths.manifest,'utf8')):null;
  const standalone=path.join(root,'dist-standalone','KimyoLab_standalone.html');
  const sbuf=fs.existsSync(standalone)?fs.readFileSync(standalone):null;
  const current=manifest&&fs.existsSync(paths.artifact)?computeTreeHash(paths.artifact).sha256:null;
  return {
    schema:'kimyolab.deployment-artifacts.v1',
    semantics:'Exactly what is shipped. The production artefact is a static directory served at the mount; the standalone file is the same product for offline presentation. No build timestamp is recorded: the build is deterministic (same commit + inputs → same sha256, checked by deploy:preflight and deploy:drill).',
    production:manifest?{
      buildCommand:'npm run deploy:build',outputPath:rel(root,paths.artifact)+'/',manifestPath:rel(root,paths.manifest),
      uploadInstruction:`upload the CONTENTS of ${rel(root,paths.artifact)}/ so that they are served at ${manifest.mount}`,
      requiredServerMount:manifest.mount,entryDocument:`${manifest.mount}${manifest.entry}`,
      spaFallback:`every ${manifest.mount}* path that is not a file → ${manifest.mount}index.html (see docs/DEPLOY.md §5)`,
      fileCount:manifest.fileCount,totalBytes:manifest.totalBytes,sha256:manifest.sha256,
      content:manifest.content,config:manifest.config,
      matchesBuiltDirectory:current===manifest.sha256,
    }:{status:'NOT_BUILT',buildCommand:'npm run deploy:build'},
    standalone:sbuf?{buildCommand:'npm run standalone:build',path:'dist-standalone/KimyoLab_standalone.html',alias:'dist-standalone/index.html',bytes:sbuf.length,sha256:crypto.createHash('sha256').update(sbuf).digest('hex'),
      delivery:'one HTML file; opens from disk (hash routes, embedded content pack with the same integrity checks); external laboratories that need the network stay network-dependent and say so'}:{status:'NOT_BUILT',buildCommand:'npm run standalone:build'},
    learnerBundle:{method:'raw bytes of the committed learner modules (public/app-preview/**/*.js), the shared stylesheet and the standalone file',before:{learnerModules:162,learnerModuleBytes:702745,cssBytes:33709,standaloneBytes:5691105,source:'P2.7 close (reports/accessibility-gap-summary.json#performance.after)'},
      after:{...(({learnerModules,learnerModuleBytes,standaloneBytes})=>({learnerModules,learnerModuleBytes,standaloneBytes}))(bundle(root)),cssBytes:fs.statSync(path.join(root,'public/app-preview/ui/tokens/kimyolab.css')).size},
      note:'deployment tooling is operator-side (scripts/, never copied into the artefact by the builder)'},
  };
}

function ciReproducibility(){
  const jobs=readWorkflows(repoTop);
  const findings=workflowFindings(jobs);
  return {
    schema:'kimyolab.ci-reproducibility.v1',
    semantics:'The DECLARED CI environment, read from the workflow files and the lockfile (deterministic). Each run also records its OBSERVED environment (npm run ci:environment → reports/ci-environment.observed.json, uploaded as a CI artefact and shown in the job summary); the run fails if the application Node major differs from .nvmrc.',
    runners:{pinned:PINNED_RUNNERS,why:'a *-latest label can move to a new OS image without notice; the verification OS must change only by a reviewed commit'},
    actions:{verified:VERIFIED_ACTIONS,why:'Node-20 action runtimes are deprecated on GitHub-hosted runners; the v7 majors declare runs.using: node24. The GitHub Action runtime is unrelated to the application Node version.'},
    toolchain:declaredToolchain(root),
    jobs,findings,
    status:Object.entries(findings).filter(([k])=>!['floatingRunners','unverifiedActions'].includes(k)).every(([,v])=>v===true)?'PASS':'FAIL',
  };
}

/** run the preflight on a deliberately broken COPY: every failure must carry a code, a fix and no absolute path */
/** the rollback report's baseline must be exactly what the resolver selects now (full SHA), and differ from the current artefact */
function rollbackBaselineMatches(rollback:any,currentSha:string|null){
  if(!rollback?.previous?.commit||!currentSha) return false;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-baseline-'));
  try{
    const build=createCommitBuilder(root,tmp,resolveDeployConfig(process.env).basePath);
    const r=resolveRollbackBaseline(root,{differs:(c:string)=>build(c).sha256!==currentSha});
    return r.commit===rollback.previous.commit&&rollback.previous.sha256!==currentSha&&/^[0-9a-f]{40}$/.test(r.commit);
  }catch{ return false; }
  finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
}

/** what the CI workflow is configured to run (a fact about the repository, not about a CI run) */
function ciGate(){
  const wf=fs.readFileSync(path.join(repoTop,'.github/workflows/kimyolab-verify.yml'),'utf8');
  const steps={verify:/npm run verify\b/,deployBuild:/npm run deploy:build\b/,preflight:/npm run deploy:preflight\b/,smoke:/npm run deploy:smoke\b/,rollbackDrill:/npm run deploy:rollback-drill\b/,cleanDrill:/npm run deploy:drill\b/,strictReadiness:/npm run deploy:readiness -- --strict/,crossPlatformArtifact:/compare-deploy-manifests\.mjs/};
  const found=Object.fromEntries(Object.entries(steps).map(([k,re])=>[k,re.test(wf)]));
  return {configured:Object.values(found).every(Boolean),workflow:'.github/workflows/kimyolab-verify.yml',steps:found};
}

function diagnosticsSelfTest(){
  const cfg=resolveDeployConfig(process.env); const paths=deployPaths(root,cfg.basePath);
  if(!fs.existsSync(paths.artifact)) return {pass:false,detail:'no artefact to copy'};
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-diag-'));
  try{
    const dir=path.join(tmp,'artifact'); fs.cpSync(paths.artifact,dir,{recursive:true});
    fs.rmSync(path.join(dir,'content','manifest.json'));
    fs.appendFileSync(path.join(dir,'index.html'),'<script src="https://cdn.example.invalid/x.js"></script>');
    const r=runPreflight({root,artifactDir:dir,manifestFile:paths.manifest,rebuild:false});
    const failed=r.checks.filter(c=>!c.pass);
    const text=JSON.stringify(failed);
    const actionable=failed.length>0&&failed.every(c=>/^DEPLOY_[A-Z_]+$/.test(c.code??'')&&(c.fix??'').length>10&&(c.message??'').length>10);
    const noAbsolute=!text.includes(tmp)&&!text.includes(os.homedir()+path.sep)&&!/\n\s+at\s/.test(text);
    return {pass:r.status==='FAIL'&&actionable&&noAbsolute,detail:{codes:[...new Set(failed.map(c=>c.code))].sort(),actionable,noAbsolutePathOrStack:noAbsolute}};
  }finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
}

export function buildReadiness(){
  const ci=ciReproducibility(); const audit=configAudit(); const art=artifacts();
  const preflight=readJson('reports/deployment-preflight.json'), smoke=readJson('reports/deployment-smoke.json'), rollback=readJson('reports/deployment-rollback-drill.json'), drill=readJson('reports/deployment-clean-drill.json');
  const portal=readJson('reports/portal-subpath-readiness.json'), hostAudit=readJson('reports/host-architecture-audit.json');
  const sDesk=readJson('reports/standalone-browser-smoke.json'), sMob=readJson('reports/standalone-mobile-smoke.json');
  const sha=(art.production as any).sha256??null;
  const smokeCheck=(...ids:string[])=>ids.every(id=>smoke?.checks?.find((c:any)=>c.id===id)?.pass===true);
  const pre=(...ids:string[])=>ids.every(id=>preflight?.checks?.find((c:any)=>c.id===id)?.pass===true);
  const manifestConfig=(art.production as any).config??null, contentVersion=(art.production as any).content?.contentVersion??null;
  const sameArtifact={
    preflight:preflight?.checks?.find((c:any)=>c.id==='artifact-checksum')?.detail?.sha256===sha,
    smoke:smoke?.target?.artifactSha256===sha,
    rollbackCurrent:rollback?.current?.sha256===sha,
    drill:drill?.steps?.find((s:any)=>s.id==='artifact')?.detail?.sha256===sha,
    smokeConfig:JSON.stringify(smoke?.target?.config)===JSON.stringify(manifestConfig),
    preflightConfig:preflight?.mount===manifestConfig?.basePath&&preflight?.checks?.find((c:any)=>c.id==='config')?.detail?.storageNamespace===manifestConfig?.storageNamespace,
    contentVersion:smoke?.target?.contentVersion===contentVersion&&preflight?.checks?.find((c:any)=>c.id==='content-manifest')?.detail?.activeVersion===contentVersion,
    rollbackBaseline:rollbackBaselineMatches(rollback,sha),
  };
  const diag=diagnosticsSelfTest();
  const C=(id:string,label:string,pass:boolean,evidence:string,detail?:unknown)=>({id,label,pass:Boolean(pass),evidence,...(detail!==undefined?{detail}:{})});
  const checks=[
    C('build-reproducible','production build reproducible',pre('reproducible-build')&&drill?.steps?.find((s:any)=>s.id==='generated-files-reproducible')?.pass===true,'deployment-preflight.json#reproducible-build + deployment-clean-drill.json#generated-files-reproducible'),
    C('artifact-known','deploy artefact known (path, mount, file count, sha256, content version)',Boolean(sha)&&(art.production as any).matchesBuiltDirectory===true,'deployment-artifacts.json#production'),
    C('evidence-current','all deployment evidence describes THIS artefact, configuration, content version and the resolved rollback baseline',Object.values(sameArtifact).every(Boolean),'preflight / smoke / rollback / clean-drill reports vs the deploy manifest and the rollback resolver',sameArtifact),
    C('config-documented','configuration documented in one place',audit.violations.filter(v=>/documented/.test(v)).length===0,'deployment-config-audit.json + docs/DEPLOY.md §3'),
    C('no-hardcoded-host','no hardcoded host, domain or deployment path',audit.violations.filter(v=>/hardcoded|undeclared|configuration surface/.test(v)).length===0,'deployment-config-audit.json#violations'),
    C('portal-subpath','portal subpath simulation works (/kimyolab/)',portal?.summary?.status==='READY_IN_SIMULATION'&&portal?.summary?.pass===portal?.summary?.checks,'portal-subpath-readiness.json',portal?.summary),
    C('deep-link-refresh','direct deep link and refresh work',smokeCheck('deep-link','refresh','query','back-forward'),'deployment-smoke.json'),
    C('assets-content','assets and content load from the mount',smokeCheck('brand-asset','content-loading')&&pre('content-base','root-asset-leak','brand-asset'),'deployment-smoke.json + deployment-preflight.json'),
    C('storage-namespaced','learner storage namespaced by mount',smokeCheck('storage-namespace','progress-persistence')&&pre('storage-namespace'),'deployment-smoke.json + deployment-preflight.json'),
    C('locks-namespaced','Web Locks namespaced by mount',smokeCheck('web-locks-namespace'),'deployment-smoke.json#web-locks-namespace'),
    C('service-worker-safe','no service worker can escape the mount',smokeCheck('service-worker')&&pre('service-worker'),'deployment-smoke.json + deployment-preflight.json'),
    C('css-isolated','CSS isolated from the host page',Array.isArray(hostAudit?.css?.global)&&hostAudit.css.global.length===0&&(hostAudit?.css?.rootNonNamespacedDeclarations??[]).length===0,'host-architecture-audit.json#css'),
    C('outside-scope-404','nothing is served outside the mount',smokeCheck('outside-mount-404'),'deployment-smoke.json#outside-mount-404'),
    C('preflight-passes','deploy:preflight exists and passes',preflight?.status==='PASS'&&preflight?.checks?.length===PREFLIGHT_CHECKS.length,'deployment-preflight.json',preflight?.summary),
    C('smoke-passes','deploy:smoke passes against the built artefact',smoke?.status==='PASS','deployment-smoke.json',smoke?.summary),
    C('standalone-passes','standalone delivery passes (offline, model-based, progress, brand, integrity)',smokeCheck('standalone-opens','standalone-brand-asset','standalone-offline-flow','standalone-model-based','standalone-progress-persists')&&sDesk?.status==='pass'&&sMob?.status==='pass','deployment-smoke.json#standalone-* + standalone-browser-smoke.json + standalone-mobile-smoke.json'),
    C('integrity-fails-closed','integrity / checksum enforced and failing closed',pre('artifact-checksum','content-integrity')&&smokeCheck('standalone-integrity-fails-closed'),'deployment-preflight.json + deployment-smoke.json'),
    C('rollback-drill','rollback drill passes with real artefacts; learner evidence kept',rollback?.status==='PASS'&&rollback?.steps?.some((s:any)=>s.id==='evidence-kept-after-rollback'&&s.pass),'deployment-rollback-drill.json'),
    C('diagnostics-actionable','failures give DEPLOY_* codes, a fix and no absolute path or stack trace',diag.pass,'self-test: preflight of a deliberately broken copy',diag.detail),
    C('clean-machine-drill','clean-environment drill passes with the documented commands',drill?.status==='PASS','deployment-clean-drill.json',drill?{commands:drill.commands,seconds:drill.seconds}:null),
    C('linux-ci-pinned','Linux verification runner pinned (ubuntu-24.04), no *-latest anywhere',ci.findings.linuxPinned&&ci.findings.noFloatingRunner,'.github/workflows (ci-reproducibility.json#findings)'),
    C('windows-ci-paths','Windows path job pinned (windows-2025) and runs path tests + deploy preflight',ci.findings.windowsPinned&&/deploy:preflight/.test(fs.readFileSync(path.join(repoTop,'.github/workflows/kimyolab-verify.yml'),'utf8')),'.github/workflows/kimyolab-verify.yml'),
    C('actions-node24','GitHub Actions on Node-24 runtime majors; application Node from .nvmrc',ci.findings.actionsOnNode24&&ci.findings.appNodeFromNvmrc,'ci-reproducibility.json#actions'),
    C('ci-gate-configured','the CI workflow runs verify, build, preflight, smoke, both drills, the cross-platform artefact comparison and strict readiness',ciGate().configured,'.github/workflows/kimyolab-verify.yml (configuration, not a CI result)',ciGate().steps),
  ];
  const passed=checks.filter(c=>c.pass).length;
  const acceptance=readAcceptance(root,sha&&contentVersion&&manifestConfig?{sha256:sha,contentVersion,basePath:manifestConfig.basePath}:null);
  const status=passed<checks.length?'NOT_READY':acceptance.valid>0?'READY_FOR_DEPLOYMENT':'READY_IN_SIMULATION';
  const readiness={
    schema:'kimyolab.installation-readiness.v1',
    semantics:'Installation Readiness — a SEPARATE metric: can another technical specialist install KimyoLab with the documented commands, without writing code, discovering paths or repairing the build? It is NOT an input of foundation, learning product or the overall estimate, and it says nothing about learning content, assessment or human governance (they stay separate debts).',
    formula:'percent = passed checks / total checks (every check below is the denominator; no weighting, no hidden items)',
    statusRule:{NOT_READY:'any check fails',READY_IN_SIMULATION:'every check passes LOCALLY / in simulation (the /kimyolab/ mount served by the bundled server and the clean-environment drill, on the machine that generated this report). It does not include a remote CI result.',READY_FOR_DEPLOYMENT:'additionally a VALID target-server acceptance record exists (scripts/lib/target-acceptance.ts: schema, this exact artefact sha256, content version and mount, a real non-local HTTPS origin, a human actor, preflight and smoke PASS, decision ACCEPTED). An agent writes only the template; it never writes an accepted record.'},
    evidenceModel:'The deployment reports are regenerated by every CI run (strict readiness is the CI gate). A committed copy is current only while `evidence-current` passes: it ties every report to THIS artefact sha256, configuration, content version and the resolved rollback baseline.',
    checks,passed,total:checks.length,percent:Math.round(1000*passed/checks.length)/10,status,
    externalAcceptance:{...acceptance,template:'docs/deploy/acceptance-template.json',note:'valid records = 0 → no real target-server installation has been accepted; no real portal integration is claimed'},
    ciGateConfigured:ciGate(),
    ciResult:'not established here: live GitHub CI success is an external merge gate (the PR checks), never asserted by repository-local code',
    separateFrom:{learningProduct:readJson('reports/project-progress.json')?.learningProductProgress?.percent??null,overall:readJson('reports/project-progress.json')?.overallManagementEstimate?.percent??null,note:'unchanged by P2.8'},
    knownDebtNotInThisMetric:{accessibility:'5 BLOCKED_BY_CONTENT activities, human accessibility review 0',feedback:'29 form simulations without a wrong-answer verdict, 6 experiments without enforced step order (P2.9)',content:'assessment, structured theory, human review and release decisions'},
  };
  return {ci,audit,art,readiness};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {ci,audit,art,readiness}=buildReadiness();
  write('reports/ci-reproducibility.json',ci); write('reports/deployment-config-audit.json',audit); write('reports/deployment-artifacts.json',art); write('reports/installation-readiness.json',readiness);
  for(const c of readiness.checks) console.log(`${c.pass?'✓':'✗'} ${c.id} — ${c.label}`);
  console.log(`Installation Readiness: ${readiness.passed}/${readiness.total} (${readiness.percent}%) ${readiness.status}`);
  if(process.argv.includes('--strict')&&readiness.status==='NOT_READY') process.exitCode=1;
}
