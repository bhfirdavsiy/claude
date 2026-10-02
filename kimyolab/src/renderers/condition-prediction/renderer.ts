// Condition-prediction reference renderer (P2.6, ADR-P2-007). Draws a ConditionRendererModel and emits intents; the
// conditions, the outcome options, the revealed outcome and the verdict all come from the domain behind the host
// (session → adapter → condition-trial.ts → EquilibriumModel / ManganeseRedoxModel). It is a reusable primitive: it
// names no chemistry, and every learner-facing word comes from the learner-interaction catalog via context.localize.
//
// Flow: 1) choose a condition (native radio group) → 2) predict the outcome (radio group, enabled once a condition is
// chosen) → 3) reveal the model's outcome (button, enabled only once a prediction exists: predict-before-reveal).
// Accessibility: native form controls (keyboard: Tab + arrow keys + Space/Enter), fieldset + legend, localized labels
// (never raw ids), a text-state table, an aria-live summary, text + shape for the verdict (✓/✗), no motion at all.
import type {PracticeCommand} from '../../features/practice/session.ts';
import {el,clear} from '../../ui/components/dom.ts';
import {CONDITION_PREDICTION_CAPABILITY} from '../catalog.ts';
import {commandFor} from '../intent.ts';
import type {RendererHost,RendererImplementation,RendererInstance,RendererMountContext} from '../contract.ts';
import {toConditionRendererModel,type ConditionRendererModel} from './renderer-model.ts';

export type ConditionIntentAction=
  | {type:'selectCondition';payload:{condition:string}}
  | {type:'predictOutcome';payload:{outcome:string}}
  | {type:'reveal'};

/** Typed intents in the existing command contract (simulation-action for the 9.23, 11.18 and 11.20 pages). */
export function conditionIntent(action:ConditionIntentAction,practiceType:RendererMountContext['practiceType']='simulation'):PracticeCommand{
  return commandFor(practiceType,action);
}

let instances=0;

function mount(root:HTMLElement,host:RendererHost,context:RendererMountContext):RendererInstance{
  clear(root);
  const uid=`kl-cond-${++instances}`;
  let failedText='';
  let queue:Promise<void>=Promise.resolve();
  const send=(action:ConditionIntentAction)=>{
    queue=queue.then(async()=>{
      try{ await host.dispatch(conditionIntent(action,context.practiceType)); }
      catch{ status.textContent=failedText; }
    });
  };

  const card=el('section',{className:'kl-card kl-cond',attrs:{'data-renderer':`${CONDITION_PREDICTION_CAPABILITY.id}@${CONDITION_PREDICTION_CAPABILITY.version}`,'aria-labelledby':`${uid}-title`}});
  const title=el('h2',{attrs:{id:`${uid}-title`}});
  const contextLines=el('div',{className:'kl-cond__context'});
  const goal=el('p',{className:'kl-cond__goal'});

  const condSet=el('fieldset',{className:'kl-cond__group'});
  const condLegend=el('legend'); condSet.append(condLegend);
  const outSet=el('fieldset',{className:'kl-cond__group'});
  const outLegend=el('legend'); outSet.append(outLegend);
  const condInputs=new Map<string,HTMLInputElement>();
  const condTags=new Map<string,HTMLElement>();
  const outInputs=new Map<string,HTMLInputElement>();
  const radio=(name:string,value:string,label:string,data:Record<string,string>,onPick:()=>void)=>{
    const input=el('input',{attrs:{type:'radio',name,value,...data}});
    input.addEventListener('change',()=>{ if(input.checked) onPick(); });
    const tag=el('span',{className:'kl-cond__tag'});
    const l=el('label',{className:'kl-cond__option'}); l.append(input,el('span',{text:label}),tag);
    return {input,label:l,tag};
  };
  const reveal=el('button',{className:'kl-button kl-button--primary',attrs:{type:'button','data-action':'reveal','aria-describedby':`${uid}-hint`}});
  reveal.addEventListener('click',()=>send({type:'reveal'}));
  const hint=el('p',{className:'kl-cond__hint',attrs:{id:`${uid}-hint`}});

  const observation=el('p',{className:'kl-cond__observation',attrs:{'data-observation':'none'}});
  const feedback=el('p',{className:'kl-cond__feedback',attrs:{'data-result':'none'}});
  const table=el('table',{className:'kl-cond__state'});
  const caption=el('caption'); table.append(caption);
  const body=el('tbody');
  const cells:Record<string,HTMLElement>={}, heads:Record<string,HTMLElement>={};
  for(const key of ['condition','prediction','result','verdict'] as const){
    const tr=el('tr'); const th=el('th',{attrs:{scope:'row'}}); tr.append(th); const td=el('td',{attrs:{'data-field':key}}); tr.append(td); body.append(tr); cells[key]=td; heads[key]=th;
  }
  table.append(body);
  const history=el('ol',{className:'kl-cond__trials'});
  const goalState=el('p',{className:'kl-cond__goal-state',attrs:{'data-goal':'pending'}});
  const status=el('p',{className:'kl-cond__summary',attrs:{role:'status','aria-live':'polite','aria-atomic':'true'}});
  card.append(title,contextLines,goal,condSet,outSet,reveal,hint,observation,feedback,table,history,goalState,status);
  root.append(card);

  // A new condition starts a new trial: until the engine answers, no earlier prediction may look selected (a stale
  // checked radio would swallow the learner's next click). Presentation only — the next update() draws the domain state.
  function pendingCondition(){
    for(const input of outInputs.values()){ input.checked=false; input.disabled=true; }
    reveal.disabled=true;
  }

  function update(result:unknown){
    // an input that is not a condition result throws: the host's error boundary then fails closed
    const m:ConditionRendererModel=toConditionRendererModel(result,context.localize);
    failedText=m.labels.actionFailed;
    title.textContent=m.title;
    clear(contextLines); for(const line of m.context) contextLines.append(el('p',{text:line}));
    goal.textContent=m.goal;
    condLegend.textContent=m.labels.choose; outLegend.textContent=m.labels.predict; reveal.textContent=m.labels.reveal;
    caption.textContent=m.labels.state; history.setAttribute('aria-label',m.labels.trials);
    for(const key of ['condition','prediction','result','verdict'] as const) heads[key]!.textContent=m.labels.rows[key];
    for(const c of m.conditions){
      let input=condInputs.get(c.id);
      if(!input){ const r=radio(`${uid}-condition`,c.id,c.label,{'data-condition':c.id},()=>{ pendingCondition(); send({type:'selectCondition',payload:{condition:c.id}}); }); condSet.append(r.label); condInputs.set(c.id,r.input); condTags.set(c.id,r.tag); input=r.input; }
      input.checked=c.selected;
      // a condition tried in this attempt stays visible (checked while current) but cannot be picked again
      input.disabled=c.tried&&!c.selected;
      condTags.get(c.id)!.textContent=c.tried?` ${m.labels.tried}`:'';
    }
    for(const o of m.outcomes){
      let input=outInputs.get(o.id);
      if(!input){ const r=radio(`${uid}-outcome`,o.id,o.label,{'data-outcome':o.id},()=>send({type:'predictOutcome',payload:{outcome:o.id}})); outSet.append(r.label); outInputs.set(o.id,r.input); input=r.input; }
      input.checked=o.selected; input.disabled=!m.canPredict;
    }
    reveal.disabled=!m.canReveal;
    hint.textContent=m.hint;
    observation.dataset.observation=m.observation?'revealed':'none';
    observation.textContent=m.observation?m.observation.text:m.labels.resultNone;
    feedback.dataset.result=m.feedback?m.feedback.result:'none';
    feedback.textContent=m.feedback?m.feedback.text:(m.rejection??'');
    const sel=m.conditions.find(c=>c.selected), pred=m.outcomes.find(o=>o.selected);
    cells.condition!.textContent=sel?sel.label:'—';
    cells.prediction!.textContent=pred?pred.label:'—';
    cells.result!.textContent=m.observation?m.observation.label:'—';
    cells.verdict!.textContent=m.feedback?(m.feedback.result==='correct'?m.labels.verdict.correct:m.labels.verdict.incorrect):'—';
    clear(history);
    for(const t of m.trials) history.append(el('li',{text:t.text,attrs:{'data-correct':String(t.correct)}}));
    goalState.dataset.goal=m.goalReached?'reached':'pending';
    goalState.textContent=m.goalText;
    status.textContent=m.accessibleSummary;
    card.dataset.model=JSON.stringify(m);
  }
  return {update,destroy:()=>clear(root)};
}

export const conditionPredictionRenderer:RendererImplementation=Object.freeze({capability:CONDITION_PREDICTION_CAPABILITY,mount});
