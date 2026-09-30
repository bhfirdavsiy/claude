                                                         
import {buildPracticeUiModel} from './ui-model.js';
import {isPracticeResultComplete} from '../../runtime/learning-orchestrator/selectors.js';
import {classifyLearnerOutcome,LEARNER_INCORRECT,LEARNER_INPUT_INVALID,MODEL_NOT_SUPPORTED} from '../../runtime/shared/learner-input.js';
import {createLocalizer} from '../localization/element-names.js';
import {answerValue,createLabeler,                                   } from './form-question.js';

/** What the page needs from a practice session: send a command, get the engine result (no persistence here). */
                                                                        
import {el,clear,link} from '../../ui/components/dom.js';

// P2.1: all shared interaction text comes from the learner-interaction catalog (`ui.*`), the verdict is TEXT (never
// colour only) derived from the engine's result AFTER a submission, and invalid input is announced with role=alert.
function feedbackNode(){return el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});}
function alertNode(){return el('p',{className:'kl-field-error',attrs:{role:'alert'}});}
function setFeedback(t        ,node            ,alert            ,result    ){
  alert.textContent='';
  const last=result?.outcomes?.at?.(-1)??result?.attempts?.at?.(-1)??result?.completion;
  const category=classifyLearnerOutcome(result??{});
  if(category===LEARNER_INPUT_INVALID){ node.textContent=t.ui('ui.retry'); alert.textContent=t.ui('ui.input-invalid'); }
  else if(category===MODEL_NOT_SUPPORTED){ node.textContent=t.ui('ui.retry'); alert.textContent=t.ui('ui.not-modeled'); }
  else if(last?.status==='invalid'||last?.status==='rejected'||last?.status==='blocked') node.textContent=`${t.ui('ui.incorrect')} ${t.ui('ui.retry')}`;
  else if(result?.finalState?.status==='complete'||result?.finalState?.status==='correct') node.textContent=`${t.ui('ui.correct')} ${t.ui('ui.complete')}`;
  else if(category===LEARNER_INCORRECT) node.textContent=`${t.ui('ui.incorrect')} ${t.ui('ui.retry')}`;
  else if(category==='LEARNER_CORRECT') node.textContent=`${t.ui('ui.correct')} ${t.ui('ui.continue')}`;
  else node.textContent=t.ui('ui.continue');
}
function observationLabel(t        ,observation    ){
  if(typeof observation?.description==='string'&&observation.description.trim()) return observation.description.trim();
  if(observation.type==='precipitate') return observation.color?t.ui('ui.obs-precipitate-color',{color:observation.color}):t.ui('ui.obs-precipitate');
  if(observation.type==='gas') return t.ui('ui.obs-gas');
  if(observation.type==='color-change') return t.ui('ui.obs-color');
  if(observation.type==='temperature-change') return t.ui(observation.direction==='up'?'ui.obs-heat-up':'ui.obs-heat');
  if(observation.type==='no-visible-change') return t.ui('ui.obs-none');
  if(observation.type==='state-change') return t.ui('ui.obs-state');
  return t.ui('ui.obs-generic');
}
function chemistryObservationText(t        ,result    ,fallback       ){
  const observations=[...(result?.evidence??[])].filter((e    )=>e?.type==='observation').map((e    )=>e.observation);
  if(!observations.length) return t.ui('ui.obs-done',{step:fallback});
  return t.ui('ui.obs-recorded',{step:fallback,list:observations.map(o=>observationLabel(t,o)).join('; ')});
}

let questionSeq=0;
/** One form for one question: a choice is a fieldset/legend with native radios (keyboard: Tab + arrows + Space/Enter),
 *  a typed answer is a labelled input. The DOM carries the option INDEX, never the canonical token or its correctness. */
function questionForm(t        ,q                  ,submitText       ,primary        ,onValue                                    ){
  const form=el('form',{className:'kl-form kl-question'}); const alert=alertNode(); const uid=`klq${++questionSeq}`;
  alert.id=`${uid}-error`;
  let read           ; let focusFirst         ;
  if(q.input.kind==='choice'){
    const fieldset=document.createElement('fieldset'); fieldset.className='kl-choice-group'; fieldset.setAttribute('aria-describedby',alert.id);
    fieldset.append(el('legend',{text:q.label}));
    const radios=q.input.choices.map((choice,i)=>{
      const label=el('label',{className:'kl-check kl-choice'});
      const radio=el('input',{attrs:{type:'radio',name:`${uid}-${q.id}`,value:String(i)}})                    ;
      label.append(radio,document.createTextNode(` ${choice.label}`)); fieldset.append(label); return radio;
    });
    form.append(fieldset);
    read=()=>radios.find(r=>r.checked)?.value??''; focusFirst=()=>radios[0]?.focus();
  }else{
    const label=el('label',{className:'kl-field'}); label.append(el('span',{text:q.label}));
    const input=el('input',{attrs:{name:q.id,type:q.input.kind==='number'?'number':'text',...(q.input.kind==='number'?{step:'any'}:{}),required:'','autocomplete':'off','aria-describedby':alert.id}})                    ;
    label.append(input); form.append(label);
    read=()=>input.value; focusFirst=()=>input.focus();
  }
  form.append(el('button',{className:`kl-button ${primary?'kl-button--primary':'kl-button--secondary'}`,text:submitText,attrs:{type:'submit'}}),alert);
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const value=answerValue(q,read());
    if(value===null){ alert.textContent=t.ui(q.input.kind==='choice'?'ui.choose':'ui.empty'); focusFirst(); return; }
    alert.textContent=''; onValue(value);
  });
  return {form,alert};
}

export function renderPractice(root            ,page                         ,session                    ,onResult                                  ){
  clear(root); const model=buildPracticeUiModel(page); const t=createLabeler(createLocalizer(page.localization));
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(link(t.ui('ui.back'),model.backHref,'kl-back-link'),el('p',{className:'kl-kicker',text:t.ui('ui.kicker')}),el('h1',{text:model.title}),el('p',{className:'kl-unit-outcome',text:model.goal})); head.append(hi);
  const shell=el('div',{className:'kl-shell kl-practice-workspace'}); const card=el('section',{className:'kl-card'}); const feedback=feedbackNode();

  const nextStage=el('div',{className:'kl-practice-next'});
  const isResultComplete=(result    )=>isPracticeResultComplete(page.type,result);
  const run=async(command    ,alert            =el('p'))=>{try{const result=await session.apply(command);setFeedback(t,feedback,alert,result);try{await onResult?.(result);}catch{feedback.textContent=t.ui('ui.save-failed');}if(isResultComplete(result)&&!nextStage.childElementCount){nextStage.append(link(t.ui('ui.next'),`/learn/${page.learningUnit.id}/quiz`,'kl-button kl-button--primary'));}return result;}catch{feedback.textContent=t.ui('ui.error');}};

  if(model.kind==='experiment'){
    const layout=el('div',{className:'kl-experiment-layout'});
    const stage=el('div',{className:'kl-experiment-stage','attrs':{'aria-label':t.ui('ui.lab-stage')}}       );
    stage.append(el('div',{className:'kl-experiment-stage__title',text:t.ui('ui.lab-title')}));
    const vessel=el('div',{className:'kl-experiment-vessel'}); vessel.append(el('span',{className:'kl-experiment-liquid'}),el('span',{className:'kl-experiment-bubbles',text:'○ ○ ○'}));
    const flame=el('div',{className:'kl-experiment-flame'}); const observation=el('div',{className:'kl-experiment-observation',text:t.ui('ui.lab-start'),'attrs':{'aria-live':'polite'}}       );
    stage.append(vessel,flame,observation);
    const panel=el('aside',{className:'kl-experiment-panel'});
    panel.append(el('h2',{text:t.ui('ui.lab-steps')}));
    if(model.equipment) panel.append(el('p',{className:'kl-muted',text:t.ui('ui.lab-equipment',{text:model.equipment})}));
    if(model.materials) panel.append(el('p',{className:'kl-muted',text:t.ui('ui.lab-materials',{text:model.materials})}));
    if(model.safety) panel.append(el('div',{className:'kl-feedback',text:t.ui('ui.lab-safety',{text:model.safety})}));
    let equation                           ;
    if(model.controls.some(x=>x.requiresEquation)){
      const label=el('label',{className:'kl-field'}); label.append(el('span',{text:t.ui('ui.net-ionic')})); equation=el('input',{attrs:{type:'text',placeholder:'Ag+ + Cl- → AgCl(s)','aria-label':t.ui('ui.net-ionic')}}); label.append(equation); panel.append(label);
    }
    const steps=el('div',{className:'kl-experiment-step-list'}); panel.append(steps);
    model.controls.forEach((item,index)=>{
      const row=el('div',{className:`kl-experiment-step${index===0?' is-current':''}`});
      row.append(el('strong',{text:`${index+1}. ${item.label}`}));
      const button=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.do'),attrs:{type:'button'}});
      button.addEventListener('click',()=>void run({kind:'experiment-action',action:{type:item.action,...(item.requiresEquation?{payload:{netIonicEquation:equation?.value??''}}:{})}}).then(result=>{
        if(!result) return;
        row.classList.remove('is-current'); row.classList.add('is-done');
        const next=row.nextElementSibling                    ; next?.classList.add('is-current');
        const semantic=`${item.action} ${item.label}`.toLocaleLowerCase('uz');
        stage.classList.toggle('is-heating',/heat|qizdir|alanga|ignite|burn|yoq/.test(semantic));
        stage.classList.toggle('is-active',/gas|gaz|mix|aralashtir|add|qo‘sh|drop|tomiz/.test(semantic));
        if(/filter|filtr/.test(semantic)) stage.classList.add('is-filtering');
        observation.textContent=chemistryObservationText(t,result,item.label);
        button.setAttribute('disabled',''); button.textContent=t.ui('ui.done');
      }));
      row.append(button); steps.append(row);
    });
    layout.append(stage,panel); card.append(layout);
  } else if(model.kind==='simulation'){
      card.append(el('h2',{text:t.ui('ui.model')}));
      for(const control of model.controls){
        const {form,alert}=questionForm(t,control.question,t.ui('ui.apply'),false,value=>void run({kind:'simulation-action',action:{field:control.field,value}},alert));
        form.classList.add('kl-simulation-control'); card.append(form);
      }
  } else if(model.kind==='trainer'){
    card.append(el('h2',{text:model.expectedInput==='formula'?t.ui('ui.formula-trainer'):t.ui('ui.exercise')}),el('p',{text:model.prompt}));
    const {form,alert}=questionForm(t,model.question,t.ui('ui.submit'),true,value=>void run({kind:'trainer-answer',answer:String(value)},alert));
    card.append(form);
  } else if(model.kind==='calculation'){
    card.append(el('h2',{text:`${t.ui('ui.calculation')}: ${model.formula}`}));
    for(const step of model.steps){
      const q                  ={id:step.id,label:step.label,valueType:'number',input:{kind:'number'}};
      const {form,alert}=questionForm(t,q,t.ui('ui.submit'),false,value=>void run({kind:'calculation-response',response:{stepId:step.id,value:Number(value),unit:step.unit}},alert));
      form.classList.add('kl-calculation-row'); form.querySelector('input')?.setAttribute('aria-label',step.label); card.append(form);
    }
  } else {
    card.append(el('h2',{text:t.ui('ui.case-title')})); const form=el('form',{className:'kl-form'}); const fieldset=document.createElement('fieldset');fieldset.append(el('legend',{text:t.ui('ui.case-legend',{n:model.minimum})}));
    for(const item of model.evidenceOptions){const label=el('label',{className:'kl-check'});const input=el('input',{attrs:{type:'checkbox',name:'evidence',value:item.id}});label.append(input,document.createTextNode(` ${item.label}`));fieldset.append(label);} const decision=el('input',{attrs:{name:'decision',required:'',placeholder:t.ui('ui.case-decision'),'aria-label':t.ui('ui.case-decision')}});const justification=el('textarea',{attrs:{name:'justification',required:'',placeholder:t.ui('ui.case-justification'),'aria-label':t.ui('ui.case-justification')}});const reflection=el('textarea',{attrs:{name:'reflection',placeholder:t.ui('ui.case-reflection'),'aria-label':t.ui('ui.case-reflection')}});const alert=alertNode();form.append(fieldset,decision,justification,reflection,el('button',{className:'kl-button kl-button--primary',text:t.ui('ui.case-submit'),attrs:{type:'submit'}}),alert);form.addEventListener('submit',e=>{e.preventDefault();const ids=[...form.querySelectorAll                  ('input[name="evidence"]:checked')].map(x=>x.value);void run({kind:'case-submit',value:{evidenceIds:ids,decision:decision.value,justification:justification.value,reflection:reflection.value}},alert);});card.append(form);
  }
  card.append(feedback,nextStage); shell.append(card); root.append(head,shell);
}
