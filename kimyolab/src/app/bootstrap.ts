import { parseAppRoute } from './routes.ts';
import { ContentClient, contentErrorMessage } from './content-client.ts';
import { renderHome } from '../features/home/render.ts';
import { renderError, renderLearningGuide, renderLearningPracticeStage, renderLearningQuiz, renderLoading, renderNotFound } from '../features/learning-hub/render.ts';
import {renderPractice} from '../features/practice/render.ts';
import {ReferencePracticeSession} from '../features/practice/session.ts';
import {BrowserProgressService,type PracticeAttemptSession} from '../features/progress/service.ts';
import type {AssessmentSessionState} from '../runtime/learning-orchestrator/types.ts';
import {buildProgressViewModel} from '../features/progress/model.ts';
import {renderProgress} from '../features/progress/render.ts';
import {renderSearch} from '../features/search/render.ts';
import {buildWorksheetModel} from '../features/worksheet/model.ts';
import {renderWorksheet} from '../features/worksheet/render.ts';
import {renderLabs} from '../features/labs/render.ts';
import {renderCurriculum} from '../features/curriculum/render.ts';
import {renderExternalLab} from '../features/labs/external-render.ts';

const mainElement=document.getElementById('app-main');
if(!(mainElement instanceof HTMLElement)) throw new Error('APP_MAIN_MISSING');
const main:HTMLElement=mainElement;
const client=new ContentClient({baseUrl:'/content'});
// The canonical evaluator reads prompts+keys through this source only at submission time (P1.1 C2/C3).
const progressService=new BrowserProgressService((globalThis as any).indexedDB,undefined,{assessmentContent:{loadAssessmentForEvaluation:(learningUnitId)=>client.loadAssessmentForEvaluation(learningUnitId)}});
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

let activePractice:PracticeAttemptSession|undefined;
let activeAssessment:AssessmentSessionState|undefined;

async function renderCurrent(){
  // Leaving a practice page ends its session: an unfinished attempt is closed as abandoned (never a success).
  if(activePractice){const previous=activePractice;activePractice=undefined;void progressService.leavePracticeSession(previous).catch(()=>undefined);}
  if(activeAssessment){progressService.leaveAssessment(activeAssessment);activeAssessment=undefined;}
  const active=currentLocation();
  const route=parseAppRoute(active.pathname);
  if(route.name==='home'){renderHome(main);return;}
  if(route.name==='curriculum'){renderLoading(main);try{renderCurriculum(main,await client.loadCurriculum());}catch(error){renderError(main,contentErrorMessage(error,'Mavzularni yuklab bo‘lmadi.'));}return;}
  if(route.name==='labs'){renderLoading(main);try{renderLabs(main,await client.loadLabCatalog());}catch(error){renderError(main,contentErrorMessage(error,'Virtual laboratoriyalarni yuklab bo‘lmadi.'));}return;}
  if(route.name==='external-lab'){renderLoading(main);try{const binding=await client.getExternalLabBinding(route.bindingId);const lu=active.searchParams.get('lu')??binding.learningUnitIds[0];if(!binding.learningUnitIds.includes(lu))throw new Error('EXTERNAL_LAB_LEARNING_UNIT_MISMATCH');await renderExternalLab(main,binding,lu,progressService.storage);}catch(error){renderError(main,contentErrorMessage(error,'Tashqi laboratoriya integratsiyasini yuklab bo‘lmadi.'));}return;}
  if(route.name==='worksheet'){
    renderLoading(main);
    try{const [hub,versions]=await Promise.all([client.loadLearningHub(route.learningUnitId),client.getRuntimeVersions()]);renderWorksheet(main,buildWorksheetModel(hub,versions));}
    catch(error){renderError(main,contentErrorMessage(error,'Ish varaqasini yuklab bo‘lmadi.'));}
    return;
  }
  if(route.name==='practice'){
    renderLoading(main);
    try{const page=await client.loadPractice(route.practiceActivityId);progressService.setVersionPolicy(await client.getEvidenceCompatibility());// One opened practice page = one attempt: commands go UI → orchestrator → engine → evidence boundary.
      const attemptSession=progressService.beginPracticeSession(page,new ReferencePracticeSession(page));activePractice=attemptSession;
      let persistError:unknown;
      renderPractice(main,page,{apply:async(command)=>{const out=await progressService.applyPracticeCommand(attemptSession,command);persistError=out.persistError;return out.result;}},async()=>{if(persistError)throw persistError;});}
    catch(error){renderError(main,contentErrorMessage(error,'Faoliyatni yuklab bo‘lmadi.'));}
    return;
  }
  if(route.name==='learning-unit'||route.name==='learning-guide'||route.name==='learning-practice'||route.name==='learning-quiz'){
    renderLoading(main);
    try{
      const learningUnitId=route.learningUnitId;
      const [hub,versions]=await Promise.all([client.loadLearningHub(learningUnitId),client.getRuntimeVersions()]);
      const cycle=await progressService.getCycleSnapshot(learningUnitId).catch(()=>({guideComplete:false,practiceComplete:false,reinforcementComplete:false,assessmentComplete:false,status:'not_started' as const}));
      if(route.name==='learning-practice') renderLearningPracticeStage(main,hub,cycle);
      else if(route.name==='learning-quiz'){
        // Objective items → canonical assessment (responses only). No items → reflection (never an assessment).
        let session=hub.assessment.items.length?progressService.beginAssessment(learningUnitId,versions,hub.concepts.map(c=>c.id)):undefined;
        activeAssessment=session;
        renderLearningQuiz(main,hub,cycle,async payload=>{await progressService.recordReinforcement(learningUnitId,versions,payload);},async responses=>{
          if(!session) throw new Error('ASSESSMENT_NOT_AVAILABLE');
          if(session.status!=='open'){session=progressService.retryAssessment(session);activeAssessment=session;}   // retry = new attempt
          const result=await progressService.submitAssessment(session,responses);
          session=result.session;
          return result;
        });
      }
      else renderLearningGuide(main,hub,cycle,async()=>{try{await progressService.markGuideComplete(learningUnitId,versions);}catch{}navigateInternal(`/learn/${learningUnitId}/practice`);});
    }
    catch(error){const message=contentErrorMessage(error,'');if(message)renderError(main,message);else renderError(main);}
    return;
  }
  if(route.name==='progress'){
    renderLoading(main);
    try{const [rows,groups]=await Promise.all([progressService.listProgress(),Promise.all([7,8,9,10,11].map(g=>client.listLearningUnits(g)))]);renderProgress(main,buildProgressViewModel(rows,groups.flat()));}
    catch(error){renderError(main,contentErrorMessage(error,'Natijalarni yuklab bo‘lmadi. Brauzer saqlash imkoniyatini tekshiring.'));}
    return;
  }
  if(route.name==='search'){renderLoading(main);try{renderSearch(main,await client.loadSearchIndex(),active.searchParams.get('q')??'');}catch(error){renderError(main,contentErrorMessage(error,'Qidiruv ma’lumotlarini yuklab bo‘lmadi.'));}return;}
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
// Attempts left open by a previous page lifetime (refresh, tab/window close) are closed as abandoned.
void progressService.recoverOrphanedAttempts().catch(()=>undefined);
window.addEventListener('popstate',()=>void renderCurrent());
if(standalone) window.addEventListener('hashchange',()=>void renderCurrent());
void renderCurrent();
