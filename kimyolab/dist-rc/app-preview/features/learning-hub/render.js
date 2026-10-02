                                                                         
import { el, clear, link } from '../../ui/components/dom.js';
                                                          
                                                                   
import {renderMasteryPanel} from '../progress/mastery-render.js';
import {renderStructuredTheory} from '../theory/structured-render.js';

// P2.9: quiz/reflection validation is the page's own, localized and announced (role=alert, bound to the questions,
// focus moves to the first unanswered one) — novalidate keeps the browser's English, unannounced bubble out of it.
// Without the learner-interaction catalog (a legacy pack) only the neutral mark and the list are shown, never a raw key.
const REFLECTION_MIN=8;
function validationText(model                 ,key                                        ,vars                             )       {
  const localized=model.validationText?.[key]??'⚠ {list}';
  return localized.replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??''));
}

                                                         

function practiceCard(practice                     ,learningUnitId       ,primary=false){
  const article=el('article',{className:`kl-practice-card${primary?' kl-practice-card--primary':''}`});
  article.append(el('span',{className:'kl-practice-card__type',text:practice.type}),el('h3',{text:practice.title}),el('p',{text:practice.goal}));
  // P1.2 (C4): an activity the readiness gate refuses is shown with a learner-facing reason, never a launch link.
  if(practice.launchable) article.append(link('Faoliyatni boshlash',`/practice/${encodeURIComponent(practice.id)}?lu=${encodeURIComponent(learningUnitId)}`,'kl-text-link'));
  else{article.classList.add('is-unavailable');article.setAttribute('aria-disabled','true');article.append(el('p',{className:'kl-muted kl-practice-card__unavailable',text:practice.unavailableMessage??'Bu faoliyat hozircha mavjud emas.'}));}
  return article;
}

function stageStateClass(stage                   ,status              ,current                   ){
  const done=stage==='guide'?status.guideComplete:stage==='practice'?status.practiceComplete:(status.reinforcementComplete||status.assessmentComplete);
  return `kl-cycle-step${stage===current?' is-current':''}${done?' is-done':''}`;
}

function cycleHeader(model                 ,status              ,current                   ){
  const header=el('header',{className:'kl-unit-hero'});
  const inner=el('div',{className:'kl-shell'});
  inner.append(link('← Barcha mavzular','/curriculum','kl-back-link'),el('p',{className:'kl-kicker',text:`${model.grade}-sinf`}),el('h1',{text:model.title}));
  if(model.learningOutcomes[0]) inner.append(el('p',{className:'kl-unit-outcome',text:model.learningOutcomes[0]}));
  const nav=el('nav',{className:'kl-cycle-nav',attrs:{'aria-label':'Mavzuni o‘rganish bosqichlari'}});
  const stages                                                                 =[
    {id:'guide',n:1,label:'Nazariya',href:`/learn/${model.id}/guide`},
    {id:'practice',n:2,label:'Amaliyot',href:`/learn/${model.id}/practice`},
    {id:'quiz',n:3,label:'Mustahkamlash',href:`/learn/${model.id}/quiz`},
  ];
  for(const stage of stages){
    const a=link('',stage.href,stageStateClass(stage.id,status,current));
    a.append(el('span',{className:'kl-cycle-step__number',text:String(stage.n)}),el('span',{className:'kl-cycle-step__label',text:stage.label}));
    if(a.classList.contains('is-done')) a.append(el('span',{className:'kl-cycle-step__status',text:'Bajarildi'}));
    // P2.7: the current stage is announced, not only drawn (class is-current is visual only)
    if(stage.id===current) a.setAttribute('aria-current','step');
    nav.append(a);
  }
  inner.append(nav); header.append(inner); return header;
}

function conceptsCard(model                 ){
  const concepts=el('section',{className:'kl-card'}); concepts.append(el('h2',{text:'Asosiy tushunchalar'}));
  const list=el('ul',{className:'kl-chip-list'}); for(const concept of model.concepts) list.append(el('li',{text:concept.name})); concepts.append(list); return concepts;
}

export function renderLearningGuide(root            ,model                 ,status              ,onComplete                   ){
  clear(root); root.append(cycleHeader(model,status,'guide'));
  const layout=el('div',{className:'kl-shell kl-learning-grid'}); const main=el('div',{className:'kl-learning-main'});
  const theory=el('section',{className:'kl-card',attrs:{'aria-labelledby':'theory-title'}});
  theory.append(el('p',{className:'kl-kicker',text:'1-bosqich · Nazariya'}),el('h2',{text:'Mavzuni tushunib oling',attrs:{id:'theory-title'}}));
  // P2.3: a complete, sourced structured theory renders with the structured renderer; otherwise the MINIMAL legacy blocks
  if(model.theory.structured) theory.append(renderStructuredTheory(model.theory.structured));
  else{ const legacy=el('div',{className:'kl-theory kl-theory--minimal',attrs:{'data-theory-depth':'MINIMAL'}}); for(const block of model.theory.blocks) legacy.append(el('p',{text:block.text})); theory.append(legacy); }
  const actions=el('div',{className:'kl-cycle-actions'}); actions.append(link('Ish varaqasi',`/worksheet/${encodeURIComponent(model.id)}`,'kl-button kl-button--secondary'));
  if(onComplete){const b=el('button',{className:'kl-button kl-button--primary',text:status.guideComplete?'Amaliyotga o‘tish':'Nazariyani yakunlash va amaliyotga o‘tish',attrs:{type:'button'}}); b.addEventListener('click',()=>void onComplete()); actions.append(b);} else actions.append(link('Amaliyotga o‘tish',`/learn/${model.id}/practice`,'kl-button kl-button--primary'));
  theory.append(actions); main.append(theory);
  const side=el('aside',{className:'kl-learning-side',attrs:{'aria-label':'Mavzu yo‘riqnomasi'}}); side.append(conceptsCard(model));
  const hint=el('section',{className:'kl-card'}); hint.append(el('h2',{text:'Keyingi qadam'}),el('p',{text:'Nazariyani o‘qib chiqqach, shu mavzuga bog‘langan amaliy faoliyatni bajaring.'})); side.append(hint);
  layout.append(main,side); root.append(layout);
}

export function renderLearningPracticeStage(root            ,model                 ,status              ){
  clear(root); root.append(cycleHeader(model,status,'practice'));
  const layout=el('div',{className:'kl-shell kl-learning-grid'}); const main=el('div',{className:'kl-learning-main'});
  const practice=el('section',{className:'kl-section',attrs:{'aria-labelledby':'practice-title'}});
  practice.append(el('p',{className:'kl-kicker',text:'2-bosqich · Amaliyot'}),el('h2',{text:'Nazariyani tajribada sinab ko‘ring',attrs:{id:'practice-title'}}));
  practice.append(el('p',{className:'kl-section-copy',text:'Mavzu bo‘yicha asosiy faoliyatni bajaring, natijani kuzating va xulosani nazariya bilan bog‘lang.'}));
  practice.append(practiceCard(model.primaryPractice,model.id,true));
  if(model.supportingPractices.length){const support=el('div',{className:'kl-support-grid'}); for(const item of model.supportingPractices) support.append(practiceCard(item,model.id)); practice.append(el('h3',{text:'Qo‘shimcha mashqlar'}),support);}
  if(model.externalLabs.length){
    const external=el('section',{className:'kl-section',attrs:{'aria-labelledby':'external-labs-title'}}); external.append(el('p',{className:'kl-kicker',text:'Qo‘shimcha virtual tajribalar'}),el('h2',{text:'Hamkor laboratoriyalar',attrs:{id:'external-labs-title'}}));
    const grid=el('div',{className:'kl-support-grid'}); for(const item of model.externalLabs){const card=el('article',{className:'kl-practice-card kl-practice-card--external'});card.append(el('h3',{text:item.title}),el('p',{text:item.description}),link(item.status==='requires_partner_access'?'Ulanish holatini ko‘rish':'Virtual laboratoriyani ochish',`/external-lab/${encodeURIComponent(item.id)}?lu=${encodeURIComponent(model.id)}`,'kl-text-link'));grid.append(card);} external.append(grid); practice.append(external);
  }
  const next=el('div',{className:'kl-cycle-actions'}); next.append(link('← Nazariyaga qaytish',`/learn/${model.id}/guide`,'kl-button kl-button--secondary'),link(status.practiceComplete?'Mustahkamlashga o‘tish':'Mustahkamlashni ko‘rish',`/learn/${model.id}/quiz`,'kl-button kl-button--primary')); practice.append(next); main.append(practice);
  const side=el('aside',{className:'kl-learning-side',attrs:{'aria-label':'Amaliyot bo‘yicha yo‘riqnoma'}}); side.append(conceptsCard(model)); const s=el('section',{className:'kl-card'});s.append(el('h2',{text:'Amaliyot holati'}),el('p',{text:status.practiceComplete?'Asosiy amaliy faoliyat bajarilgan. Endi mustahkamlashga o‘ting.':'Asosiy amaliy faoliyatni yakunlaganingizdan keyin natijani mustahkamlash bosqichida tahlil qilasiz.'}));side.append(s);
  layout.append(main,side); root.append(layout);
}

/** What the UI learns back from the canonical evaluator: per-item correctness, never the key itself. */
                                                                                                                                

/**
 * Stage 3. With runtime-ready objective items the learner answers an assessment: the UI only collects
 * responses and hands them to `onAssessment` (→ LearningOrchestrator.submitAssessment → evaluator).
 * Without items it is a reflection (`onSubmit` → REINFORCEMENT_COMPLETED), which is never an assessment.
 */
export function renderLearningQuiz(root            ,model                 ,status              ,onSubmit                                                 ,onAssessment                                                                                         ,mastery                                         ){
  clear(root); root.append(cycleHeader(model,status,'quiz'));
  // Pilot units (P1.2 C1): mastery is shown separately from the lesson stage and refreshed after each submission.
  const masterySlot=el('div',{className:'kl-mastery-slot'});
  const refreshMastery=()=>{if(!mastery)return;void mastery.refresh().then(view=>{clear(masterySlot);masterySlot.append(renderMasteryPanel(view));}).catch(()=>undefined);};
  refreshMastery();
  const layout=el('div',{className:'kl-shell kl-learning-grid'}); const main=el('div',{className:'kl-learning-main'});
  const card=el('section',{className:'kl-card'}); card.append(el('p',{className:'kl-kicker',text:'3-bosqich · Mustahkamlash'}),el('h2',{text:'Nazariya va tajribani bir-biriga bog‘lang'}),el('p',{className:'kl-section-copy',text:'Bu bosqich mavzuni qayta aytish emas: nazariy tushuncha, amaliy kuzatuv va ilmiy xulosani bir zanjirga keltiring.'}));
  const form=el('form',{className:'kl-reinforcement-form',attrs:{novalidate:''}});
  const formAlert=el('p',{className:'kl-field-error',attrs:{role:'alert',id:`kl-quiz-${model.id}-error`}});
  const feedback=el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});
  if(model.assessment.items.length){
    card.append(el('p',{className:'kl-muted',text:'Savollar nazariya va amaliyotdagi asosiy tushunchalarni tekshiradi.'}));
    for(const [index,item] of model.assessment.items.entries()){
      const fieldset=el('fieldset',{className:'kl-quiz-question',attrs:{'data-item-id':item.id,'aria-describedby':formAlert.id}}); fieldset.append(el('legend',{text:`${index+1}. ${item.stem}`}));
      for(const option of item.options){const label=el('label',{className:'kl-check'});const input=el('input',{attrs:{type:'radio',name:item.id,value:option.id,required:''}});label.append(input,document.createTextNode(` ${option.text}`));fieldset.append(label);} form.append(fieldset);
    }
    const actions=el('div',{className:'kl-cycle-actions'});actions.append(link('← Amaliyotga qaytish',`/learn/${model.id}/practice`,'kl-button kl-button--secondary'));const submit=el('button',{className:'kl-button kl-button--primary',text:'Javoblarni tekshirish',attrs:{type:'submit'}});actions.append(submit);form.append(formAlert,actions,feedback);
    form.addEventListener('submit',e=>{
      e.preventDefault(); if(!onAssessment) return;
      const data=new FormData(form                   );
      const missing=model.assessment.items.map((item,i)=>({item,n:i+1})).filter(x=>!data.get(x.item.id));
      for(const x of model.assessment.items){const fs=form.querySelector(`[data-item-id="${CSS.escape(x.id)}"]`);if(missing.some(m=>m.item.id===x.id))fs?.setAttribute('aria-invalid','true');else fs?.removeAttribute('aria-invalid');}
      if(missing.length){
        formAlert.textContent=validationText(model,'quizUnanswered',{list:missing.map(m=>m.n).join(', ')});
        (form.querySelector(`[data-item-id="${CSS.escape(missing[0] .item.id)}"] input`)                         )?.focus();
        return;
      }
      formAlert.textContent='';
      const responses=model.assessment.items.map(item=>({itemId:item.id,selectedOptionId:String(data.get(item.id)??'')}));
      submit.setAttribute('disabled','');
      void onAssessment(responses).then(result=>{
        refreshMastery();
        for(const item of result.items){const fs=form.querySelector(`[data-item-id="${CSS.escape(item.itemId)}"]`);fs?.setAttribute('data-result',item.correct?'correct':'incorrect');}
        feedback.textContent=`Natija: ${result.correctItems}/${result.objectiveItems}. Javoblaringiz saqlandi.`;
        submit.removeAttribute('disabled');
      }).catch(()=>{feedback.textContent='Natijani saqlab bo‘lmadi. Qayta urinib ko‘ring.';submit.removeAttribute('disabled');});
    });
  }else{
    // Objective assessment not available: reflection is the pedagogical fallback. Say why, in plain words.
    if(model.assessmentAvailability.status==='PENDING'&&model.assessmentAvailability.message) card.append(el('p',{className:'kl-notice',text:model.assessmentAvailability.message,attrs:{role:'note','data-quiz-state':'pending'}}));
    const prompts=[
      {name:'conceptReflection',title:'1. Asosiy tushunchalarni izohlang',help:`${model.concepts.map(x=>x.name).join(', ')} tushunchalaridan kamida bittasini o‘z so‘zingiz bilan tushuntiring.`},
      {name:'practiceReflection',title:'2. Amaliyot natijasini yozing',help:`“${model.primaryPractice.title}” faoliyatida nimani kuzatdingiz yoki qanday natija oldingiz?`},
      {name:'connectionReflection',title:'3. Bog‘lanishni tushuntiring',help:'Kuzatilgan natija nazariyadagi qaysi tushuncha yoki qonuniyatni tasdiqlashini yozing.'},
    ];
    for(const p of prompts){const label=el('label',{className:'kl-field'});label.append(el('strong',{text:p.title}),el('span',{className:'kl-muted',text:p.help}));const ta=el('textarea',{attrs:{name:p.name,required:'',rows:'4',minlength:String(REFLECTION_MIN),'aria-describedby':formAlert.id}});label.append(ta);form.append(label);}
    const confidence=el('fieldset',{className:'kl-confidence'});confidence.append(el('legend',{text:'Mavzuni qanchalik tushundingiz?'}));
    for(const [value,labelText] of [['understood','Tushundim'],['partial','Qisman tushundim'],['review','Yana takrorlashim kerak']]){const label=el('label',{className:'kl-check'});const input=el('input',{attrs:{type:'radio',name:'confidence',value,required:''}});label.append(input,document.createTextNode(` ${labelText}`));confidence.append(label);} form.append(confidence);
    const actions=el('div',{className:'kl-cycle-actions'}); actions.append(link('← Amaliyotga qaytish',`/learn/${model.id}/practice`,'kl-button kl-button--secondary')); const submit=el('button',{className:'kl-button kl-button--primary',text:status.reinforcementComplete?'Mustahkamlashni yangilash':'Mustahkamlashni yakunlash',attrs:{type:'submit'}});actions.append(submit);form.append(formAlert,actions,feedback);
    form.addEventListener('submit',e=>{e.preventDefault();if(!onSubmit)return;const data=new FormData(form                   );const payload={mode:'reflection',conceptReflection:String(data.get('conceptReflection')??'').trim(),practiceReflection:String(data.get('practiceReflection')??'').trim(),connectionReflection:String(data.get('connectionReflection')??'').trim(),confidence:String(data.get('confidence')??'')};const parts=[...prompts.map(p=>({title:p.title,control:form.querySelector(`[name="${p.name}"]`)                    ,ok:String(data.get(p.name)??'').trim().length>=REFLECTION_MIN})),{title:confidence.querySelector('legend')?.textContent??'',control:confidence               ,ok:Boolean(payload.confidence),focus:form.querySelector('[name="confidence"]')                    }];for(const x of parts){if(x.ok)x.control?.removeAttribute('aria-invalid');else x.control?.setAttribute('aria-invalid','true');}const bad=parts.filter(x=>!x.ok);if(bad.length){formAlert.textContent=validationText(model,'reflectionIncomplete',{list:bad.map(x=>x.title).join('; '),min:REFLECTION_MIN});(('focus' in bad[0] &&bad[0] .focus)||bad[0] .control)?.focus();return;}formAlert.textContent='';submit.setAttribute('disabled','');void onSubmit(payload).then(()=>{refreshMastery();feedback.textContent='Mustahkamlash saqlandi. Endi natijalarni ko‘rishingiz yoki mavzuni qayta ko‘rib chiqishingiz mumkin.';submit.removeAttribute('disabled');}).catch(()=>{feedback.textContent='Natijani saqlab bo‘lmadi. Qayta urinib ko‘ring.';submit.removeAttribute('disabled');});});
  }
  card.append(form); main.append(card);
  const side=el('aside',{className:'kl-learning-side',attrs:{'aria-label':'Mustahkamlash yo‘riqnomasi'}});side.append(conceptsCard(model));const w=el('section',{className:'kl-card'});w.append(el('h2',{text:'Qo‘shimcha mustahkamlash'}),el('p',{text:'Mavzuni yozma topshiriqlar bilan davom ettirish uchun ish varaqasidan foydalaning.'}),link('Ish varaqasini ochish',`/worksheet/${model.id}`,'kl-text-link'));side.append(w);const r=el('section',{className:'kl-card'});r.append(el('h2',{text:'Natija'}),link('Natijalarimni ko‘rish','/progress','kl-text-link'));side.append(r);
  if(mastery){const m=el('section',{className:'kl-card'});m.append(el('h2',{text:'O‘zlashtirish holati'}),masterySlot);side.prepend(m);}
  layout.append(main,side);root.append(layout);
}

export function renderLearningHub(root            ,model                 ){renderLearningGuide(root,model,{guideComplete:false,practiceComplete:false,reinforcementComplete:false,assessmentComplete:false,status:'not_started'});}
export function renderLoading(root            ){clear(root);const box=el('div',{className:'kl-shell kl-state'});box.append(el('p',{text:'Mavzu yuklanmoqda…',attrs:{role:'status','aria-live':'polite'}}));root.append(box);}
export function renderError(root            ,message='Mavzuni yuklab bo‘lmadi.'){clear(root);const box=el('div',{className:'kl-shell kl-state'});box.append(el('h1',{text:'Xatolik yuz berdi'}),el('p',{text:message}),link('Bosh sahifaga qaytish','/','kl-button kl-button--secondary'));root.append(box);}
export function renderNotFound(root            ){clear(root);const box=el('div',{className:'kl-shell kl-state'});box.append(el('h1',{text:'Sahifa topilmadi'}),el('p',{text:'Manzilni tekshiring yoki bosh sahifaga qayting.'}),link('Bosh sahifa','/','kl-button kl-button--primary'));root.append(box);}
