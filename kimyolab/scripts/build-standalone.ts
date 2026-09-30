import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const previewRoot=path.join(root,'public','app-preview');
const contentRoot=path.join(root,'public','content');
const outputDir=path.join(root,'dist-standalone');
const outputFile=path.join(outputDir,'KimyoLab_standalone.html');
const indexAlias=path.join(outputDir,'index.html');
const entryRel='app/bootstrap.js';

function posix(value:string){return value.split(path.sep).join('/');}
function moduleId(rel:string){return `kl/${posix(rel)}`;}
function resolveRelative(fromRel:string,specifier:string){
  const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(posix(fromRel)),specifier));
  if(resolved.startsWith('../')||resolved==='..') throw new Error(`STANDALONE_IMPORT_OUTSIDE_PREVIEW:${fromRel}:${specifier}`);
  return resolved;
}
function extractRelativeSpecifiers(source:string){
  const out=new Set<string>();
  for(const regex of [/\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1/g,/\bimport\s*(['"])(\.{1,2}\/[^'"]+)\1/g]){
    let match; while((match=regex.exec(source))) out.add(match[2]);
  }
  return [...out];
}
function rewriteImports(source:string,fromRel:string){
  const rewrite=(specifier:string)=>moduleId(resolveRelative(fromRel,specifier));
  source=source.replace(/\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1/g,(_m,q,spec)=>`from ${q}${rewrite(spec)}${q}`);
  source=source.replace(/\bimport\s*(['"])(\.{1,2}\/[^'"]+)\1/g,(_m,q,spec)=>`import ${q}${rewrite(spec)}${q}`);
  return source;
}

const modules=new Map<string,string>();
const visit=(rel:string)=>{
  rel=posix(rel);
  if(modules.has(rel)) return;
  const full=path.join(previewRoot,...rel.split('/'));
  if(!fs.existsSync(full)) throw new Error(`STANDALONE_MODULE_MISSING:${rel}`);
  const raw=fs.readFileSync(full,'utf8');
  if(/(?:from\s*|import\s*)['"]node:/.test(raw)) throw new Error(`STANDALONE_NODE_IMPORT:${rel}`);
  modules.set(rel,'');
  for(const spec of extractRelativeSpecifiers(raw)) visit(resolveRelative(rel,spec));
  const rewritten=rewriteImports(raw,rel);
  if(/\b(?:from\s*|import\s*)['"]\.{1,2}\//.test(rewritten)) throw new Error(`STANDALONE_UNREWRITTEN_IMPORT:${rel}`);
  modules.set(rel,rewritten);
};
visit(entryRel);

// P2.2: every product asset (home icons, the approved brand logo) is embedded as a data: URL keyed by its path
// relative to the product root — the embedded host resolves `assetUrl('assets/…')` from this map.
const ASSET_TYPES:Record<string,string>={'.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const assetsDir=path.join(root,'public','assets');
const standaloneAssets:Record<string,string>={};
const walkAssets=(dir:string)=>{
  if(!fs.existsSync(dir)) return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){ walkAssets(full); continue; }
    const type=ASSET_TYPES[path.extname(entry.name).toLowerCase()];
    if(!entry.isFile()||!type) continue;
    // the canonical brand ORIGINAL (PNG) is a provenance source, not a delivery asset: the app serves the WebP derivative
    if(posix(path.relative(path.join(root,'public'),full))==='assets/brand/kimyolab-logo.png') continue;
    standaloneAssets[posix(path.relative(path.join(root,'public'),full))]=`data:${type};base64,${fs.readFileSync(full).toString('base64')}`;
  }
};
walkAssets(assetsDir);

const content:Record<string,string>={};
const walkContent=(dir:string)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) walkContent(full);
    else if(entry.isFile()&&entry.name.endsWith('.json')){
      const key=posix(path.relative(contentRoot,full));
      // Raw text is embedded verbatim so runtime SHA-256 integrity checks see the exact pack bytes.
      const text=fs.readFileSync(full,'utf8');
      JSON.parse(text);
      content[key]=text;
    }
  }
};
walkContent(contentRoot);

const css=fs.readFileSync(path.join(previewRoot,'ui','tokens','kimyolab.css'),'utf8');
let shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
shell=shell.replace(/\s*<link\s+rel="stylesheet"\s+href="\/app-preview\/ui\/tokens\/kimyolab\.css"\s*>/i,`\n  <style data-kimyolab-inline="tokens">\n${css}\n  </style>`);
shell=shell.replace(/\s*<script\s+type="module"\s+src="\/app-preview\/app\/bootstrap\.js"><\/script>/i,'');
shell=shell.replace('data-kimyolab-entry="canonical"','data-kimyolab-entry="standalone"');
if(!shell.includes('data-kimyolab-entry="standalone"')) throw new Error('STANDALONE_ENTRY_MARKER_MISSING');
// the static shell works before JS too: logical routes become hash routes, asset URLs become the embedded data URLs
shell=shell.replace(/<a([^>]*?) href="\/([^"]*)" data-kl-route="([^"]*)"/g,(_m,pre,_href,route)=>`<a${pre} href="#${route}" data-kl-route="${route}"`);
shell=shell.replace(/(src|href)="\/(assets\/[^"]+)"/g,(m,attr,rel)=>standaloneAssets[rel]?`${attr}="${standaloneAssets[rel]}"`:m);
if(/(?:src|href)="\/(?!\/)/.test(shell)) throw new Error('STANDALONE_ROOT_ABSOLUTE_URL');

const moduleObject=Object.fromEntries([...modules.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([rel,source])=>[moduleId(rel),source]));
const safeJson=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c');
const boot=`
  <script type="application/json" id="kl-standalone-content">${safeJson(content)}</script>
  <script type="application/json" id="kl-standalone-modules">${safeJson(moduleObject)}</script>
  <script>
  (()=>{
    const content=JSON.parse(document.getElementById('kl-standalone-content').textContent||'{}');
    const sources=JSON.parse(document.getElementById('kl-standalone-modules').textContent||'{}');
    // P2.2: the standalone artifact is the SAME product with an embedded HOST (ADR-P2-003): the host serves these pack
    // bytes to the ContentClient, which runs the same manifest/checksum/version checks as over HTTP. No global fetch
    // patch, no standalone flag for features to inspect.
    globalThis.__KIMYOLAB_HOST__=Object.freeze({kind:'embedded',content,assets:${safeJson(standaloneAssets)}});
    const imports={};
    for(const [id,source] of Object.entries(sources)) imports[id]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const map=document.createElement('script'); map.type='importmap'; map.textContent=JSON.stringify({imports});
    document.currentScript.after(map);
    globalThis.__KIMYOLAB_STANDALONE_MODULE_URLS__=imports;
  })();
  </script>
  <script type="module">import('kl/app/bootstrap.js').catch(error=>{console.error(error);const main=document.getElementById('app-main');if(main)main.innerHTML='<div class="kl-shell kl-state"><h1>KimyoLab yuklanmadi</h1><p>Standalone modulni ishga tushirishda xatolik yuz berdi.</p></div>';});</script>
`;
// a function replacement: the embedded JSON may contain `$&`/`$'` sequences a string replacement would expand
shell=shell.replace(/\s*<\/body>/i,()=>`${boot}\n</body>`);

fs.rmSync(outputDir,{recursive:true,force:true});
fs.mkdirSync(outputDir,{recursive:true});
fs.writeFileSync(outputFile,shell,'utf8');
fs.writeFileSync(indexAlias,shell,'utf8');
const bytes=fs.readFileSync(outputFile);
const report={
  generatedAt:new Date().toISOString(),
  output:path.relative(root,outputFile),
  aliases:[path.relative(root,indexAlias)],
  entry:moduleId(entryRel),
  moduleCount:modules.size,
  contentJsonFiles:Object.keys(content).length,
  embeddedAssetCount:Object.keys(standaloneAssets).length,
  sizeBytes:bytes.length,
  sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  architecture:'modular-esm-in-single-html-delivery',
  routeMode:'hash',
  host:'embedded',
  embeddedAssets:Object.keys(standaloneAssets).sort(),
  valid:modules.size>0&&Object.prototype.hasOwnProperty.call(content,'manifest.json')&&!shell.includes('src="/app-preview/')&&!shell.includes('href="/app-preview/'),
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports','standalone-build.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(!report.valid) process.exitCode=1;
