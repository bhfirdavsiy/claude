// Practice page host (P1.4 strangler seam).
//
//   executionPlan.rendererRequirement present → RendererRegistry (capability + version) → registered renderer
//   no requirement                          → legacy renderPractice (unchanged)
//
// Renderer selection never looks at the activity id. An unavailable renderer fails closed with a learner
// sentence (no raw code, no fallback to the generic form). Completion ("next stage") is decided by the
// engine's own result, never by a button press.
                                                         
import {renderPractice,                        } from './render.js';
import {isPracticeResultComplete} from '../../runtime/learning-orchestrator/selectors.js';
import {readinessMessage} from '../../domain/readiness/readiness.js';
import {el,clear,link} from '../../ui/components/dom.js';
                                                                  

                                                               
                                                                                          
                         
 

                                                             

export function renderPracticePage(root            ,page                         ,port                 ,registry                 ,onResult                                  )                   {
  const requirement=page.executionPlan.rendererRequirement;
  if(!requirement){ renderPractice(root,page,port,onResult); return 'legacy'; }
  let implementation;
  try{ implementation=registry.resolve(requirement); }
  catch{
    clear(root);
    root.append(el('div',{className:'kl-shell kl-practice-workspace'}));
    root.firstElementChild .append(el('p',{className:'kl-notice',text:readinessMessage(['RENDERER_UNAVAILABLE']),attrs:{role:'alert'}}),link('← Mavzuga qaytish',`/learn/${page.learningUnit.id}/practice`,'kl-back-link'));
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
  implementation.mount(stage,{
    dispatch:async(intent)=>{
      if(!implementation.capability.intents.includes(intent.kind)) throw new Error('RENDERER_INTENT_UNDECLARED');
      const result=await port.apply(intent);
      if(result===undefined) throw new Error('PRACTICE_COMMAND_FAILED');
      try{ await onResult?.(result); }catch{ feedback.textContent='Faoliyat bajarildi, lekin natijani saqlab bo‘lmadi.'; }
      if(isPracticeResultComplete(page.type,result)&&!next.childElementCount){
        feedback.textContent='Faoliyat muvaffaqiyatli yakunlandi.';
        next.append(link('Mustahkamlashga o‘tish',`/learn/${page.learningUnit.id}/quiz`,'kl-button kl-button--primary'));
      }
      return result;
    },
    current:()=>port.current(),
  },{title:page.title,goal:page.goal});
  return 'registry';
}
