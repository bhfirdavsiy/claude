// P2.2 — static host-architecture audit (ADR-P2-003). Pure: reads the repository (and, for the "before" column,
// the P2.1 merge commit through git when it is available). Nothing here changes code or content.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {applyBasePath,rootAbsoluteUrls} from './host-build.ts';

export const P21_MERGE='5766c2bdd2484ddfebba6edfef7a6f02d4780e98';
const HOST_BOUNDARY='src/app/host.ts';

/** Patterns that tie code to a particular host or to the site root. `allowIn` = the host boundary that defines them. */
export const HOST_PATTERNS:ReadonlyArray<{id:string;description:string;regex:RegExp;allowIn:string[]}>=[
  {id:'content-root-literal',description:'a content URL hard-coded to /content',regex:/['"`]\/content(?:\/|['"`])/g,allowIn:[HOST_BOUNDARY]},
  {id:'app-preview-root-literal',description:'a module/CSS URL hard-coded to /app-preview/',regex:/['"`]\/app-preview\//g,allowIn:[]},
  {id:'asset-root-literal',description:'an asset URL hard-coded to /assets/ or /vendor/',regex:/['"`]\/(?:assets|vendor)\//g,allowIn:[]},
  {id:'api-root-literal',description:'an API URL hard-coded to /api/',regex:/['"`]\/api\//g,allowIn:[HOST_BOUNDARY]},
  {id:'location-or-history-write',description:'navigation state written outside the host boundary',regex:/\blocation\.(?:hash|href|pathname)\s*=(?!=)|history\.(?:pushState|replaceState)|addEventListener\(\s*['"](?:popstate|hashchange)['"]/g,allowIn:[HOST_BOUNDARY]},
  {id:'host-type-check',description:'code that inspects which host it runs in',regex:/__KIMYOLAB_STANDALONE\w*__|__KIMYOLAB_HOST__|\.kind\s*===?\s*['"](?:embedded|path)['"]/g,allowIn:[HOST_BOUNDARY]},
];

type FileSource=(rel:string)=>string|null;
const git=(root:string,args:string[])=>{ const r=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}); return r.status===0?r.stdout:null; };

function listSrc(root:string):string[]{
  const out:string[]=[];
  const walk=(rel:string)=>{ for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){ const r=`${rel}/${e.name}`; if(e.isDirectory()) walk(r); else if(r.endsWith('.ts')) out.push(r); } };
  walk('src'); return out.sort();
}

function scan(files:string[],read:FileSource){
  const findings:Array<{pattern:string;file:string;line:number;text:string;allowed:boolean}>=[];
  for(const file of files){
    const text=read(file); if(text===null) continue;
    const lines=text.split('\n');
    for(const p of HOST_PATTERNS){
      lines.forEach((line,i)=>{ for(const m of line.matchAll(p.regex)) findings.push({pattern:p.id,file,line:i+1,text:m[0],allowed:p.allowIn.includes(file)}); });
    }
  }
  const byPattern=Object.fromEntries(HOST_PATTERNS.map(p=>[p.id,findings.filter(f=>f.pattern===p.id&&!f.allowed).length]));
  return {findings,byPattern,violations:findings.filter(f=>!f.allowed).length};
}

// ------------------------------------------------------------------ CSS selector inventory

export function cssSelectorInventory(css:string){
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors:string[]=[];
  for(const m of clean.matchAll(/([^{};]+)\{/g)){
    const prelude=m[1]!.trim();
    if(!prelude||prelude.startsWith('@')) continue;
    for(const sel of prelude.split(',').map(s=>s.trim()).filter(Boolean)){
      if(/^(from|to|\d+(\.\d+)?%)$/.test(sel)) continue;          // @keyframes steps
      selectors.push(sel);
    }
  }
  const classify=(sel:string)=>sel===':root'?'root-custom-properties':/\.kl-|:where\(\.kl-app\)/.test(sel)?'kl-scoped':'global';
  const rows=selectors.map(s=>({selector:s,kind:classify(s)}));
  const rootBlocks=[...clean.matchAll(/:root\s*\{([^}]*)\}/g)].map(m=>m[1]!);
  const rootNonKl=rootBlocks.flatMap(b=>b.split(';').map(d=>d.trim()).filter(Boolean)).filter(d=>!d.startsWith('--kl-'));
  return {selectors:rows.length,klScoped:rows.filter(r=>r.kind==='kl-scoped').length,rootCustomPropertyBlocks:rootBlocks.length,rootNonNamespacedDeclarations:rootNonKl,global:[...new Set(rows.filter(r=>r.kind==='global').map(r=>r.selector))]};
}

// ------------------------------------------------------------------ the audit

export function buildHostAudit(root:string){
  const read:FileSource=(rel)=>{ const f=path.join(root,rel); return fs.existsSync(f)?fs.readFileSync(f,'utf8'):null; };
  const files=listSrc(root);
  const after=scan(files,read);
  const index=read('index.html')!;
  const shellAtSubpath=applyBasePath(index,'/kimyolab/');
  const bootstrap=read('src/app/bootstrap.ts')!;
  const importsOfHost=files.filter(f=>f!==HOST_BOUNDARY&&/from\s*['"][./]*(?:app\/)?host\.ts['"]/.test(read(f)!)&&/\bhost\.ts['"]/.test(read(f)!));
  const swSources=[...files,'index.html'].flatMap(f=>{ const t=read(f)??''; return [...t.matchAll(/serviceWorker\.register\(([^)]*)\)/g)].map(m=>({file:f,call:m[0]})); });
  const css=read('src/ui/tokens/kimyolab.css')!;
  const legacyDefaults=files.flatMap(f=>(read(f)!.split('\n').map((l,i)=>({f,l,i})).filter(x=>x.f!==HOST_BOUNDARY&&/'kimyolab-runtime'|'kimyolab\.attempt\.'/.test(x.l)).map(x=>({file:x.f,line:x.i+1}))));
  return {
    schema:'kimyolab.host-architecture-audit.v1',
    semantics:'Static audit of the host boundary (ADR-P2-003). A violation is code outside src/app/host.ts that hard-codes the site root, writes navigation state, or inspects which host it runs in. Logical app routes (/learn/…) passed to link() are the route model, not violations.',
    hostBoundary:{file:HOST_BOUNDARY,exists:fs.existsSync(path.join(root,HOST_BOUNDARY)),importedBy:importsOfHost,onlyBootstrapImports:importsOfHost.every(f=>f==='src/app/bootstrap.ts'),
      bootstrapUsesHost:{resolveHost:/resolveHost\(/.test(bootstrap),contentBase:/baseUrl:host\.contentBase/.test(bootstrap),fetchContent:/fetchImpl:host\.fetchContent/.test(bootstrap),storage:/runtimeDbName\(host\.storageNamespace\)/.test(bootstrap),locks:/attemptLockPrefix\(host\.storageNamespace\)/.test(bootstrap),links:/configureHostPaths\(/.test(bootstrap)}},
    hardcodedPaths:{patterns:HOST_PATTERNS.map(p=>({id:p.id,description:p.description,allowIn:p.allowIn})),after:{byPattern:after.byPattern,violations:after.violations,findings:after.findings.filter(f=>!f.allowed)},
      shell:{rootAbsoluteUrlsWhenMountedAtKimyolab:rootAbsoluteUrls(shellAtSubpath,'/kimyolab/'),declaresBasePath:/name="kimyolab-base-path"/.test(index),routeAnchors:(index.match(/data-kl-route=/g)??[]).length}},
    serviceWorker:{registrations:swSources,maxAllowedScope:'<basePath> (e.g. /kimyolab/)',pass:swSources.length===0},
    storage:{strategy:'namespace from basePath: "/" → kimyolab (legacy names kept: kimyolab-runtime, kimyolab.attempt.); "/kimyolab/" → kimyolab@/kimyolab/ (kimyolab@/kimyolab/.runtime, kimyolab@/kimyolab/.attempt.)',legacyDefaultParameters:legacyDefaults,note:'the defaults are the root namespace values used by Node tests; the browser bootstrap always passes the host namespace'},
    css:cssSelectorInventory(css),
  };
}

/** The same scan on the P2.1 merge commit (the "before" column). null when that commit is not in the local clone. */
export function hostAuditBefore(root:string){
  const repoRel=git(root,['rev-parse','--show-prefix'])?.trim()??'';
  if(git(root,['cat-file','-e',`${P21_MERGE}^{commit}`])===null) return null;
  const list=git(root,['ls-tree','-r','--full-tree','--name-only',P21_MERGE,`${repoRel}src`]);
  if(list===null) return null;
  const files=list.split('\n').filter(f=>f.endsWith('.ts')).map(f=>f.slice(repoRel.length)).sort();
  if(!files.length) return null;
  const read:FileSource=(rel)=>git(root,['show',`${P21_MERGE}:${repoRel}${rel}`]);
  const before=scan(files,read);
  const index=read('index.html')??'';
  const css=read('src/ui/tokens/kimyolab.css')??'';
  return {commit:P21_MERGE,byPattern:before.byPattern,violations:before.violations,findings:before.findings.filter(f=>!f.allowed),
    shell:{rootAbsoluteUrlsWhenMountedAtKimyolab:rootAbsoluteUrls(index,'/kimyolab/'),declaresBasePath:/name="kimyolab-base-path"/.test(index)},
    css:{global:cssSelectorInventory(css).global}};
}
