import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reports=path.join(root,'reports');
const visualDir=path.join(reports,'visual-regression','phase12-smoke');
fs.mkdirSync(visualDir,{recursive:true});

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function waitHttp(url,timeout=12000){const start=Date.now(); while(Date.now()-start<timeout){try{const r=await fetch(url);if(r.ok)return r;}catch{} await sleep(150);} throw new Error(`HTTP_TIMEOUT ${url}`);}
function findChromium(){
  const commandCandidates=[process.env.CHROME_BIN,'chromium','chromium-browser','google-chrome','google-chrome-stable','msedge','msedge.exe','chrome','chrome.exe'].filter(Boolean);
  const locator=process.platform==='win32'?'where':'which';
  for(const name of commandCandidates){const r=spawnSync(locator,[name],{encoding:'utf8'});if(r.status===0&&r.stdout.trim())return r.stdout.trim().split(/\r?\n/)[0];}
  if(process.platform==='win32'){
    const dirs=[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean);
    const rels=['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'];
    for(const dir of dirs) for(const rel of rels){const full=path.join(dir,rel);if(fs.existsSync(full))return full;}
  }
  return null;
}
class CDP {
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map();this.events=[];}
  async open(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
    this.ws.addEventListener('message',(ev)=>{const msg=JSON.parse(ev.data);if(msg.id){const p=this.pending.get(msg.id);if(p){this.pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}} else if(msg.method){this.events.push(msg);}});
  }
  call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){try{this.ws?.close();}catch{}}
}

const hostIp=process.env.KIMYOLAB_BROWSER_HOST || (()=>{try{return spawnSync('hostname',['-I'],{encoding:'utf8'}).stdout.trim().split(/\s+/)[0]||'127.0.0.1';}catch{return '127.0.0.1';}})();
const appBase=`http://${hostIp}:4173`;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'0.0.0.0'},stdio:['ignore','pipe','pipe']});
let chrome;
try{
  await waitHttp(`${appBase}/app.html`);
  const chromeBin=findChromium();
  if(!chromeBin) throw new Error('CHROMIUM_NOT_FOUND');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-chrome-'));
  chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9222',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  await waitHttp('http://127.0.0.1:9222/json/version');
  const targets=await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page=targets.find(x=>x.type==='page');
  if(!page?.webSocketDebuggerUrl) throw new Error('CDP_PAGE_TARGET_NOT_FOUND');
  const cdp=new CDP(page.webSocketDebuggerUrl); await cdp.open();
  await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await cdp.call('Performance.enable'); await cdp.call('Accessibility.enable');
  await cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__klVitals={cls:0,lcp:0,inp:0,longTasks:0};
    try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__klVitals.cls+=e.value||0;}}).observe({type:'layout-shift',buffered:true});}catch{}
    try{new PerformanceObserver(l=>{const a=l.getEntries();const e=a[a.length-1];if(e)window.__klVitals.lcp=e.startTime||0;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
    try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__klVitals.inp=Math.max(window.__klVitals.inp,e.duration||0);}).observe({type:'event',buffered:true,durationThreshold:16});}catch{}
    try{new PerformanceObserver(l=>{window.__klVitals.longTasks+=l.getEntries().length;}).observe({type:'longtask',buffered:true});}catch{}
  `});

  const routes=[
    {name:'home',path:'/'},
    {name:'labs',path:'/labs'},
    {name:'external-chemai',path:'/external-lab/ext.chemai.rate?lu=lu.8.19'},
    {name:'external-nobook-fallback',path:'/external-lab/ext.nobook.inorganic?lu=lu.8.14'},
    {name:'search',path:'/search?q=kimyo'},
    {name:'progress',path:'/progress'},
    {name:'learning-unit',path:'/learn/lu.7.03'},
    {name:'practice',path:'/practice/practice.experiment.7.1'},
    {name:'worksheet',path:'/worksheet/lu.7.03'},
  ];
  const routeResults=[];
  for(const route of routes){
    cdp.events.length=0;
    await cdp.call('Page.navigate',{url:`${appBase}${route.path}`});
    for(let i=0;i<60;i++){const r=await cdp.call('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(r.result?.value==='complete')break;await sleep(100);}
    await sleep(700);
    const evalResult=await cdp.call('Runtime.evaluate',{expression:`(()=>{
      const text=(document.body?.innerText||'').trim();
      const interactive=[...document.querySelectorAll('a,button,input,select,textarea')];
      const missingLabels=interactive.filter(el=>{
        if(el.tagName==='A') return !(el.textContent||'').trim()&&!el.getAttribute('aria-label');
        if(el.tagName==='BUTTON') return !(el.textContent||'').trim()&&!el.getAttribute('aria-label');
        if(['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {const id=el.id; return !el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!(id&&document.querySelector('label[for="'+CSS.escape(id)+'"]'));}
        return false;
      }).length;
      const nav=performance.getEntriesByType('navigation')[0];
      const fcp=performance.getEntriesByName('first-contentful-paint')[0];
      return {title:document.title,lang:document.documentElement.lang,hasMain:!!document.querySelector('main'),hasSkip:!!document.querySelector('.kl-skip'),textLength:text.length,bodyText:text.slice(0,500),missingLabels,nav:nav?{duration:nav.duration,domContentLoaded:nav.domContentLoadedEventEnd,responseEnd:nav.responseEnd}:null,fcp:fcp?.startTime||0,vitals:window.__klVitals||{}};
    })()`,returnByValue:true});
    const data=evalResult.result.value;
    const exceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown');
    const severeConsole=cdp.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&['error','assert'].includes(e.params?.type));
    const shot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const shotPath=path.join(visualDir,`${route.name}.png`); fs.writeFileSync(shotPath,Buffer.from(shot.data,'base64'));
    const ax=await cdp.call('Accessibility.getFullAXTree');
    const namedInteractive=(ax.nodes||[]).filter(n=>['button','link','textbox','combobox'].includes(n.role?.value)&&String(n.name?.value||'').trim()).length;
    const errorText=/yuklab bo[‘']lmadi|xatolik|error/i.test(data.bodyText||'');
    routeResults.push({...route,url:route.path,...data,exceptions:exceptions.length,severeConsole:severeConsole.length,axNamedInteractive:namedInteractive,screenshot:path.relative(root,shotPath).replaceAll(path.sep,'/'),screenshotSha256:crypto.createHash('sha256').update(fs.readFileSync(shotPath)).digest('hex'),pass:data.textLength>20&&data.hasMain&&exceptions.length===0&&severeConsole.length===0&&!errorText});
  }
  cdp.close();

  const prodBuild=JSON.parse(fs.readFileSync(path.join(reports,'production-build.json'),'utf8'));
  const e2ePass=routeResults.every(r=>r.pass);
  const a11yPass=routeResults.every(r=>r.lang&&r.hasMain&&r.hasSkip&&r.missingLabels===0);
  const perfRows=routeResults.map(r=>({route:r.path,fcp:Math.round(r.fcp||0),lcp:Math.round(r.vitals?.lcp||0),cls:Number((r.vitals?.cls||0).toFixed(4)),duration:Math.round(r.nav?.duration||0),longTasks:r.vitals?.longTasks||0}));
  const perfPass=perfRows.every(r=>r.fcp<=3000&&(r.lcp===0||r.lcp<=4000)&&r.cls<=0.1&&r.duration<=5000);
  const managedBlocked=routeResults.every(r=>/organization doesn.t allow you to view this site/i.test(r.bodyText||''));
  const browserStatus=(pass)=>managedBlocked?'blocked':(pass?'pass':'fail');
  const externalProviderReadiness=fs.existsSync(path.join(reports,'external-provider-readiness.json'))?JSON.parse(fs.readFileSync(path.join(reports,'external-provider-readiness.json'),'utf8')):null;
  const report={
    generatedAt:new Date().toISOString(),environment:{browser:path.basename(chromeBin),managedPolicyBlocked:managedBlocked},evidence:{routes:routeResults,performance:perfRows},
    externalProviders:externalProviderReadiness?{status:externalProviderReadiness.status,readyReferenceBindings:externalProviderReadiness.readyReferenceBindings,nobook:{partnerConfigured:externalProviderReadiness.nobook?.partnerConfigured,sdkReady:externalProviderReadiness.nobook?.sdkReady,sdkChecksumValid:externalProviderReadiness.nobook?.sdkChecksumValid,experimentUrlValid:externalProviderReadiness.nobook?.experimentUrlValid}}:undefined,
    prodBuild:{status:prodBuild.valid?'pass':'fail',fileCount:prodBuild.fileCount,sha256:prodBuild.sha256,deployFileCount:prodBuild.deployFileCount,deploySurfaceSha256:prodBuild.deploySurfaceSha256},
    e2e:{status:browserStatus(e2ePass),reason:managedBlocked?'MANAGED_BROWSER_URL_POLICY':undefined,routesPassed:routeResults.filter(r=>r.pass).length,routesTotal:routeResults.length},
    accessibility:{status:browserStatus(a11yPass),reason:managedBlocked?'MANAGED_BROWSER_URL_POLICY':undefined,method:'real Chromium DOM + Accessibility tree smoke',missingLabels:managedBlocked?null:routeResults.reduce((a,r)=>a+r.missingLabels,0)},
    webVitals:{status:browserStatus(perfPass),reason:managedBlocked?'MANAGED_BROWSER_URL_POLICY':undefined,method:'real Chromium PerformanceObserver smoke',thresholds:{fcpMs:3000,lcpMs:4000,cls:0.1,navigationDurationMs:5000},note:'INP is not asserted by navigation-only smoke; interaction-specific performance remains reviewer evidence.'},
    visual:{status:managedBlocked?'blocked':'pending',reason:managedBlocked?'MANAGED_BROWSER_URL_POLICY':'HUMAN_VISUAL_REVIEW_REQUIRED',screenshots:managedBlocked?[]:routeResults.map(r=>({route:r.path,path:r.screenshot,sha256:r.screenshotSha256}))}
  };
  fs.writeFileSync(path.join(reports,'browser-gates.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({prodBuild:report.prodBuild.status,e2e:report.e2e.status,accessibility:report.accessibility.status,webVitals:report.webVitals.status,visual:report.visual.status,managedPolicyBlocked:managedBlocked}));
  if(!prodBuild.valid||(!managedBlocked&&(!e2ePass||!a11yPass||!perfPass))) process.exitCode=1;
} catch(error){
  const report={generatedAt:new Date().toISOString(),prodBuild:{status:'pending'},e2e:{status:'pending'},accessibility:{status:'pending'},webVitals:{status:'pending'},visual:{status:'pending'},error:String(error?.stack||error)};
  fs.writeFileSync(path.join(reports,'browser-gates.json'),JSON.stringify(report,null,2)+'\n');
  console.error(report.error); process.exitCode=1;
} finally {try{chrome?.kill('SIGTERM');}catch{} try{server.kill('SIGTERM');}catch{}}
