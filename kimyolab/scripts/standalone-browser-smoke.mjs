import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist-standalone','KimyoLab_standalone.html');
const reportFile=path.join(root,'reports','standalone-browser-smoke.json');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function findChromium(){
  for(const name of [process.env.CHROME_BIN,'chromium','chromium-browser','google-chrome','google-chrome-stable','msedge','chrome'].filter(Boolean)){
    const r=spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8'});
    if(r.status===0&&r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}
class CDP{
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map();this.events=[];}
  async open(){this.ws=new WebSocket(this.url);await new Promise((r,j)=>{this.ws.addEventListener('open',r,{once:true});this.ws.addEventListener('error',j,{once:true});});this.ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}else this.events.push(m);});}
  call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){try{this.ws?.close();}catch{}}
}
function write(report){fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}

if(!fs.existsSync(output)){write({generatedAt:new Date().toISOString(),status:'fail',reason:'STANDALONE_BUILD_MISSING'});process.exit(1);}
const chromeBin=findChromium();
if(!chromeBin){write({generatedAt:new Date().toISOString(),status:'blocked',reason:'CHROMIUM_NOT_FOUND'});process.exit(0);}
const port=9345;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kimyolab-standalone-smoke-'));
const chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
try{
  let ready=false;
  for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/json/list`);if(r.ok){ready=true;break;}}catch{}await sleep(100);}
  if(!ready) throw new Error('CHROMIUM_CDP_TIMEOUT');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page=targets.find(x=>x.type==='page'); if(!page?.webSocketDebuggerUrl) throw new Error('CDP_PAGE_TARGET_NOT_FOUND');
  const cdp=new CDP(page.webSocketDebuggerUrl);await cdp.open();await cdp.call('Runtime.enable');await cdp.call('Page.enable');
  const frame=(await cdp.call('Page.getFrameTree')).frameTree.frame.id;
  await cdp.call('Page.setDocumentContent',{frameId:frame,html:fs.readFileSync(output,'utf8')});
  await sleep(2200);
  const home=(await cdp.call('Runtime.evaluate',{expression:`(()=>({entry:document.body?.dataset?.kimyolabEntry||'',main:document.querySelector('#app-main')?.innerText||'',hasStart:[...document.querySelectorAll('a')].some(a=>a.textContent.includes('O‘rganishni boshlash'))}))()`,returnByValue:true})).result.value;
  const homeExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  const click=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const a=[...document.querySelectorAll('a')].find(x=>x.textContent.includes('O‘rganishni boshlash'));if(!a)return false;a.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(1500);
  const curriculum=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',firstHref:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).find(h=>h&&h.startsWith('/learn/'))||''}))()`,returnByValue:true})).result.value;
  const curriculumExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  const unitClick=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const a=[...document.querySelectorAll('a')].find(x=>(x.getAttribute('href')||'').startsWith('/learn/'));if(!a)return false;a.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(1200);
  const unit=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',guideButton:[...document.querySelectorAll('button')].some(b=>(b.textContent||'').includes('Nazariyani yakunlash'))}))()`,returnByValue:true})).result.value;
  const guideAdvance=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('Nazariyani yakunlash'));if(!b)return false;b.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(900);
  const practiceStage=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',practiceHref:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).find(h=>h&&h.startsWith('/practice/'))||''}))()`,returnByValue:true})).result.value;
  await cdp.call('Runtime.evaluate',{expression:`(()=>{const id=location.hash.split('/')[2]||'';if(id.startsWith('lu.'))location.hash='#/learn/'+id+'/quiz';return true;})()`});
  await sleep(800);
  const reinforcement=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',hasForm:!!document.querySelector('.kl-reinforcement-form')}))()`,returnByValue:true})).result.value;
  const unitExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  const labNav=(await cdp.call('Runtime.evaluate',{expression:`(()=>{location.hash='#/labs';return true;})()`,returnByValue:true})).result.value;
  await sleep(1700);
  const labs=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',externalHref:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).find(h=>h&&h.startsWith('/external-lab/'))||'',nativeHref:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).find(h=>h&&h.startsWith('/practice/practice.experiment.'))||''}))()`,returnByValue:true})).result.value;
  const labExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  const nativeClick=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const a=[...document.querySelectorAll('a')].find(x=>(x.getAttribute('href')||'').startsWith('/practice/practice.experiment.'));if(!a)return false;a.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(1200);
  const nativeLab=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||'',stepButtons:[...document.querySelectorAll('button')].filter(b=>(b.textContent||'').trim()==='Bajarish').length,workspace:!!document.querySelector('.kl-experiment-stage')}))()`,returnByValue:true})).result.value;
  const firstStepClick=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Bajarish');if(!b)return false;b.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(700);
  const nativeAfterStep=(await cdp.call('Runtime.evaluate',{expression:`(()=>({observation:document.querySelector('.kl-experiment-observation')?.textContent||'',done:[...document.querySelectorAll('.kl-experiment-step.is-done')].length,disabled:[...document.querySelectorAll('.kl-experiment-step button[disabled]')].length}))()`,returnByValue:true})).result.value;
  const nativeExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  await cdp.call('Runtime.evaluate',{expression:`(()=>{location.hash='#/practice/practice.experiment.7.9';return true;})()`});
  await sleep(1100);
  const groundedLabLoaded=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,hasStep:[...document.querySelectorAll('button')].some(x=>(x.textContent||'').trim()==='Bajarish')}))()`,returnByValue:true})).result.value;
  const groundedStepClick=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Bajarish');if(!b)return false;b.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(600);
  const groundedObservation=(await cdp.call('Runtime.evaluate',{expression:`document.querySelector('.kl-experiment-observation')?.textContent||''`,returnByValue:true})).result.value;
  const groundedExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.events.length=0;
  await cdp.call('Runtime.evaluate',{expression:`(()=>{location.hash='#/labs';return true;})()`});
  await sleep(900);
  const externalClick=(await cdp.call('Runtime.evaluate',{expression:`(()=>{const a=[...document.querySelectorAll('a')].find(x=>(x.getAttribute('href')||'').startsWith('/external-lab/'));if(!a)return false;a.click();return true;})()`,returnByValue:true})).result.value;
  await sleep(1200);
  const external=(await cdp.call('Runtime.evaluate',{expression:`(()=>({hash:location.hash,main:document.querySelector('#app-main')?.innerText||''}))()`,returnByValue:true})).result.value;
  const externalExceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown').length;
  cdp.close();
  const unitText=String(unit.main||'').toLocaleLowerCase('uz');
  const practiceText=String(practiceStage.main||'').toLocaleLowerCase('uz');
  const reinforcementText=String(reinforcement.main||'').toLocaleLowerCase('uz');
  const checks={
    standaloneEntry:home.entry==='standalone',
    homeRendered:home.main.includes('Sinfingizni tanlang')&&home.hasStart===true,
    ctaClicked:click===true,
    curriculumRoute:curriculum.hash==='#/curriculum'&&Boolean(curriculum.firstHref),
    unitClicked:unitClick===true,
    hashRouting:unit.hash.startsWith('#/learn/lu.'),
    learningUnitGuideRendered:unitText.includes('1-bosqich · nazariya')&&unitText.includes('nazariya')&&unitText.includes('amaliyot')&&unitText.includes('mustahkamlash'),
    guideToPracticeLinked:guideAdvance===true&&practiceStage.hash.includes('/practice')&&practiceText.includes('2-bosqich · amaliyot')&&Boolean(practiceStage.practiceHref),
    reinforcementLinked:reinforcement.hash.includes('/quiz')&&reinforcementText.includes('3-bosqich · mustahkamlash')&&reinforcement.hasForm===true,
    labRouteOpened:labNav===true&&labs.hash==='#/labs',
    labCatalogRendered:labs.main.includes('KimyoLab laboratoriyalari')&&labs.main.includes('Hamkor va qo‘shimcha laboratoriyalar')&&labs.main.includes('ChemAI')&&labs.main.includes('NOBOOK'),
    nativeLabRouteClicked:nativeClick===true&&nativeLab.hash.startsWith('#/practice/practice.experiment.'),
    nativeLabWorkspaceRendered:nativeLab.main.includes('Virtual laboratoriya')&&nativeLab.main.includes('Tajriba bosqichlari')&&nativeLab.workspace===true&&nativeLab.stepButtons>0,
    nativeLabStepExecuted:firstStepClick===true&&nativeAfterStep.done>=1&&nativeAfterStep.disabled>=1&&nativeAfterStep.observation.startsWith('Bajarildi:'),
    reactionGroundedGuidedStep:groundedLabLoaded.hash==='#/practice/practice.experiment.7.9'&&groundedLabLoaded.hasStep===true&&groundedStepClick===true&&groundedObservation.includes('gaz ajralishi'),
    externalRouteClicked:externalClick===true&&external.hash.startsWith('#/external-lab/'),
    externalDetailRendered:external.main.includes('Qanday ishlaydi?')&&(external.main.includes('Hamkor laboratoriyani ochish')||external.main.includes('Hamkor virtual laboratoriya')),
    exceptions:homeExceptions+curriculumExceptions+unitExceptions+labExceptions+nativeExceptions+groundedExceptions+externalExceptions===0,
  };
  const pass=Object.values(checks).every(Boolean);
  write({generatedAt:new Date().toISOString(),status:pass?'pass':'fail',browser:path.basename(chromeBin),method:'CDP Page.setDocumentContent; no localhost/file URL dependency',checks,exceptionCount:homeExceptions+curriculumExceptions+unitExceptions+labExceptions+nativeExceptions+groundedExceptions+externalExceptions});
  if(!pass) process.exitCode=1;
}catch(error){write({generatedAt:new Date().toISOString(),status:'fail',reason:String(error?.stack||error)});process.exitCode=1;}
finally{try{chrome.kill('SIGTERM');}catch{}}
