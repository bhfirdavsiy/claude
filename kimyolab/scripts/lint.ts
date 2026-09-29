// Architecture lint: mechanically enforces the forbidden anti-patterns of the Master TT (§31)
// that can be checked statically. Style is left to the TypeScript compiler (strict mode).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {checkTree} from './lib/architecture-guard.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const issues:string[]=[];
const rel=(p:string)=>path.relative(root,p).split(path.sep).join('/');

function walk(dir:string,filter:(f:string)=>boolean,out:string[]=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    if(e.isDirectory()) walk(full,filter,out); else if(filter(full)) out.push(full);
  }
  return out;
}

const srcFiles=walk(path.join(root,'src'),f=>f.endsWith('.ts'));
const rules:Array<{id:string;pattern:RegExp;why:string;allow?:(file:string)=>boolean}>=[
  {id:'NO_WEB_STORAGE',pattern:/\b(localStorage|sessionStorage)\s*\./,why:'runtime state (progress, evidence, external lab state) must live in IndexedDB'},
  {id:'NO_DYNAMIC_CODE',pattern:/\beval\s*\(|new\s+Function\s*\(/,why:'dynamic code execution is forbidden'},
  {id:'NO_INNER_HTML',pattern:/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/,why:'render with DOM APIs, never HTML strings'},
  {id:'NO_PLAIN_HTTP_URL',pattern:/['"`]http:\/\/(?!127\.0\.0\.1|localhost)/,why:'external URLs must be HTTPS and pass validateExternalLabUrl'},
  {id:'NO_EVIDENCE_PUT',pattern:/objectStore\(\s*['"]evidence['"]\s*\)\.put\(/,why:'evidence is append-only: use add() so an existing id is never overwritten',allow:f=>f.endsWith('runtime/progress/indexeddb-store.ts')},
  {id:'NO_ACTIVITY_ID_AS_EVIDENCE_KEY',pattern:/put\([^)]*,\s*(activity|practice)\.?id\s*\)/i,why:'activity id must never be an evidence storage key'},
];
for(const file of srcFiles){
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  lines.forEach((line,i)=>{
    const code=line.replace(/\/\/.*$/,'');
    for(const rule of rules) if(rule.pattern.test(code)&&!rule.allow?.(file)) issues.push(`${rule.id}:${rel(file)}:${i+1}: ${rule.why}`);
  });
}

// Generated browser preview must be exactly what the current src/ produces.
const previewRoot=path.join(root,'public','app-preview');
const expected=new Map<string,string>();
for(const dir of ['app','features','ui','domain','runtime','engines','integrations']){
  for(const file of walk(path.join(root,'src',dir),f=>f.endsWith('.ts')||f.endsWith('.css'))){
    const r=path.relative(path.join(root,'src'),file).split(path.sep).join('/');
    const text=fs.readFileSync(file,'utf8');
    if(file.endsWith('.css')) expected.set(r,text);
    else expected.set(r.replace(/\.ts$/,'.js'),stripTypeScriptTypes(text,{mode:'strip'}).replace(/from\s+(['"])([^'"]+)\.ts\1/g,'from $1$2.js$1'));
  }
}
const actual=walk(previewRoot,()=>true).map(f=>path.relative(previewRoot,f).split(path.sep).join('/'));
for(const [r,text] of expected){
  const file=path.join(previewRoot,r);
  if(!fs.existsSync(file)) issues.push(`PREVIEW_STALE:public/app-preview/${r}: missing — run npm run preview:build`);
  else if(fs.readFileSync(file,'utf8')!==text) issues.push(`PREVIEW_STALE:public/app-preview/${r}: differs from src — run npm run preview:build`);
}
for(const r of actual) if(!expected.has(r)) issues.push(`PREVIEW_STALE:public/app-preview/${r}: no longer produced by src — run npm run preview:build`);

// Reproducible build: exact dependency pins, lockfile present, no global tools.
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(!fs.existsSync(path.join(root,'package-lock.json'))) issues.push('LOCKFILE_MISSING:package-lock.json');
for(const [name,range] of Object.entries({...(pkg.dependencies??{}),...(pkg.devDependencies??{})})) if(!/^\d+\.\d+\.\d+$/.test(String(range))) issues.push(`DEPENDENCY_NOT_PINNED:${name}@${range}`);
for(const [name,cmd] of Object.entries(pkg.scripts??{})) if(/(^|&&\s*)npx\s/.test(String(cmd))) issues.push(`GLOBAL_TOOL_IN_SCRIPT:${name}: use the locally installed binary`);
for(const required of ['lint','typecheck','test','test:integration','test:e2e','content:validate','chemistry:validate','build','verify']) if(!pkg.scripts?.[required]) issues.push(`SCRIPT_MISSING:${required}`);
if(/experimental-strip-types/.test(String(pkg.scripts?.typecheck))) issues.push('TYPECHECK_NOT_REAL: typecheck must run tsc --noEmit');

// Server must only expose the built deployment surface.
const server=fs.readFileSync(path.join(root,'server','app.mjs'),'utf8');
const serverPaths=fs.readFileSync(path.join(root,'server','paths.mjs'),'utf8');
if(!/p\.join\(appRoot, 'dist'\)/.test(serverPaths)) issues.push('SERVER_PUBLIC_ROOT:server/paths.mjs must default PUBLIC_ROOT to dist');

// Platform-safe module paths (P0.15.2): URL.pathname breaks on Windows drives, spaces and Unicode.
const pathFiles=[...srcFiles,...walk(path.join(root,'scripts'),f=>/\.(ts|mjs)$/.test(f)),...walk(path.join(root,'server'),f=>f.endsWith('.mjs')),...walk(path.join(root,'tests'),f=>f.endsWith('.mjs')),path.join(root,'server.mjs')];
for(const file of pathFiles){
  fs.readFileSync(file,'utf8').split(/\r?\n/).forEach((line,i)=>{
    const code=line.replace(/\/\/.*$/,'');
    if(/import\.meta\.url\)\s*\.pathname/.test(code)) issues.push(`NO_URL_PATHNAME_AS_PATH:${rel(file)}:${i+1}: use fileURLToPath(import.meta.url)`);
  });
}
if(/\/api\/external-labs\/nobook\/auth/.test(server)) issues.push('NOBOOK_AUTH_ENDPOINT_EXPOSED:server/app.mjs');

// Canonical learning runtime boundaries (P1.0): AST-based, see scripts/lib/architecture-guard.ts.
for(const v of checkTree(root)) issues.push(`${v.rule}:${v.file}:${v.line}: ${v.detail}`);

console.log(JSON.stringify({files:srcFiles.length,issues:issues.length}));
for(const issue of issues) console.error(issue);
if(issues.length) process.exitCode=1;
