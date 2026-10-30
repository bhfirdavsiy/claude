import { parseAppRoute } from './routes.ts';
import { ContentClient, contentErrorMessage } from './content-client.ts';
import { resolveHost, runtimeDbName, attemptLockPrefix } from './host.ts';
import { configureHostPaths } from '../ui/host-paths.ts';
import { renderHome } from '../features/home/render.ts';
import { renderError, renderLearningGuide, renderLearningPracticeStage, renderLearningQuiz, renderLoading, renderNotFound } from '../features/learning-hub/render.ts';
import {renderPracticePage} from '../features/practice/host.ts';
import {createDefaultRendererRegistry} from '../renderers/index.ts';
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
import {renderDynamicLab,renderDynamicLabUnavailable} from '../features/dynamic-lab/render.ts';
import {isFeatureEnabled} from './feature-flags.ts';
import {renderPeriodicTable} from '../features/periodic/render.ts';
import {elementSearchEntries} from '../features/periodic/model.ts';
import {createLocalizer} from '../features/localization/element-names.ts';
import {knowledgeDomain,reactionExplorerHref,reactionSearchEntries,substanceHref,substanceSearchEntries} from '../features/chemistry-knowledge/explorer.ts';
import {renderSubstancePassport} from '../features/chemistry-knowledge/passport.ts';
import {renderReactionExplorer} from '../features/chemistry-knowledge/explorer-render.ts';
import {createLabeler} from '../features/practice/form-question.ts';

const mainElement=document.getElementById('app-main');
if(!(mainElement instanceof HTMLElement)) throw new Error('APP_MAIN_MISSING');
const main:HTMLElement=mainElement;
// P2.2: the ONE place that knows how KimyoLab is hosted (ADR-P2-003). Everything below receives the host's values;
// no feature, renderer, engine or store inspects which host it is.
const host=resolveHost(globalThis,document,window);
configureHostPaths({href:host.href,asset:host.assetUrl,api:host.apiUrl});
const client=new ContentClient({baseUrl:host.contentBase,fetchImpl:host.fetchContent});
// The canonical evaluator reads prompts+keys through this source only at submission time (P1.1 C2/C3).
const progressService=new BrowserProgressService((globalThis as any).indexedDB,runtimeDbName(host.storageNamespace),{lockPrefix:attemptLockPrefix(host.storageNamespace),assessmentContent:{loadAssessmentForEvaluation:(learningUnitId)=>client.loadAssessmentForEvaluation(learningUnitId)}});
const rendererRegistry=createDefaultRendererRegistry();

function currentLocation(){ return host.currentLocation(); }
function navigateInternal(href:string){ host.navigate(href); }
/** the feature-flag part of the current query, kept on in-page links of a flagged page */
function flagQuery(params:URLSearchParams){ const ff=params.getAll('ff'); return ff.length?`?${ff.map(v=>`ff=${encodeURIComponent(v)}`).join('&')}`:''; }
/** P2.14: which knowledge pages exist on this request (their flags) */
function knowledgeLinks(params:URLSearchParams){ return {query:flagQuery(params),periodic:isFeatureEnabled('periodicTableV1',params),passport:isFeatureEnabled('substancePassportV1',params),explorer:isFeatureEnabled('reactionExplorerV1',params)}; }
/** P2.14: the knowledge pack and the browser-local canonical domain (registry, matcher) built from its records */
async function loadKnowledge(){ const k=await client.loadChemistryKnowledge(); const localize=createLocalizer({elementNames:k.elementNames,speciesNames:k.speciesNames,interaction:k.interaction}); return {...k,...knowledgeDomain(k),localize}; }
/** a content error's learner message, or the generic error page (no new literal) */
function renderLoadError(error:unknown){ const m=contentErrorMessage(error,''); if(m) renderError(main,m); else renderError(main); }

// static shell links (header navigation) and the brand logo resolve through the host as well
for(const anchor of document.querySelectorAll<HTMLAnchorElement>('a[data-kl-route]')) anchor.setAttribute('href',host.href(anchor.dataset.klRoute??'/'));
for(const image of document.querySelectorAll<HTMLImageElement>('img[data-kl-asset]')) image.setAttribute('src',host.assetUrl(image.dataset.klAsset??''));

// one learner sentence for "the activity could not be loaded" (classic practice page and dynamic lab)
const ACTIVITY_LOAD_ERROR='Faoliyatni yuklab bo‘lmadi.';
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
      const practiceEngine=new ReferencePracticeSession(page);
      const attemptSession=progressService.beginPracticeSession(page,practiceEngine);activePractice=attemptSession;
      let persistError:unknown;
      // P1.4 strangler seam: a rendererRequirement → RendererRegistry; otherwise the legacy practice renderer.
      renderPracticePage(main,page,{apply:async(command)=>{const out=await progressService.applyPracticeCommand(attemptSession,command);persistError=out.persistError;return out.result;},current:()=>practiceEngine.result(),retry:()=>{void renderCurrent();}},rendererRegistry,async()=>{if(persistError)throw persistError;});}
    catch(error){renderError(main,contentErrorMessage(error,ACTIVITY_LOAD_ERROR));}
    return;
  }
  if(route.name==='dynamic-lab'){
    // P2.10: behind guidedDynamicLabV1. No attempt, evidence or progress is written; the classic route is unchanged.
    renderLoading(main);
    try{
      const page=await client.loadPractice(route.practiceActivityId);
      if(!isFeatureEnabled('guidedDynamicLabV1',active.searchParams)){ renderDynamicLabUnavailable(main,page,'flag-off'); return; }
      const profile=await client.loadTopicLabProfile(route.practiceActivityId);
      if(!profile){ renderDynamicLabUnavailable(main,page,'no-profile'); return; }
      renderDynamicLab(main,page,profile);
    }
    catch(error){renderError(main,contentErrorMessage(error,ACTIVITY_LOAD_ERROR));}
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
        const unit:any=units.find((u:any)=>u.id===row.learningUnitId);
        const availability=readiness.units?.find(u=>u.learningUnitId===row.learningUnitId)?.assessment.status??'NONE';
        if(unit) mastery.set(row.learningUnitId,await progressService.getMasteryView(row.learningUnitId,versions,unit.conceptIds??[],availability));
      }
      renderProgress(main,buildProgressViewModel(rows,units,mastery));
    }
    catch(error){renderError(main,contentErrorMessage(error,'Natijalarni yuklab bo‘lmadi. Brauzer saqlash imkoniyatini tekshiring.'));}
    return;
  }
  if(route.name==='search'){renderLoading(main);try{
      const index=await client.loadSearchIndex();
      // P2.13: with periodicTableV1 the elements join the same search index (symbol, atomic number, localized name)
      if(isFeatureEnabled('periodicTableV1',active.searchParams)){ const {hub,elementNames,speciesNames,interaction}=await client.loadElementHub(); const localize=createLocalizer({elementNames,speciesNames,interaction}); index.push(...elementSearchEntries(hub,s=>localize(`element.${s}`),{kicker:localize('ui.periodic-search-kicker')??'',description:z=>(localize('ui.periodic-search-description')??'').replace('{z}',String(z))},flagQuery(active.searchParams))); }
      // P2.14: substances (substancePassportV1) and reactions (reactionExplorerV1) join the same index
      const kl=knowledgeLinks(active.searchParams);
      if(kl.passport||kl.explorer){ const k=await loadKnowledge(); const t=createLabeler(k.localize);
        if(kl.passport) index.push(...substanceSearchEntries(k.index,k.registry,k.localize,{kicker:t.ui('ui.substance-search-kicker'),description:phase=>t.ui(`ui.substance-phase-${phase}`)},kl.query));
        if(kl.explorer) index.push(...reactionSearchEntries(k.index,k.reactions,{kicker:t.ui('ui.reactions-search-kicker'),description:type=>t.ui(`ui.reactions-type-${type}`)},kl.query)); }
      renderSearch(main,index,active.searchParams.get('q')??'');
    }catch(error){renderError(main,contentErrorMessage(error,'Qidiruv ma’lumotlarini yuklab bo‘lmadi.'));}return;}
  if(route.name==='periodic'){
    // P2.13: behind periodicTableV1 — with the flag off the route does not exist (the learner app is unchanged)
    if(!isFeatureEnabled('periodicTableV1',active.searchParams)){renderNotFound(main);return;}
    renderLoading(main);
    try{ const {hub,elementNames,speciesNames,interaction}=await client.loadElementHub();
      // P2.14: a related substance / reaction opens its page when that page's flag is on (one canonical graph)
      const kl=knowledgeLinks(active.searchParams); const k=kl.explorer?await loadKnowledge():null;
      const links={...(kl.passport?{substance:(id:string)=>substanceHref(id,kl.query)}:{}),...(k?{reaction:(id:string)=>reactionExplorerHref(k.index,id,kl.query)}:{})};
      renderPeriodicTable(main,hub,{localize:createLocalizer({elementNames,speciesNames,interaction}),selected:route.symbol,query:flagQuery(active.searchParams),navigate:navigateInternal,links}); }
    catch(error){renderError(main,contentErrorMessage(error,'Davriy jadvalni yuklab bo‘lmadi.'));}
    return;
  }
  if(route.name==='substance'){
    // P2.14: behind substancePassportV1 — with the flag off the route does not exist (the learner app is unchanged)
    if(!isFeatureEnabled('substancePassportV1',active.searchParams)){renderNotFound(main);return;}
    renderLoading(main);
    try{ const k=await loadKnowledge(); renderSubstancePassport(main,{index:k.index,registry:k.registry,reactions:k.reactions,localize:k.localize},route.key,knowledgeLinks(active.searchParams)); }
    catch(error){renderLoadError(error);}
    return;
  }
  if(route.name==='reactions'){
    // P2.14: behind reactionExplorerV1 — the existing ReactionMatcher runs in the page over the pack records
    if(!isFeatureEnabled('reactionExplorerV1',active.searchParams)){renderNotFound(main);return;}
    renderLoading(main);
    try{ const k=await loadKnowledge(); renderReactionExplorer(main,{index:k.index,registry:k.registry,reactions:k.reactions,localize:k.localize,matcher:k.matcher,vocabulary:k.vocabulary},active.searchParams,{...knowledgeLinks(active.searchParams),navigate:navigateInternal}); }
    catch(error){renderLoadError(error);}
    return;
  }
  renderNotFound(main);
}

document.addEventListener('click',(event)=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
  const target=event.target;
  if(!(target instanceof Element)) return;
  const anchor=target.closest('a[data-kl-route]');
  if(!(anchor instanceof HTMLAnchorElement)||anchor.target==='_blank') return;
  const route=anchor.dataset.klRoute;
  if(!route||!route.startsWith('/')) return;
  event.preventDefault();
  navigateInternal(route);
});
// Attempts left open by a previous page lifetime (refresh, tab/window close) are closed as abandoned.
void progressService.recoverOrphanedAttempts().catch(()=>undefined);
host.onLocationChange(()=>void renderCurrent());
void renderCurrent();
