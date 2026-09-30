// P2.2 — portal-safe host readiness reports, generated from the repository (never edited by hand):
//   reports/host-architecture-audit.json  — static host-boundary audit (before = P2.1 merge, after = this tree)
//   reports/host-parity.json              — the SAME learner scenarios through portal (/kimyolab/) and standalone
//   reports/standalone-parity.json        — the standalone artifact: identity, same content/modules, parity, smokes
//   reports/brand-integration.json        — the approved logo: asset identity and resolution in both hosts
//   reports/portal-subpath-readiness.json — pass/fail checks for the simulated /kimyolab/ mount
// Runtime evidence comes from real Chromium: the parity scenarios run here, the portal/standalone E2E specs run
// through Playwright's JSON reporter. Prerequisite: npm run standalone:build (and preview:build).
// Usage: node scripts/host-readiness.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildHostAudit,hostAuditBefore} from './lib/host-audit.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rel=(...p:string[])=>path.join(root,...p);
const readJson=(p:string)=>JSON.parse(fs.readFileSync(rel(p),'utf8'));
const sha=(b:Buffer|string)=>crypto.createHash('sha256').update(b).digest('hex');
export const HOST_REPORTS=['reports/host-architecture-audit.json','reports/host-parity.json','reports/standalone-parity.json','reports/brand-integration.json','reports/portal-subpath-readiness.json'] as const;
// P2.3 closeout of P2.2 (A1): the CANONICAL brand source is the original PNG the user approved in chat — its hash is
// the user's statement, never a hash computed from a file the agent produced. The WebP served by the product is a
// DELIVERY asset: it is not byte-identical to the original, and its derivation can only be verified against the PNG.
// P2.4 instruction A1: the user corrected the canonical hash (the value given in P2.3, 243d59b0…, was wrong). The
// expected hash is the user's statement; it is never changed to match whatever file happens to be present.
export const CANONICAL_LOGO={path:'public/assets/brand/kimyolab-logo.png',sha256:'f061070fec1d4a9d75fda481ac1b0a80e8adb666ca7ab5a03b920fc705ebb6d4',format:'image/png',dimensions:{width:1254,height:1254},source:'original approved by the user (P2.4 instruction A1; supersedes the P2.3 value 243d59b0…)'} as const;
export const DELIVERY_LOGO='public/assets/brand/kimyolab-logo.webp';
const HOST_SPECS=['tests/e2e/portal-subpath.spec.mjs','tests/e2e/standalone-host.spec.mjs'];

/** Playwright JSON results → {title: 'passed'|'failed'|…}. */
function runSpecs():Record<string,string>{
  const r=spawnSync(process.execPath,[rel('node_modules/@playwright/test/cli.js'),'test','-c','playwright.config.mjs',...HOST_SPECS,'--reporter=json'],{cwd:root,encoding:'utf8',maxBuffer:256*1024*1024});
  const json=JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  const out:Record<string,string>={};
  const walk=(suite:any)=>{ for(const s of suite.suites??[]) walk(s); for(const spec of suite.specs??[]) out[spec.title]=spec.tests?.[0]?.results?.at(-1)?.status??'unknown'; };
  for(const s of json.suites??[]) walk(s);
  return out;
}
const passed=(results:Record<string,string>,prefix:string)=>{ const hit=Object.entries(results).filter(([t])=>t.startsWith(prefix)); return hit.length>0&&hit.every(([,s])=>s==='passed'); };

function pngSize(bytes:Buffer){ if(bytes.subarray(1,4).toString()!=='PNG') return null; return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}; }
/** Brand provenance (pure except for reading files). Resolution flags come from the host E2E specs. */
export function buildBrandReport(base:string,resolves:{portal:boolean;standalone:boolean}){
  const file=(p:string)=>{ const f=path.join(base,p); return fs.existsSync(f)?fs.readFileSync(f):null; };
  const canonical=file(CANONICAL_LOGO.path), delivery=file(DELIVERY_LOGO);
  const index=fs.readFileSync(path.join(base,'index.html'),'utf8');
  const canonicalSha=canonical?sha(canonical):null;
  const canonicalOk=canonicalSha===CANONICAL_LOGO.sha256;
  const status=!canonical?'CANONICAL_SOURCE_MISSING':!canonicalOk?'CANONICAL_SOURCE_MISMATCH':!delivery?'DELIVERY_ASSET_MISSING':'CANONICAL_PRESENT';
  return {schema:'kimyolab.brand-integration.v2',status,
    canonicalSource:CANONICAL_LOGO.path,deliveryAsset:DELIVERY_LOGO,
    semantics:'canonicalSourceSha256 is the hash of the user-approved original (stated by the user, not computed from any file the agent produced). The delivery asset is what the product serves. derivedFromCanonical and visuallyEquivalent are asserted only when verified against the canonical original; otherwise they stay UNVERIFIED / NOT_CHECKED.',
    canonicalSourceSha256:CANONICAL_LOGO.sha256,
    deliveryAssetSha256:delivery?sha(delivery):null,
    derivedFromCanonical:canonicalOk&&delivery?'NOT_VERIFIED_YET':'UNVERIFIED',
    visuallyEquivalent:'NOT_CHECKED',
    canonical:{path:CANONICAL_LOGO.path,expectedSha256:CANONICAL_LOGO.sha256,format:CANONICAL_LOGO.format,expectedDimensions:CANONICAL_LOGO.dimensions,source:CANONICAL_LOGO.source,present:Boolean(canonical),sha256:canonicalSha,matchesApprovedOriginal:canonical?canonicalOk:null,dimensions:canonical?pngSize(canonical):null},
    delivery:delivery?{path:DELIVERY_LOGO,sha256:sha(delivery),sizeBytes:delivery.length,format:'image/webp',dimensions:webpSize(delivery),provenance:'the logo image as received through the chat channel (WebP); NOT byte-identical to the canonical PNG; derivation unverified until the PNG is committed',byteIdenticalToCanonical:false}:null,
    shell:{logoElement:/class="kl-brand-logo"[^>]*data-kl-asset="assets\/brand\/kimyolab-logo\.webp"/.test(index),temporaryLetterMarkRemoved:!/kl-brand-mark">K</.test(index),favicon:/rel="icon"[^>]*kimyolab-logo\.webp/.test(index)},
    hosts:{portal:resolves.portal?'resolves':'fails',standalone:resolves.standalone?'resolves':'fails'},
    blocker:!canonical?{code:'BRAND_ASSET_MISSING',detail:`the user-approved original PNG (SHA-256 ${CANONICAL_LOGO.sha256}) is not in this environment (chat attachments arrive as a WebP transcode); commit the original unchanged at ${CANONICAL_LOGO.path}`}
      :!canonicalOk?{code:'CANONICAL_SOURCE_MISMATCH',detail:`${CANONICAL_LOGO.path} hashes to ${canonicalSha}, not the user-approved ${CANONICAL_LOGO.sha256}; brand closeout stops — the expected hash is never changed to match a file`}:null};
}
function webpSize(bytes:Buffer){ if(bytes.subarray(12,16).toString()!=='VP8X') return null; return {width:bytes.readUIntLE(24,3)+1,height:bytes.readUIntLE(27,3)+1}; }

export async function buildHostReports(){
  const audit={...buildHostAudit(root),before:hostAuditBefore(root)};
  // ---------------------------------------------------------------- runtime: parity scenarios + host E2E specs
  const {chromium}=await import('@playwright/test');
  // the Playwright scenario module is plain .mjs test code (no types); it is loaded by URL at run time
  const {startHosts,runParity,SCENARIOS}:any=await import(new URL('../tests/e2e/host-scenarios.mjs',import.meta.url).href);
  const browser=await chromium.launch(); const hosts=await startHosts();
  let rows:any[];
  try{ rows=await runParity(browser,hosts); } finally{ await hosts.close(); await browser.close(); }
  const specs=runSpecs();
  const parityPass=rows.every(r=>r.status==='PASS');
  const hostParity={schema:'kimyolab.host-parity.v1',
    semantics:'The same learner scenarios through the portal-simulation host (production build under /kimyolab/) and the standalone single-file host. Compared: content version, activity, engine result (evidence type/score/achieved/correct/target), completion (attempt status), progress, mastery rows and the learner-visible outcome text. Allowed to differ: URL, shell, navigation and content transport, storage namespace.',
    allowedDifferences:['browser URL','host shell','navigation transport (path vs hash)','content transport (HTTP vs embedded bytes)','storage namespace'],
    notAllowed:['chemistry result','scoring','evidence semantics','content','assessment behaviour'],
    scenarios:rows.map((r:any)=>({id:r.id,title:r.title,status:r.status,facts:r.hosts.portal.facts,semantic:r.hosts.portal.semantic,differences:r.status==='PASS'?[]:[{portal:r.hosts.portal,standalone:r.hosts.standalone}]})),
    summary:{scenarios:rows.length,pass:rows.filter((r:any)=>r.status==='PASS').length,status:parityPass?'PASS':'FAIL'},
    scenarioIds:SCENARIOS.map((s:any)=>s.id)};
  // ---------------------------------------------------------------- standalone artifact
  const htmlFile=rel('dist-standalone','KimyoLab_standalone.html');
  const html=fs.readFileSync(htmlFile);
  const build=readJson('reports/standalone-build.json');
  const text=html.toString('utf8');
  const embedded=JSON.parse(text.match(/<script type="application\/json" id="kl-standalone-content">([\s\S]*?)<\/script>/)![1]!.replace(/\\u003c/g,'<'));
  const pointer=JSON.parse(embedded['manifest.json']);
  const contentFiles=Object.keys(embedded).sort();
  const contentMismatch=contentFiles.filter(k=>{ const f=rel('public','content',...k.split('/')); return !fs.existsSync(f)||fs.readFileSync(f,'utf8')!==embedded[k]; });
  const smoke=fs.existsSync(rel('reports/standalone-browser-smoke.json'))?readJson('reports/standalone-browser-smoke.json'):null;
  const mobile=fs.existsSync(rel('reports/standalone-mobile-smoke.json'))?readJson('reports/standalone-mobile-smoke.json'):null;
  const standaloneParity={schema:'kimyolab.standalone-parity.v1',
    semantics:'The standalone presentation artifact is a generated deliverable of the SAME product (embedded host), not a demo.',
    artifact:{path:'dist-standalone/KimyoLab_standalone.html',sha256:sha(html),sizeBytes:html.length,contentVersion:pointer.activeVersion,moduleCount:build.moduleCount,contentJsonFiles:build.contentJsonFiles,embeddedAssets:build.embeddedAssets,host:build.host,routeMode:build.routeMode},
    sameContent:{embeddedFiles:contentFiles.length,byteIdenticalToPublicContentPack:contentMismatch.length===0,mismatches:contentMismatch},
    sameRuntime:{globalFetchPatched:/globalThis\.fetch\s*=/.test(text),standaloneFlag:/__KIMYOLAB_STANDALONE__/.test(text),embeddedHostConfig:/__KIMYOLAB_HOST__=Object\.freeze\(\{kind:'embedded'/.test(text),integrityChecked:passed(specs,'standalone keeps pack integrity')},
    parity:{status:hostParity.summary.status,scenarios:hostParity.summary.scenarios},
    smokes:{desktop:smoke?.status??'not-run',mobile:mobile?.status??'not-run',hostSpecs:passed(specs,'standalone opens from disk')&&passed(specs,'standalone at phone width')?'pass':'fail'},
    network:{internalContent:'embedded — no server, no network',externalLabs:'third-party labs (NOBOOK, ChemAI) and the NOBOOK session API need network/a server; not faked offline'},
    status:contentMismatch.length===0&&parityPass&&passed(specs,'standalone')?'PASS':'FAIL'};
  // ---------------------------------------------------------------- brand
  const brand=buildBrandReport(root,{portal:passed(specs,'/kimyolab/ opens'),standalone:(build.embeddedAssets??[]).includes('assets/brand/kimyolab-logo.webp')&&passed(specs,'standalone opens from disk')});
  // ---------------------------------------------------------------- portal readiness (simulated mount)
  const check=(id:string,pass:boolean,evidence:string)=>({id,pass,evidence});
  const checks=[
    check('route-base',audit.hardcodedPaths.after.byPattern['location-or-history-write']===0&&passed(specs,'direct deep link'),'navigation only through the host; deep links map /kimyolab/<route> → logical route'),
    check('asset-base',audit.hardcodedPaths.after.byPattern['asset-root-literal']===0&&audit.hardcodedPaths.shell.rootAbsoluteUrlsWhenMountedAtKimyolab.length===0&&passed(specs,'/kimyolab/ opens'),'no /assets or root-absolute shell URL; every request stays inside /kimyolab/'),
    check('content-base',audit.hardcodedPaths.after.byPattern['content-root-literal']===0&&passed(specs,'/kimyolab/ opens'),'ContentClient base = host.contentBase (/kimyolab/content); integrity unchanged'),
    check('deep-links',passed(specs,'direct deep link'),'direct /kimyolab/learn/… and /kimyolab/practice/… open'),
    check('refresh',passed(specs,'direct deep link'),'reload on a deep link renders the same page'),
    check('history-and-query',passed(specs,'direct deep link'),'back/forward and ?q= query strings'),
    check('outside-scope-404',passed(specs,'the server serves only the mount'),'/, /curriculum, /content/… → 404; /kimyolab → 308 /kimyolab/'),
    check('storage-namespace',passed(specs,'storage and Web Lock namespaces'),'IndexedDB kimyolab@/kimyolab/.runtime, not kimyolab-runtime'),
    check('lock-namespace',passed(specs,'storage and Web Lock namespaces'),'Web Locks kimyolab@/kimyolab/.attempt.*'),
    check('css-isolation',audit.css.global.length===0&&audit.css.rootNonNamespacedDeclarations.length===0&&passed(specs,'CSS isolation'),'no global selectors; a host page is unchanged; typical portal CSS keeps controls usable'),
    check('service-worker',audit.serviceWorker.pass&&passed(specs,'no service worker'),'none registered; none could claim /'),
    check('host-boundary',audit.hostBoundary.onlyBootstrapImports&&audit.hardcodedPaths.after.byPattern['host-type-check']===0,'only bootstrap resolves the host; no code inspects the host type'),
    check('standalone-parity',parityPass,`${hostParity.summary.pass}/${hostParity.summary.scenarios} scenarios identical in both hosts`),
  ];
  const portal={schema:'kimyolab.portal-subpath-readiness.v1',
    semantics:'Readiness of the SAME product for a subpath host, proven on a SIMULATED /kimyolab/ mount (local server). This is NOT portal integration: the real raqamlitalim.trm.uz deployment, its authentication and its shell belong to P3.',
    mount:'/kimyolab/',portalIntegrated:false,realDeployment:'P3',
    checks,summary:{checks:checks.length,pass:checks.filter(c=>c.pass).length,status:checks.every(c=>c.pass)?'READY_IN_SIMULATION':'NOT_READY'},
    separateFromProjectProgress:'not part of the 0.4 foundation / 0.6 learning-product management formula (ADR-P2-003 §8)'};
  return {audit,hostParity,standaloneParity,brand,portal};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=await buildHostReports();
  const w=(p:string,v:unknown)=>fs.writeFileSync(rel(p),JSON.stringify(v,null,2)+'\n');
  w(HOST_REPORTS[0],r.audit); w(HOST_REPORTS[1],r.hostParity); w(HOST_REPORTS[2],r.standaloneParity); w(HOST_REPORTS[3],r.brand); w(HOST_REPORTS[4],r.portal);
  console.log(JSON.stringify({parity:r.hostParity.summary,standalone:r.standaloneParity.status,brand:r.brand.status,portal:r.portal.summary,violations:{before:r.audit.before?.violations??null,after:r.audit.hardcodedPaths.after.violations}}));
  if(r.portal.summary.status!=='READY_IN_SIMULATION'||r.standaloneParity.status!=='PASS') process.exitCode=1;
}
