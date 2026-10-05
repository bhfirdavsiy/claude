// P2.8 — CI reproducibility facts read from the repository itself: the workflow files (runner labels, action refs,
// how the application Node version is chosen) and the lockfile (Playwright, Chromium revision). Deterministic.
import fs from 'node:fs';
import path from 'node:path';

/** Action majors verified at P2.8 against their official repositories: each `action.yml` declares `runs.using: node24`
 *  (tag v7 resolved via git ls-remote on github.com/actions/*; commit and date recorded for audit). */
export const VERIFIED_ACTIONS:Record<string,{ref:string;runtime:string;tagCommit:string;tagDate:string}>={
  'actions/checkout':{ref:'v7',runtime:'node24',tagCommit:'3d3c42e5aac5ba805825da76410c181273ba90b1',tagDate:'2026-07-17'},
  'actions/setup-node':{ref:'v7',runtime:'node24',tagCommit:'820762786026740c76f36085b0efc47a31fe5020',tagDate:'2026-07-13'},
  'actions/upload-artifact':{ref:'v7',runtime:'node24',tagCommit:'043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',tagDate:'2026-04-10'},
  'actions/download-artifact':{ref:'v8',runtime:'node24',tagCommit:'3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',tagDate:'2026-03-11'},
};
/** Runner images the verification is pinned to (a `*-latest` label may move to a new OS version without notice). */
export const PINNED_RUNNERS={linux:'ubuntu-24.04',windows:'windows-2025'};

export interface WorkflowJob { workflow:string; job:string; runsOn:string; uses:string[]; nodeVersionFile:string[]; nodeVersion:string[] }

export function readWorkflows(repoTop:string):WorkflowJob[]{
  const dir=path.join(repoTop,'.github','workflows');
  if(!fs.existsSync(dir)) return [];
  const jobs:WorkflowJob[]=[];
  for(const file of fs.readdirSync(dir).filter(f=>/\.ya?ml$/.test(f)).sort()){
    const text=fs.readFileSync(path.join(dir,file),'utf8');
    const body=text.split(/\n(?=jobs:)/)[1]??'';
    // jobs are the 2-space-indented keys under `jobs:`
    const parts=body.split(/\n(?=  [A-Za-z0-9_-]+:\s*$)/m).slice(1);
    for(const part of parts){
      const job=part.match(/^  ([A-Za-z0-9_-]+):/)?.[1]??'?';
      jobs.push({workflow:file,job,runsOn:part.match(/runs-on:\s*(\S+)/)?.[1]??'(none)',
        uses:[...part.matchAll(/uses:\s*([^\s#]+)/g)].map(m=>m[1]!),
        nodeVersionFile:[...part.matchAll(/node-version-file:\s*(\S+)/g)].map(m=>m[1]!),
        nodeVersion:[...part.matchAll(/^\s+node-version:\s*(\S+)/gm)].map(m=>m[1]!)});
    }
  }
  return jobs;
}

export function declaredToolchain(root:string){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const browsersFile=path.join(root,'node_modules','playwright-core','browsers.json');
  const chromium=fs.existsSync(browsersFile)?JSON.parse(fs.readFileSync(browsersFile,'utf8')).browsers.find((b:any)=>b.name==='chromium'):null;
  return {
    applicationNode:{source:'kimyolab/.nvmrc',major:fs.readFileSync(path.join(root,'.nvmrc'),'utf8').trim()},
    npmLockfileVersion:lock.lockfileVersion,
    playwright:lock.packages?.['node_modules/@playwright/test']?.version??null,
    chromium:chromium?{revision:chromium.revision,version:chromium.browserVersion??null,source:'node_modules/playwright-core/browsers.json (installed by npx playwright install chromium)'}:null,
  };
}

/** This is a multi-project repository: only workflows named `kimyolab-*` belong to KimyoLab. Other projects' workflows
 *  (e.g. the Darslik Cutter installer build) are read for diagnostics only and never decide KimyoLab readiness. */
export const KIMYOLAB_WORKFLOW_PREFIX='kimyolab-';
export const isKimyolabWorkflow=(file:string)=>file.startsWith(KIMYOLAB_WORKFLOW_PREFIX);

/** Pass/fail facts about the KimyoLab-owned workflows (published in reports/ci-reproducibility.json and Installation
 *  Readiness). Every gating fact — runner pinning, floating runners, verified action majors, Node version source — is
 *  computed from `kimyolab-*` workflows only; the checks themselves are unchanged. */
export function workflowFindings(jobs:WorkflowJob[]){
  const kimyo=jobs.filter(j=>isKimyolabWorkflow(j.workflow));
  const actionRefs=kimyo.flatMap(j=>j.uses.map(u=>({job:`${j.workflow}#${j.job}`,uses:u})));
  const unverified=actionRefs.filter(a=>{ const [name,ref]=a.uses.split('@'); return !VERIFIED_ACTIONS[name!]||VERIFIED_ACTIONS[name!]!.ref!==ref; });
  const floating=kimyo.filter(j=>/-latest$/.test(j.runsOn));
  const verifyJob=kimyo.find(j=>j.workflow==='kimyolab-verify.yml'&&j.job==='verify');
  const windowsJob=kimyo.find(j=>j.workflow==='kimyolab-verify.yml'&&j.job==='windows-paths');
  return {
    scope:`KimyoLab-owned workflows only (${KIMYOLAB_WORKFLOW_PREFIX}*)`,
    kimyolabWorkflows:[...new Set(kimyo.map(j=>j.workflow))].sort(),
    otherRepositoryWorkflows:[...new Set(jobs.filter(j=>!isKimyolabWorkflow(j.workflow)).map(j=>j.workflow))].sort(),
    linuxPinned:verifyJob?.runsOn===PINNED_RUNNERS.linux,
    windowsPinned:windowsJob?.runsOn===PINNED_RUNNERS.windows,
    noFloatingRunner:floating.length===0,floatingRunners:floating.map(j=>`${j.workflow}#${j.job}: ${j.runsOn}`),
    actionsOnNode24:unverified.length===0,unverifiedActions:unverified,
    appNodeFromNvmrc:kimyo.filter(j=>j.uses.some(u=>u.startsWith('actions/setup-node@'))).every(j=>j.nodeVersionFile.every(f=>f==='kimyolab/.nvmrc')&&j.nodeVersionFile.length>0&&j.nodeVersion.length===0),
  };
}
/** the gating booleans of the findings (diagnostic lists and the scope note never decide a status) */
export const gatingFindings=(f:ReturnType<typeof workflowFindings>)=>({linuxPinned:f.linuxPinned,windowsPinned:f.windowsPinned,noFloatingRunner:f.noFloatingRunner,actionsOnNode24:f.actionsOnNode24,appNodeFromNvmrc:f.appNodeFromNvmrc});
