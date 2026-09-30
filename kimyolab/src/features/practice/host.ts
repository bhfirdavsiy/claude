// Practice page host (P1.4 strangler seam).
//
//   executionPlan.rendererRequirement present → RendererRegistry (capability + version) → registered renderer
//   no requirement                          → legacy renderPractice (unchanged)
//
// Renderer selection never looks at the activity id. An unavailable renderer fails closed with a learner
// sentence (no raw code, no fallback to the generic form). Completion ("next stage") is decided by the
// engine's own result, never by a button press.
//
// Error boundary (P1.4 closeout): the host drives every draw (instance.update after each engine result). If the
// renderer throws — at mount or on any later update — the host fails closed: the stage is replaced by a
// localized alert, further intents are refused, and there is NO fallback to the legacy renderer. The attempt and
// the evidence already recorded by the orchestrator are left exactly as they were (the host never writes them).
import type {StudentPracticePageModel} from './model.ts';
import {renderPractice,type PracticeCommandPort} from './render.ts';
import {isPracticeResultComplete} from '../../runtime/learning-orchestrator/selectors.ts';
import {readinessMessage} from '../../domain/readiness/readiness.ts';
import {el,clear,link} from '../../ui/components/dom.ts';
import type {RendererRegistry} from '../../renderers/registry.ts';
import type {RendererInstance} from '../../renderers/contract.ts';
import {createLocalizer} from '../localization/element-names.ts';

/** Learner text when a mounted renderer fails (no raw error, no fallback). */
export const RENDERER_FAILED_MESSAGE='Bu faoliyatni ko‘rsatishda xatolik yuz berdi. Sahifani yangilab, qaytadan urinib ko‘ring.';

export interface PracticePagePort extends PracticeCommandPort {
  /** engine result for the current inputs, without a new input and without persistence */
  current():Promise<any>;
  /** P1.5: start a NEW attempt of this activity (the finished attempt and its evidence stay as they are) */
  retry?():void;
}

export type PracticeRenderPath='registry'|'legacy'|'blocked';

export function renderPracticePage(root:HTMLElement,page:StudentPracticePageModel,port:PracticePagePort,registry:RendererRegistry,onResult?:(result:any)=>void|Promise<void>):PracticeRenderPath{
  const requirement=page.executionPlan.rendererRequirement;
  if(!requirement){ renderPractice(root,page,port,onResult); return 'legacy'; }
  let implementation;
  try{ implementation=registry.resolve(requirement); }
  catch{
    clear(root);
    root.append(el('div',{className:'kl-shell kl-practice-workspace'}));
    root.firstElementChild!.append(el('p',{className:'kl-notice',text:readinessMessage(['RENDERER_UNAVAILABLE']),attrs:{role:'alert'}}),link('← Mavzuga qaytish',`/learn/${page.learningUnit.id}/practice`,'kl-back-link'));
    return 'blocked';
  }
  clear(root);
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(link('← Mavzuga qaytish',`/learn/${page.learningUnit.id}/practice`,'kl-back-link'),el('p',{className:'kl-kicker',text:'Interaktiv faoliyat'}),el('h1',{text:page.title}),el('p',{className:'kl-unit-outcome',text:page.goal}));
  head.append(hi);
  const shell=el('div',{className:'kl-shell kl-practice-workspace'});
  const stage=el('div',{className:'kl-renderer-stage'});
  const feedback=el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});
  const next=el('div',{className:'kl-practice-next'});
  shell.append(stage,feedback,next); root.append(head,shell);
  let instance:RendererInstance|undefined;
  let failed=false;
  const failClosed=()=>{
    if(failed) return;
    failed=true;
    try{ instance?.destroy(); }catch{ /* the renderer is already broken; the stage is cleared below */ }
    clear(stage); clear(next);
    feedback.textContent='';
    stage.dataset.rendererState='failed';
    stage.append(el('p',{className:'kl-notice',text:RENDERER_FAILED_MESSAGE,attrs:{role:'alert'}}));
  };
  const draw=(result:unknown)=>{
    if(failed||!instance) return;
    try{ instance.update(result); }catch{ failClosed(); }
  };
  try{
    instance=implementation.mount(stage,{
      dispatch:async(intent)=>{
        if(failed) throw new Error('RENDERER_FAILED');
        if(!implementation.capability.intents.includes(intent.kind)) throw new Error('RENDERER_INTENT_UNDECLARED');
        const result=await port.apply(intent);
        if(result===undefined) throw new Error('PRACTICE_COMMAND_FAILED');
        try{ await onResult?.(result); }catch{ feedback.textContent='Faoliyat bajarildi, lekin natijani saqlab bo‘lmadi.'; }
        draw(result);
        if(failed) return result;
        if(isPracticeResultComplete(page.type,result)&&!next.childElementCount){
          feedback.textContent='Faoliyat muvaffaqiyatli yakunlandi.';
          next.append(link('Mustahkamlashga o‘tish',`/learn/${page.learningUnit.id}/quiz`,'kl-button kl-button--primary'));
          if(port.retry){
            const again=el('button',{className:'kl-button kl-button--secondary',text:'Qaytadan urinish (yangi urinish)',attrs:{type:'button','data-action':'retry'}});
            again.addEventListener('click',()=>port.retry!());
            next.append(again);
          }
        }
        return result;
      },
      current:()=>port.current(),
    },{title:page.title,goal:page.goal,practiceType:page.type,localize:createLocalizer(page.localization)});
  }catch{ failClosed(); return 'registry'; }
  void port.current().then(draw,()=>failClosed());
  return 'registry';
}
