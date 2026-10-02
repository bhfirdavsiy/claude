import type {StudentPracticePageModel} from './model.ts';
import {buildPracticeUiModel} from './ui-model.ts';
import {isPracticeResultComplete} from '../../runtime/learning-orchestrator/selectors.ts';
import {feedbackState} from '../../runtime/shared/learner-input.ts';
import {createLocalizer} from '../localization/element-names.ts';
import {answerValue,createLabeler,type FormQuestionModel,type Labeler} from './form-question.ts';

/** What the page needs from a practice session: send a command, get the engine result (no persistence here). */
export interface PracticeCommandPort { apply(command:any):Promise<any> }
import {el,clear,link} from '../../ui/components/dom.ts';

// P2.1: all shared interaction text comes from the learner-interaction catalog (`ui.*`), the verdict is TEXT (never
// colour only) derived from the engine's result AFTER a submission, and invalid input is announced with role=alert.
function feedbackNode(){return el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});}
function alertNode(){return el('p',{className:'kl-field-error',attrs:{role:'alert'}});}
// P2.9: the feedback sentence comes from ONE taxonomy (runtime/shared/learner-input.ts) — the category is also
// exposed as data-feedback for tests; VALID_INTERMEDIATE never claims a verdict, PROCEDURE_BLOCKED is not "wrong".
function setFeedback(t:Labeler,node:HTMLElement,alert:HTMLElement,result:any){
  alert.textContent='';
  const state=feedbackState(result??{});
  switch(state.category){
    case 'UNSUPPORTED_INPUT': node.textContent=t.ui('ui.retry'); alert.textContent=t.ui(state.notModeled?'ui.not-modeled':'ui.input-invalid'); break;
    case 'PROCEDURE_BLOCKED': node.textContent=t.ui('ui.retry'); alert.textContent=t.ui('ui.procedure-blocked'); break;
    case 'INCORRECT': node.textContent=`${t.ui('ui.incorrect')} ${t.ui('ui.retry')}`; break;
    case 'CORRECT': node.textContent=`${t.ui('ui.correct')} ${t.ui(state.complete?'ui.complete':'ui.continue')}`; break;
    default: node.textContent=t.ui('ui.intermediate');
  }
  node.dataset.feedback=state.category;
  // P2.7: the verdict is also a visible, non-colour symbol (decorative for screen readers: the sentence carries it)
  const verdict=state.category==='CORRECT'?'correct':state.category==='INCORRECT'?'incorrect':'none';
  node.dataset.verdict=verdict;
  if(verdict!=='none') node.prepend(el('span',{className:'kl-verdict-mark',text:verdict==='correct'?'✓ ':'✗ ',attrs:{'aria-hidden':'true'}}));
}
function observationLabel(t:Labeler,observation:any){
  if(typeof observation?.description==='string'&&observation.description.trim()) return observation.description.trim();
  if(observation.type==='precipitate') return observation.color?t.ui('ui.obs-precipitate-color',{color:observation.color}):t.ui('ui.obs-precipitate');
  if(observation.type==='gas') return t.ui('ui.obs-gas');
  if(observation.type==='color-change') return t.ui('ui.obs-color');
  if(observation.type==='temperature-change') return t.ui(observation.direction==='up'?'ui.obs-heat-up':'ui.obs-heat');
  if(observation.type==='no-visible-change') return t.ui('ui.obs-none');
  if(observation.type==='state-change') return t.ui('ui.obs-state');
  return t.ui('ui.obs-generic');
}
function chemistryObservationText(t:Labeler,result:any,fallback:string){
  const observations=[...(result?.evidence??[])].filter((e:any)=>e?.type==='observation').map((e:any)=>e.observation);
  if(!observations.length) return t.ui('ui.obs-done',{step:fallback});
  return t.ui('ui.obs-recorded',{step:fallback,list:observations.map(o=>observationLabel(t,o)).join('; ')});
}

let questionSeq=0;
/** One form for one question: a choice is a fieldset/legend with native radios (keyboard: Tab + arrows + Space/Enter),
 *  a typed answer is a labelled input. The DOM carries the option INDEX, never the canonical token or its correctness. */
function questionForm(t:Labeler,q:FormQuestionModel,submitText:string,primary:boolean,onValue:(value:string|number|boolean)=>void){
  // P2.7: novalidate — the browser's own (English, unannounced) required-field bubble never replaces the localized
  // role=alert message below; the submit handler validates instead.
  const form=el('form',{className:'kl-form kl-question',attrs:{novalidate:''}}); const alert=alertNode(); const uid=`klq${++questionSeq}`;
  alert.id=`${uid}-error`;
  let read:()=>string; let focusFirst:()=>void; let invalidTarget:HTMLElement;
  if(q.input.kind==='choice'){
    const fieldset=document.createElement('fieldset'); fieldset.className='kl-choice-group'; fieldset.setAttribute('aria-describedby',alert.id);
    fieldset.append(el('legend',{text:q.label,attrs:{id:`${uid}-label`}}));
    const radios=q.input.choices.map((choice,i)=>{
      const label=el('label',{className:'kl-check kl-choice'});
      const radio=el('input',{attrs:{type:'radio',name:`${uid}-${q.id}`,value:String(i)}}) as HTMLInputElement;
      label.append(radio,document.createTextNode(` ${choice.label}`)); fieldset.append(label); return radio;
    });
    form.append(fieldset);
    read=()=>radios.find(r=>r.checked)?.value??''; focusFirst=()=>radios[0]?.focus(); invalidTarget=fieldset;
  }else{
    const label=el('label',{className:'kl-field'}); label.append(el('span',{text:q.label,attrs:{id:`${uid}-label`}}));
    const input=el('input',{attrs:{name:q.id,type:q.input.kind==='number'?'number':'text',...(q.input.kind==='number'?{step:'any'}:{}),required:'','autocomplete':'off','aria-describedby':alert.id}}) as HTMLInputElement;
    label.append(input); form.append(label);
    read=()=>input.value; focusFirst=()=>input.focus(); invalidTarget=input;
  }
  // P2.7: several forms share one button text (ui.submit / ui.apply); the question label tells them apart
  form.append(el('button',{className:`kl-button ${primary?'kl-button--primary':'kl-button--secondary'}`,text:submitText,attrs:{type:'submit','aria-describedby':`${uid}-label`}}),alert);
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const value=answerValue(q,read());
    if(value===null){ alert.textContent=t.ui(q.input.kind==='choice'?'ui.choose':'ui.empty'); invalidTarget.setAttribute('aria-invalid','true'); focusFirst(); return; }
    alert.textContent=''; invalidTarget.removeAttribute('aria-invalid'); onValue(value);
  });
  return {form,alert};
}

export function renderPractice(root:HTMLElement,page:StudentPracticePageModel,session:PracticeCommandPort,onResult?:(result:any)=>void|Promise<void>){
  clear(root); const model=buildPracticeUiModel(page); const t=createLabeler(createLocalizer(page.localization));
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(link(t.ui('ui.back'),model.backHref,'kl-back-link'),el('p',{className:'kl-kicker',text:t.ui('ui.kicker')}),el('h1',{text:model.title}),el('p',{className:'kl-unit-outcome',text:model.goal})); head.append(hi);
  const shell=el('div',{className:'kl-shell kl-practice-workspace'}); const card=el('section',{className:'kl-card'}); const feedback=feedbackNode();

  const nextStage=el('div',{className:'kl-practice-next'});
  const isResultComplete=(result:any)=>isPracticeResultComplete(page.type,result);
  const run=async(command:any,alert:HTMLElement=el('p'))=>{try{const result=await session.apply(command);setFeedback(t,feedback,alert,result);try{await onResult?.(result);}catch{feedback.textContent=t.ui('ui.save-failed');}if(isResultComplete(result)&&!nextStage.childElementCount){nextStage.append(link(t.ui('ui.next'),`/learn/${page.learningUnit.id}/quiz`,'kl-button kl-button--primary'));}return result;}catch{feedback.textContent=t.ui('ui.error');feedback.dataset.feedback='SYSTEM_ERROR';feedback.dataset.verdict='none';}};

  if(model.kind==='experiment'){
    const layout=el('div',{className:'kl-experiment-layout'});
    // P2.7: a named group (aria-label on a plain div is ignored); the vessel/flame/bubbles are decoration — the
    // observation sentence below is the text equivalent, so they are hidden from screen readers
    const stage=el('div',{className:'kl-experiment-stage',attrs:{role:'group','aria-label':t.ui('ui.lab-stage')}});
    stage.append(el('div',{className:'kl-experiment-stage__title',text:t.ui('ui.lab-title')}));
    const vessel=el('div',{className:'kl-experiment-vessel',attrs:{'aria-hidden':'true'}}); vessel.append(el('span',{className:'kl-experiment-liquid'}),el('span',{className:'kl-experiment-bubbles',text:'○ ○ ○'}));
    const flame=el('div',{className:'kl-experiment-flame',attrs:{'aria-hidden':'true'}}); const observation=el('div',{className:'kl-experiment-observation',text:t.ui('ui.lab-start'),'attrs':{'aria-live':'polite'}} as any);
    stage.append(vessel,flame,observation);
    const panel=el('aside',{className:'kl-experiment-panel'});
    panel.append(el('h2',{text:t.ui('ui.lab-steps')}));
    if(model.equipment) panel.append(el('p',{className:'kl-muted',text:t.ui('ui.lab-equipment',{text:model.equipment})}));
    if(model.materials) panel.append(el('p',{className:'kl-muted',text:t.ui('ui.lab-materials',{text:model.materials})}));
    if(model.safety) panel.append(el('div',{className:'kl-feedback',text:t.ui('ui.lab-safety',{text:model.safety})}));
    let equation:HTMLInputElement|undefined;
    // P2.7: the experiment's own alert lives in the page (it was a detached node: invalid input was never shown)
    const stepAlert=alertNode(); stepAlert.id=`klx${++questionSeq}-error`;
    if(model.controls.some(x=>x.requiresEquation)){
      const label=el('label',{className:'kl-field'}); label.append(el('span',{text:t.ui('ui.net-ionic')})); equation=el('input',{attrs:{type:'text',placeholder:'Ag+ + Cl- → AgCl(s)','aria-describedby':stepAlert.id}}); label.append(equation); panel.append(label);
    }
    const steps=el('div',{className:'kl-experiment-step-list'}); panel.append(steps);
    model.controls.forEach((item,index)=>{
      const row=el('div',{className:`kl-experiment-step${index===0?' is-current':''}`,attrs:index===0?{'aria-current':'step'}:{}});
      const labelId=`${stepAlert.id}-step${index}`;
      row.append(el('strong',{text:`${index+1}. ${item.label}`,attrs:{id:labelId}}));
      // P2.7: every step button is named by its step (ui.do + the step label), not only ui.do; a finished step keeps
      // focus (aria-disabled instead of disabled, so focus never falls to <body>); a REJECTED action (e.g. out of
      // order) leaves the step open so the learner can retry it.
      const button=el('button',{className:'kl-button kl-button--secondary',attrs:{type:'button','aria-describedby':stepAlert.id}});
      const buttonText=el('span',{text:t.ui('ui.do'),attrs:{id:`${labelId}-do`}}); button.append(buttonText);
      button.setAttribute('aria-labelledby',`${labelId}-do ${labelId}`);
      button.addEventListener('click',()=>{ if(button.getAttribute('aria-disabled')==='true') return; void run({kind:'experiment-action',action:{type:item.action,...(item.requiresEquation?{payload:{netIonicEquation:equation?.value??''}}:{})}},stepAlert).then(result=>{
        if(!result) return;
        const last=result?.outcomes?.at?.(-1);
        if(last&&last.status!=='accepted') return;
        row.classList.add('is-done');
        // P2.9: the "current step" marker goes to the first step that is NOT done (not to the DOM neighbour of the
        // step just done): where the engine accepts steps in any order the marker never points at a finished step
        const rows=[...steps.children] as HTMLElement[];
        for(const r of rows){ r.classList.remove('is-current'); r.removeAttribute('aria-current'); }
        const next=rows.find(r=>!r.classList.contains('is-done')); next?.classList.add('is-current'); next?.setAttribute('aria-current','step');
        const semantic=`${item.action} ${item.label}`.toLocaleLowerCase('uz');
        stage.classList.toggle('is-heating',/heat|qizdir|alanga|ignite|burn|yoq/.test(semantic));
        stage.classList.toggle('is-active',/gas|gaz|mix|aralashtir|add|qo‘sh|drop|tomiz/.test(semantic));
        if(/filter|filtr/.test(semantic)) stage.classList.add('is-filtering');
        observation.textContent=chemistryObservationText(t,result,item.label);
        button.setAttribute('aria-disabled','true'); buttonText.textContent=t.ui('ui.done');
      }); });
      row.append(button); steps.append(row);
    });
    panel.append(stepAlert);
    layout.append(stage,panel); card.append(layout);
  } else if(model.kind==='simulation'){
      card.append(el('h2',{text:t.ui('ui.model')}));
      if(model.targetOnly) card.append(el('p',{className:'kl-muted kl-target-only-note',text:t.ui('ui.sim-target-only'),attrs:{'data-feedback-semantics':'target-only'}}));
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
      const q:FormQuestionModel={id:step.id,label:step.label,valueType:'number',input:{kind:'number'}};
      const {form,alert}=questionForm(t,q,t.ui('ui.submit'),false,value=>void run({kind:'calculation-response',response:{stepId:step.id,value:Number(value),unit:step.unit}},alert));
      form.classList.add('kl-calculation-row'); form.querySelector('input')?.setAttribute('aria-label',step.label); card.append(form);
    }
  } else {
    card.append(el('h2',{text:t.ui('ui.case-title')})); const form=el('form',{className:'kl-form'}); const fieldset=document.createElement('fieldset');fieldset.append(el('legend',{text:t.ui('ui.case-legend',{n:model.minimum})}));
    for(const item of model.evidenceOptions){const label=el('label',{className:'kl-check'});const input=el('input',{attrs:{type:'checkbox',name:'evidence',value:item.id}});label.append(input,document.createTextNode(` ${item.label}`));fieldset.append(label);} const alert=alertNode();alert.id=`klc${++questionSeq}-error`;fieldset.setAttribute('aria-describedby',alert.id);
    // P2.7: visible labels (a placeholder disappears while typing), errors bound to the fields, and novalidate so the
    // localized feedback — not the browser's English required-field bubble — answers an empty submission
    form.setAttribute('novalidate','');
    const field=(text:string,control:HTMLElement)=>{const label=el('label',{className:'kl-field'});label.append(el('span',{text}),control);control.setAttribute('aria-describedby',alert.id);return label;};
    const decision=el('input',{attrs:{name:'decision',required:'',autocomplete:'off'}});const justification=el('textarea',{attrs:{name:'justification',required:''}});const reflection=el('textarea',{attrs:{name:'reflection'}});form.append(fieldset,field(t.ui('ui.case-decision'),decision),field(t.ui('ui.case-justification'),justification),field(t.ui('ui.case-reflection'),reflection),el('button',{className:'kl-button kl-button--primary',text:t.ui('ui.case-submit'),attrs:{type:'submit'}}),alert);form.addEventListener('submit',e=>{e.preventDefault();const ids=[...form.querySelectorAll<HTMLInputElement>('input[name="evidence"]:checked')].map(x=>x.value);void run({kind:'case-submit',value:{evidenceIds:ids,decision:decision.value,justification:justification.value,reflection:reflection.value}},alert);});card.append(form);
  }
  card.append(feedback,nextStage); shell.append(card); root.append(head,shell);
}
