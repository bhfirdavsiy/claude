import { parseAppRoute } from './routes.js';
import { ContentClient, contentErrorMessage } from './content-client.js';
import { renderHome } from '../features/home/render.js';
import { renderError, renderLearningGuide, renderLearningPracticeStage, renderLearningQuiz, renderLoading, renderNotFound } from '../features/learning-hub/render.js';
import {renderPractice} from '../features/practice/render.js';
import {ReferencePracticeSession} from '../features/practice/session.js';
import {BrowserProgressService,                           } from '../features/progress/service.js';
                                                                                      
import {buildProgressViewModel} from '../features/progress/model.js';
import {renderProgress} from '../features/progress/render.js';
import {renderSearch} from '../features/search/render.js';
import {buildWorksheetModel} from '../features/worksheet/model.js';
import {renderWorksheet} from '../features/worksheet/render.js';
import {renderLabs} from '../features/labs/render.js';
import {renderCurriculum} from '../features/curriculum/render.js';
import {renderExternalLab} from '../features/labs/external-render.js';

const mainElement=document.getElementById('app-main');
if(!(mainElement instanceof HTMLElement)) throw new Error('APP_MAIN_MISSING');
const main            =mainElement;
const client=new ContentClient({baseUrl:'/content'});
// The canonical evaluator reads prompts+keys through this source only at submission time (P1.1 C2/C3).
const progressService=new BrowserProgressService((globalThis       ).indexedDB,undefined,{assessmentContent:{loadAssessmentForEvaluation:(learningUnitId)=>client.loadAssessmentForEvaluation(learningUnitId)}});
const standalone=(globalThis       ).__KIMYOLAB_STANDALONE__===true;

function currentLocation(){
  if(!standalone) return {pathname:location.pathname,searchParams:new URLSearchParams(location.search)};
  const raw=location.hash.startsWith('#')?location.hash.slice(1):location.hash;
  const value=raw&&raw.startsWith('/')?raw:'/';
  const parsed=new URL(value,'https://standalone.kimyolab.local');
  return {pathname:parsed.pathname,searchParams:parsed.searchParams};
}

function navigateInternal(href       ){
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

let activePractice                                 ;
let activeAssessment                                 ;

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
      let persistError        ;
      renderPractice(main,page,{apply:async(command)=>{const out=await progressService.applyPracticeCommand(attemptSession,command);persistError=out.persistError;return out.result;}},async()=>{if(persistError)throw persistError;});}
    catch(error){renderError(main,contentErrorMessage(error,'Faoliyatni yuklab bo‘lmadi.'));}
    return;
  }
  if(route.name==='learning-unit'||route.name==='learning-guide'||route.name==='learning-practice'||route.name==='learning-quiz'){
    renderLoading(main);
    try{
      const learningUnitId=route.learningUnitId;
      const [hub,versions]=await Promise.all([client.loadLearningHub(learningUnitId),client.getRuntimeVersions()]);
      const cycle=await progressService.getCycleSnapshot(learningUnitId).catch(()=>({guideComplete:false,practiceComplete:false,reinforcementComplete:false,assessmentComplete:false,status:'not_started'         }));
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
        },hub.pilot?{refresh:()=>progressService.getMasteryView(learningUnitId,versions,hub.concepts.map(c=>c.id),hub.assessmentAvailability.status)}:undefined);
      }
      else renderLearningGuide(main,hub,cycle,async()=>{try{await progressService.markGuideComplete(learningUnitId,versions);}catch{}navigateInternal(`/learn/${learningUnitId}/practice`);});
    }
    catch(error){const message=contentErrorMessage(error,'');if(message)renderError(main,message);else renderError(main);}
    return;
  }
  if(route.name==='progress'){
    renderLoading(main);
    try{
      const [rows,groups,readiness,versions]=await Promise.all([progressService.listProgress(),Promise.all([7,8,9,10,11].map(g=>client.listLearningUnits(g))),client.loadReadiness(),client.getRuntimeVersions()]);
      const units=groups.flat();
      // Learner-facing mastery only for pilot units (P1.2 C1), computed under the active versions.
      const mastery=new Map();
      for(const row of rows){
        if(!readiness.pilotLearningUnitIds.includes(row.learningUnitId)) continue;
        const unit    =units.find((u    )=>u.id===row.learningUnitId);
        const availability=readiness.units?.find(u=>u.learningUnitId===row.learningUnitId)?.assessment.status??'NONE';
        if(unit) mastery.set(row.learningUnitId,await progressService.getMasteryView(row.learningUnitId,versions,unit.conceptIds??[],availability));
      }
      renderProgress(main,buildProgressViewModel(rows,units,mastery));
    }
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
