import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist-standalone','KimyoLab_standalone.html');
const reportFile=path.join(root,'reports','standalone-mobile-smoke.json');
const shotFile=path.join(root,'reports','visual-regression','standalone-mobile-sinco.png');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function findChromium(){for(const name of [process.env.CHROME_BIN,'chromium','chromium-browser','google-chrome','google-chrome-stable','msedge','chrome'].filter(Boolean)){const r=spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8'});if(r.status===0&&r.stdout.trim())return r.stdout.trim().split(/\r?\n/)[0];}return null;}
class CDP{constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map();this.events=[];}async open(){this.ws=new WebSocket(this.url);await new Promise((r,j)=>{this.ws.addEventListener('open',r,{once:true});this.ws.addEventListener('error',j,{once:true});});this.ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else this.events.push(m);});}call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}close(){try{this.ws?.close();}catch{}}}
function write(report){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
if(!fs.existsSync(output)){write({status:'fail',reason:'STANDALONE_BUILD_MISSING'});process.exit(1);}
const chromeBin=findChromium();if(!chromeBin){write({status:'blocked',reason:'CHROMIUM_NOT_FOUND'});process.exit(0);}
const port=9346,profile=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-mobile-smoke-'));
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json/list`);if(r.ok){ready=true;break;}}catch{}await sleep(100);}if(!ready)throw new Error('CHROMIUM_CDP_TIMEOUT');
 const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=targets.find(x=>x.type==='page');if(!page?.webSocketDebuggerUrl)throw new Error('CDP_PAGE_TARGET_NOT_FOUND');
 const cdp=new CDP(page.webSocketDebuggerUrl);await cdp.open();await cdp.call('Runtime.enable');await cdp.call('Page.enable');await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const frame=(await cdp.call('Page.getFrameTree')).frameTree.frame.id;await cdp.call('Page.setDocumentContent',{frameId:frame,html:fs.readFileSync(output,'utf8')});
 // P2.9: wait for the dynamic home (bounded, 15 s) instead of a fixed 2.4 s sleep, which failed on a loaded machine with
 // the home not rendered yet; the checks below are unchanged
 for(let i=0;i<60;i++){await sleep(250);const r=await cdp.call('Runtime.evaluate',{expression:`(document.querySelector('.kl-hero__title')?.textContent||'').includes('Kimyo fanini tajribalar orqali o‘rganing')&&(document.querySelector('#app-main')?.innerText||'').includes('Sinfingizni tanlang')`,returnByValue:true});if(i>=9&&r?.result?.value===true)break;}
 const state=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const nav=document.querySelector('.kl-nav');const cta=[...document.querySelectorAll('a')].find(a=>a.textContent.includes('O‘rganishni boshlash'));return {entry:document.body?.dataset?.kimyolabEntry||'',viewport:innerWidth,pageScrollWidth:document.documentElement.scrollWidth,navDisplay:nav?getComputedStyle(nav).display:'none',navClientWidth:nav?.clientWidth||0,navScrollWidth:nav?.scrollWidth||0,ctaVisible:!!cta&&cta.getBoundingClientRect().width>0,title:document.querySelector('.kl-hero__title')?.textContent||'',main:document.querySelector('#app-main')?.innerText||''}})()`,returnByValue:true})).result.value;
 const shot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.dirname(shotFile),{recursive:true});fs.writeFileSync(shotFile,Buffer.from(shot.data,'base64'));
 const exceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;cdp.close();
 const checks={standaloneEntry:state.entry==='standalone',dynamicHome:state.title.includes('Kimyo fanini tajribalar orqali o‘rganing')&&state.main.includes('Sinfingizni tanlang'),noPageHorizontalOverflow:state.pageScrollWidth<=391,navAvailable:state.navDisplay!=='none'&&state.navClientWidth>0&&state.navScrollWidth>=state.navClientWidth,primaryCtaVisible:state.ctaVisible===true,virtualLabCountVisible:state.main.includes('57'),exceptions:exceptions===0};
 const pass=Object.values(checks).every(Boolean);write({generatedAt:new Date().toISOString(),status:pass?'pass':'fail',viewport:'390x844',checks,state:{viewport:state.viewport,pageScrollWidth:state.pageScrollWidth,navClientWidth:state.navClientWidth,navScrollWidth:state.navScrollWidth},screenshot:'reports/visual-regression/standalone-mobile-sinco.png',exceptionCount:exceptions});if(!pass)process.exitCode=1;
}catch(error){write({status:'fail',reason:String(error?.stack||error)});process.exitCode=1;}finally{try{chrome.kill('SIGTERM');}catch{}}
