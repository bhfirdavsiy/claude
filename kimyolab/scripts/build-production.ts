import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeTreeHash} from './deploy-surface-hash.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Output directory: argv[2] (used by hermetic tests) or ./dist — the ONLY directory the server exposes.
const dist=path.resolve(process.argv[2]??path.join(root,'dist'));
const writeReport=!process.argv[2];
const publicDir=path.join(root,'public');

fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});

function copyTree(src:string,dst:string){
  fs.mkdirSync(dst,{recursive:true});
  for(const entry of fs.readdirSync(src,{withFileTypes:true})){
    const from=path.join(src,entry.name), to=path.join(dst,entry.name);
    if(entry.isDirectory()) copyTree(from,to); else fs.copyFileSync(from,to);
  }
}

copyTree(publicDir,dist);
const indexHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
fs.writeFileSync(path.join(dist,'index.html'),indexHtml,'utf8');
// app.html remains a compatibility alias for older browser-gate/runbook references.
fs.writeFileSync(path.join(dist,'app.html'),indexHtml,'utf8');

const full=computeTreeHash(dist);
// app.html is a local/browser-runner alias. The deployable release uses index.html + public assets.
const deploySurface=computeTreeHash(dist,['app.html']);
const report={
  generatedAt:new Date().toISOString(),builder:'dependency-free production pack',entry:'index.html',
  fileCount:full.fileCount,sha256:full.sha256,
  deployFileCount:deploySurface.fileCount,deploySurfaceSha256:deploySurface.sha256,
  requiredFiles:['app.html','index.html','app-preview/app/bootstrap.js','content/manifest.json'],valid:true,
};
for(const rel of report.requiredFiles) if(!fs.existsSync(path.join(dist,rel))) report.valid=false;
// Deployment surface guard: only public artefacts may be present in the build output.
const forbidden=full.files.filter((rel:string)=>/(^|\/)\./.test(rel)||/\.(ts|mjs|map|md|xlsx|env|sh|bat|ps1|cmd)$/i.test(rel)||/^(src|scripts|tests|docs|reports|review-packets|content-src|schemas|config|source|server|node_modules)\//.test(rel)||rel==='package.json'||rel==='package-lock.json');
(report as any).forbiddenFiles=forbidden;
if(forbidden.length) report.valid=false;
if(writeReport){fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/production-build.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
if(!report.valid) process.exitCode=1;
