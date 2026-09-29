import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function wait(url){for(let i=0;i<60;i++){try{const r=await fetch(url);if(r.status)return;}catch{}await sleep(100);}throw new Error('SERVER_START_TIMEOUT');}
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1'},stdio:'ignore'});
try{
  const base='http://127.0.0.1:4173'; await wait(base+'/');
  const checks=[];
  for(const route of ['/', '/curriculum', '/labs','/external-lab/ext.chemai.rate?lu=lu.8.19','/search?q=kimyo','/progress','/learn/lu.7.03','/practice/practice.experiment.7.1','/worksheet/lu.7.03']){
    const r=await fetch(base+route); const text=await r.text();
    checks.push({id:`route:${route}`,pass:r.status===200&&text.includes('id="app-main"'),status:r.status,csp:!!r.headers.get('content-security-policy')});
  }
  for(const asset of ['/app-preview/app/bootstrap.js','/app-preview/ui/tokens/kimyolab.css','/content/manifest.json']){
    const r=await fetch(base+asset); checks.push({id:`asset:${asset}`,pass:r.status===200,status:r.status,contentType:r.headers.get('content-type')});
  }
  for(const bad of ['/source/secret.xlsx','/%2e%2e/%2e%2e/etc/passwd']){
    const r=await fetch(base+bad,{redirect:'manual'}); checks.push({id:`security:${bad}`,pass:[403,404].includes(r.status),status:r.status});
  }
  const nobookStatus=await fetch(base+'/api/external-labs/nobook/status'); const nobookJson=await nobookStatus.json(); checks.push({id:'api:nobook-status',pass:nobookStatus.status===200&&typeof nobookJson.configured==='boolean'&&typeof nobookJson.sdkReady==='boolean'&&!('app_secret' in nobookJson)&&!('appSecret' in nobookJson),status:nobookStatus.status,configured:nobookJson.configured,sdkReady:nobookJson.sdkReady});
  const providersStatus=await fetch(base+'/api/external-labs/status'); const providersJson=await providersStatus.json(); checks.push({id:'api:external-provider-status',pass:providersStatus.status===200&&typeof providersJson?.providers?.nobook?.configured==='boolean'&&providersJson?.providers?.chemai?.configured===true&&providersJson?.providers?.['chem-lab-station']?.configured===true&&!JSON.stringify(providersJson).includes(process.env.NOBOOK_APP_SECRET||'__never__'),status:providersStatus.status});
  const manifest=await (await fetch(base+'/content/manifest.json')).json();
  checks.push({id:'content:activeVersion',pass:typeof manifest.activeVersion==='string'&&manifest.activeVersion.length>0,value:manifest.activeVersion});
  const shell=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const staticA11y={lang:/<html[^>]+lang=/.test(shell),main:/<main\b/.test(shell),skip:/class="kl-skip"/.test(shell),navLabel:/<nav[^>]+aria-label=/.test(shell),metaViewport:/name="viewport"/.test(shell)};
  const report={generatedAt:new Date().toISOString(),checks,httpSmoke:{status:checks.every(c=>c.pass)?'pass':'fail',passed:checks.filter(c=>c.pass).length,total:checks.length},staticAccessibility:{status:Object.values(staticA11y).every(Boolean)?'pass':'fail',checks:staticA11y}};
  fs.writeFileSync(path.join(root,'reports/http-smoke.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({httpSmoke:report.httpSmoke,staticAccessibility:report.staticAccessibility.status}));
  if(report.httpSmoke.status!=='pass'||report.staticAccessibility.status!=='pass') process.exitCode=1;
} finally {server.kill('SIGTERM');}
