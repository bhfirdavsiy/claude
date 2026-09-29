import { parseAppRoute } from './routes.ts';
import { ContentClient } from './content-client.ts';
import { renderHome } from '../features/home/render.ts';
import { renderError, renderLearningGuide, renderLearningPracticeStage, renderLearningQuiz, renderLoading, renderNotFound } from '../features/learning-hub/render.ts';
import {renderPractice} from '../features/practice/render.ts';
import {ReferencePracticeSession} from '../features/practice/session.ts';
import {BrowserProgressService} from '../features/progress/service.ts';
import {buildProgressViewModel} from '../features/progress/model.ts';
import {renderProgress} from '../features/progress/render.ts';
import {renderSearch} from '../features/search/render.ts';
import {buildWorksheetModel} from '../features/worksheet/model.ts';
import {renderWorksheet} from '../features/worksheet/render.ts';
import {renderLabs} from '../features/labs/render.ts';
import {renderCurriculum} from '../features/curriculum/render.ts';
import {renderExternalLab} from '../features/labs/external-render.ts';

const main=document.getElementById('app-main');
if(!(main instanceof HTMLElement)) throw new Error('APP_MAIN_MISSING');
const client=new ContentClient({baseUrl:'/content'});
const progressService=new BrowserProgressService((globalThis as any).indexedDB);
const standalone=(globalThis as any).__KIMYOLAB_STANDALONE__===true;

function currentLocation(){
  if(!standalone) return {pathname:location.pathname,searchParams:new URLSearchParams(location.search)};
  const raw=location.hash.startsWith('#')?location.hash.slice(1):location.hash;
  const value=raw&&raw.startsWith('/')?raw:'/';
  const parsed=new URL(value,'https://standalone.kimyolab.local');
  return {pathname:parsed.pathname,searchParams:parsed.searchParams};
}

function navigateInternal(href:string){
  const url=new URL(href,'https://kimyolab.local');
  if(standalone){
    const next=`${url.pathname}${url.search}`;
    if(location.hash===`#${next}`) void renderCurrent();
    else location.hash=next;
    return;
  }
  history.pushState({},'',`${url.pathname}${url.search}`);
  void renderCurrent();
}

async function renderCurrent(){
  const active=currentLocation();
  const route=parseAppRoute(active.pathname);
  if(route.name==='home'){renderHome(main);return;}
  if(route.name==='curriculum'){renderLoading(main);try{renderCurriculum(main,await client.loadCurriculum());}catch{renderError(main,'Mavzularni yuklab bo‘lmadi.');}return;}
  if(route.name==='labs'){renderLoading(main);try{renderLabs(main,await client.loadLabCatalog());}catch{renderError(main,'Virtual laboratoriyalarni yuklab bo‘lmadi.');}return;}
  if(route.name==='external-lab'){renderLoading(main);try{const binding=await client.getExternalLabBinding(route.bindingId);const lu=active.searchParams.get('lu')??binding.learningUnitIds[0];if(!binding.learningUnitIds.includes(lu))throw new Error('EXTERNAL_LAB_LEARNING_UNIT_MISMATCH');await renderExternalLab(main,binding,lu);}catch{renderError(main,'Tashqi laboratoriya integratsiyasini yuklab bo‘lmadi.');}return;}
  if(route.name==='worksheet'){
    renderLoading(main);
    try{const [hub,versions]=await Promise.all([client.loadLearningHub(route.learningUnitId),client.getRuntimeVersions()]);renderWorksheet(main,buildWorksheetModel(hub,versions));}
    catch{renderError(main,'Ish varaqasini yuklab bo‘lmadi.');}
    return;
  }
  if(route.name==='practice'){
    renderLoading(main);
    try{const page=await client.loadPractice(route.practiceActivityId);renderPractice(main,page,new ReferencePracticeSession(page),(result)=>progressService.recordPracticeResult(page,result).then(()=>undefined));}
    catch{renderError(main,'Faoliyatni yuklab bo‘lmadi.');}
    return;
  }
  if(route.name==='learning-unit'||route.name==='learning-guide'||route.name==='learning-practice'||route.name==='learning-quiz'){
    renderLoading(main);
    try{
      const learningUnitId=route.learningUnitId;
      const [hub,versions]=await Promise.all([client.loadLearningHub(learningUnitId),client.getRuntimeVersions()]);
      const cycle=await progressService.getCycleSnapshot(learningUnitId).catch(()=>({guideComplete:false,practiceComplete:false,reinforcementComplete:false,status:'not_started' as const}));
      if(route.name==='learning-practice') renderLearningPracticeStage(main,hub,cycle);
      else if(route.name==='learning-quiz') renderLearningQuiz(main,hub,cycle,async payload=>{await progressService.recordReinforcement(learningUnitId,versions,payload);});
      else renderLearningGuide(main,hub,cycle,async()=>{try{await progressService.markGuideComplete(learningUnitId,versions);}catch{}navigateInternal(`/learn/${learningUnitId}/practice`);});
    }
    catch{renderError(main);}
    return;
  }
  if(route.name==='progress'){
    renderLoading(main);
    try{const [rows,groups]=await Promise.all([progressService.listProgress(),Promise.all([7,8,9,10,11].map(g=>client.listLearningUnits(g)))]);renderProgress(main,buildProgressViewModel(rows,groups.flat()));}
    catch{renderError(main,'Natijalarni yuklab bo‘lmadi. Brauzer saqlash imkoniyatini tekshiring.');}
    return;
  }
  if(route.name==='search'){renderLoading(main);try{renderSearch(main,await client.loadSearchIndex(),active.searchParams.get('q')??'');}catch{renderError(main,'Qidiruv ma’lumotlarini yuklab bo‘lmadi.');}return;}
  renderNotFound(main);
}

document.addEventListener('click',(event)=>{
  const target=event.target;
  if(!(target instanceof Element)) return;
  const anchor=target.closest('a[href^="/"]');
  if(!(anchor instanceof HTMLAnchorElement)) return;
  const href=anchor.getAttribute('href');
  if(!href) return;
  if(!standalone){
    const url=new URL(anchor.href,location.origin);
    if(url.origin!==location.origin) return;
  }
  event.preventDefault();
  navigateInternal(href);
});
window.addEventListener('popstate',()=>void renderCurrent());
if(standalone) window.addEventListener('hashchange',()=>void renderCurrent());
void renderCurrent();
