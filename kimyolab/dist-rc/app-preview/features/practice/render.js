                                                         
import {buildPracticeUiModel} from './ui-model.js';
import {isPracticeResultComplete} from '../../runtime/learning-orchestrator/selectors.js';

/** What the page needs from a practice session: send a command, get the engine result (no persistence here). */
                                                                        
import {el,clear,link} from '../../ui/components/dom.js';

function feedbackNode(){return el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});}
function setFeedback(node            ,result    ){
  const last=result?.outcomes?.at?.(-1)??result?.attempts?.at?.(-1)??result?.completion;
  if(last?.status==='invalid'||last?.status==='rejected'||last?.status==='blocked') node.textContent='Tekshiring va yana urinib ko‘ring.';
  else if(result?.finalState?.status==='complete'||result?.finalState?.status==='correct') node.textContent='Faoliyat muvaffaqiyatli yakunlandi.';
  else node.textContent='Natija saqlandi. Davom eting.';
}
function observationLabel(observation    ){
  if(typeof observation?.description==='string'&&observation.description.trim()) return observation.description.trim();
  if(observation.type==='precipitate') return `${observation.color?`${observation.color} rangli `:''}cho‘kma`;
  if(observation.type==='gas') return 'gaz ajralishi';
  if(observation.type==='color-change') return 'rang o‘zgarishi';
  if(observation.type==='temperature-change') return `harorat ${observation.direction==='up'?'oshishi':'o‘zgarishi'}`;
  if(observation.type==='no-visible-change') return 'ko‘zga ko‘rinadigan o‘zgarish yo‘q';
  if(observation.type==='state-change') return 'holat o‘zgarishi';
  return 'kimyoviy kuzatuv';
}
function chemistryObservationText(result    ,fallback       ){
  const observations=[...(result?.evidence??[])].filter((e    )=>e?.type==='observation').map((e    )=>e.observation);
  if(!observations.length) return `Bajarildi: ${fallback}`;
  const labels=observations.map(observationLabel);
  return `${fallback} — ${labels.join('; ')} qayd etildi.`;
}

export function renderPractice(root            ,page                         ,session                    ,onResult                                  ){
  clear(root); const model=buildPracticeUiModel(page);
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(link('← Mavzuga qaytish',model.backHref,'kl-back-link'),el('p',{className:'kl-kicker',text:'Interaktiv faoliyat'}),el('h1',{text:model.title}),el('p',{className:'kl-unit-outcome',text:model.goal})); head.append(hi);
  const shell=el('div',{className:'kl-shell kl-practice-workspace'}); const card=el('section',{className:'kl-card'}); const feedback=feedbackNode();

  const nextStage=el('div',{className:'kl-practice-next'});
  const isResultComplete=(result    )=>isPracticeResultComplete(page.type,result);
  const run=async(command    )=>{try{const result=await session.apply(command);setFeedback(feedback,result);try{await onResult?.(result);}catch{feedback.textContent='Faoliyat bajarildi, lekin natijani saqlab bo‘lmadi.';}if(isResultComplete(result)&&!nextStage.childElementCount){nextStage.append(link('Mustahkamlashga o‘tish',`/learn/${page.learningUnit.id}/quiz`,'kl-button kl-button--primary'));}return result;}catch{feedback.textContent='Amalni bajarib bo‘lmadi. Kiritilgan ma’lumotni tekshiring.';}};

  if(model.kind==='experiment'){
    const layout=el('div',{className:'kl-experiment-layout'});
    const stage=el('div',{className:'kl-experiment-stage','attrs':{'aria-label':'Virtual laboratoriya sahnasi'}}       );
    stage.append(el('div',{className:'kl-experiment-stage__title',text:'Virtual laboratoriya'}));
    const vessel=el('div',{className:'kl-experiment-vessel'}); vessel.append(el('span',{className:'kl-experiment-liquid'}),el('span',{className:'kl-experiment-bubbles',text:'○ ○ ○'}));
    const flame=el('div',{className:'kl-experiment-flame'}); const observation=el('div',{className:'kl-experiment-observation',text:'Birinchi amalni tanlang. Tajriba holati shu yerda ko‘rinadi.','attrs':{'aria-live':'polite'}}       );
    stage.append(vessel,flame,observation);
    const panel=el('aside',{className:'kl-experiment-panel'});
    panel.append(el('h2',{text:'Tajriba bosqichlari'}));
    if(model.equipment) panel.append(el('p',{className:'kl-muted',text:`Jihozlar: ${model.equipment}`}));
    if(model.materials) panel.append(el('p',{className:'kl-muted',text:`Materiallar: ${model.materials}`}));
    if(model.safety) panel.append(el('div',{className:'kl-feedback',text:`Xavfsizlik: ${model.safety}`}));
    let equation                           ;
    if(model.controls.some(x=>x.requiresEquation)){
      const label=el('label',{className:'kl-field'}); label.append(el('span',{text:'Net-ion tenglama'})); equation=el('input',{attrs:{type:'text',placeholder:'Ag+ + Cl- → AgCl(s)','aria-label':'Net-ion tenglama'}}); label.append(equation); panel.append(label);
    }
    const steps=el('div',{className:'kl-experiment-step-list'}); panel.append(steps);
    model.controls.forEach((item,index)=>{
      const row=el('div',{className:`kl-experiment-step${index===0?' is-current':''}`});
      row.append(el('strong',{text:`${index+1}. ${item.label}`}));
      const button=el('button',{className:'kl-button kl-button--secondary',text:'Bajarish',attrs:{type:'button'}});
      button.addEventListener('click',()=>void run({kind:'experiment-action',action:{type:item.action,...(item.requiresEquation?{payload:{netIonicEquation:equation?.value??''}}:{})}}).then(result=>{
        if(!result) return;
        row.classList.remove('is-current'); row.classList.add('is-done');
        const next=row.nextElementSibling                    ; next?.classList.add('is-current');
        const semantic=`${item.action} ${item.label}`.toLocaleLowerCase('uz');
        stage.classList.toggle('is-heating',/heat|qizdir|alanga|ignite|burn|yoq/.test(semantic));
        stage.classList.toggle('is-active',/gas|gaz|mix|aralashtir|add|qo‘sh|drop|tomiz/.test(semantic));
        if(/filter|filtr/.test(semantic)) stage.classList.add('is-filtering');
        observation.textContent=chemistryObservationText(result,item.label);
        button.setAttribute('disabled',''); button.textContent='Bajarildi';
      }));
      row.append(button); steps.append(row);
    });
    layout.append(stage,panel); card.append(layout);
  } else if(model.kind==='simulation'){
      card.append(el('h2',{text:'Interaktiv model'}));
      for(const control of model.controls){
        const form=el('form',{className:'kl-form kl-simulation-control'});
        const label=el('label',{className:'kl-field'}); label.append(el('span',{text:control.label}));
        const input=el('input',{attrs:{name:control.field,type:control.valueType==='number'?'number':'text',required:'','autocomplete':'off','aria-label':control.label}}); label.append(input);
        const button=el('button',{className:'kl-button kl-button--secondary',text:'Qo‘llash',attrs:{type:'submit'}}); form.append(label,button);
        form.addEventListener('submit',e=>{e.preventDefault();const raw=input.value;const value=control.valueType==='number'?Number(raw):control.valueType==='boolean'?raw==='true':raw;void run({kind:'simulation-action',action:{field:control.field,value}});});
        card.append(form);
      }
  } else if(model.kind==='trainer'){
    card.append(el('h2',{text:model.expectedInput==='formula'?'Formula trenajyori':'Mashq'}),el('p',{text:model.prompt})); const form=el('form',{className:'kl-form'}); const label=el('label',{className:'kl-field'});label.append(el('span',{text:model.expectedInput==='formula'?'Formula':'Javob'}));const input=el('input',{attrs:{name:'answer',required:'','autocomplete':'off'}});label.append(input);const b=el('button',{className:'kl-button kl-button--primary',text:'Tekshirish',attrs:{type:'submit'}});form.append(label,b);form.addEventListener('submit',e=>{e.preventDefault();void run({kind:'trainer-answer',answer:input.value});});card.append(form);
  } else if(model.kind==='calculation'){
    card.append(el('h2',{text:`Hisoblash: ${model.formula}`})); for(const step of model.steps){const form=el('form',{className:'kl-form kl-calculation-row'});const label=el('label',{className:'kl-field'});label.append(el('span',{text:step.label}));const input=el('input',{attrs:{type:'number',step:'any',required:'','aria-label':step.label}});label.append(input);const b=el('button',{className:'kl-button kl-button--secondary',text:'Tekshirish',attrs:{type:'submit'}});form.append(label,b);form.addEventListener('submit',e=>{e.preventDefault();void run({kind:'calculation-response',response:{stepId:step.id,value:Number(input.value),unit:step.unit}});});card.append(form);}
  } else {
    card.append(el('h2',{text:'Dalillar asosida qaror qiling'})); const form=el('form',{className:'kl-form'}); const fieldset=document.createElement('fieldset');fieldset.append(el('legend',{text:`Kamida ${model.minimum} ta dalil tanlang`}));
    for(const item of model.evidenceOptions){const label=el('label',{className:'kl-check'});const input=el('input',{attrs:{type:'checkbox',name:'evidence',value:item.id}});label.append(input,document.createTextNode(` ${item.label}`));fieldset.append(label);} const decision=el('input',{attrs:{name:'decision',required:'',placeholder:'Qaroringiz'}});const justification=el('textarea',{attrs:{name:'justification',required:'',placeholder:'Ilmiy asos'}});const reflection=el('textarea',{attrs:{name:'reflection',placeholder:'Xulosa'}});form.append(fieldset,decision,justification,reflection,el('button',{className:'kl-button kl-button--primary',text:'Qarorni tekshirish',attrs:{type:'submit'}}));form.addEventListener('submit',e=>{e.preventDefault();const ids=[...form.querySelectorAll                  ('input[name="evidence"]:checked')].map(x=>x.value);void run({kind:'case-submit',value:{evidenceIds:ids,decision:decision.value,justification:justification.value,reflection:reflection.value}});});card.append(form);
  }
  card.append(feedback,nextStage); shell.append(card); root.append(head,shell);
}
