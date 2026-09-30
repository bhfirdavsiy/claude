// Hydrolysis-medium reference renderer (P1.5). Draws a HydrolysisRendererModel and emits intents; the salts, the
// medium, the indicator colour and the verdict all come from the domain behind the host
// (session → adapter → hydrolysis-trial.ts → HydrolysisModel). It exposes the existing domain model — it does not
// add chemistry.
//
// Flow: 1) choose a salt (native radio group) → 2) predict the medium (radio group, enabled once a salt is chosen)
// → 3) add the indicator (button, enabled only once a prediction exists: predict-before-reveal) → observation.
// Accessibility: native form controls (keyboard: Tab + arrow keys + Space/Enter), localized labels (never raw
// ids), a text-state table, an aria-live summary, text + shape for the verdict (✓/✗, never colour only), no motion.
                                                                        
import {el,clear} from '../../ui/components/dom.js';
import {HYDROLYSIS_MEDIUM_CAPABILITY} from '../catalog.js';
import {commandFor} from '../intent.js';
                                                                                                              
import {toHydrolysisRendererModel,                            } from './renderer-model.js';

                                   
                                             
                                                                      
                          

/** Typed intents in the existing command contract: experiment pages send experiment-action, simulation pages simulation-action. */
export function hydrolysisIntent(action                       ,practiceType                                     ='experiment')                {
  return commandFor(practiceType,action);
}

let instances=0;

function mount(root            ,host             ,context                     )                 {
  clear(root);
  const uid=`kl-hydro-${++instances}`;
  const send=(action                       )=>{
    queue=queue.then(async()=>{
      try{ await host.dispatch(hydrolysisIntent(action,context.practiceType)); }
      catch{ status.textContent='Amalni bajarib bo‘lmadi. Qaytadan urinib ko‘ring.'; }
    });
  };
  // intents are applied strictly in order; the host draws every engine result through update()
  let queue              =Promise.resolve();

  const card=el('section',{className:'kl-card kl-hydro',attrs:{'data-renderer':`${HYDROLYSIS_MEDIUM_CAPABILITY.id}@${HYDROLYSIS_MEDIUM_CAPABILITY.version}`,'aria-labelledby':`${uid}-title`}});
  const title=el('h2',{text:'Tuz gidrolizi: eritma muhitini aniqlash',attrs:{id:`${uid}-title`}});
  const goal=el('p',{className:'kl-hydro__goal'});

  const saltSet=el('fieldset',{className:'kl-hydro__group'});
  saltSet.append(el('legend',{text:'1. Tuzni tanlang'}));
  const mediumSet=el('fieldset',{className:'kl-hydro__group'});
  mediumSet.append(el('legend',{text:'2. Muhitni oldindan ayting'}));
  const saltInputs=new Map                         ();
  const saltTags=new Map                    ();
  const mediumInputs=new Map                         ();
  const radio=(name       ,value       ,label       ,data                      ,onPick         )=>{
    const input=el('input',{attrs:{type:'radio',name,value,...data}});
    input.addEventListener('change',()=>{ if(input.checked) onPick(); });
    const tag=el('span',{className:'kl-hydro__tag'});
    const l=el('label',{className:'kl-hydro__option'}); l.append(input,el('span',{text:label}),tag);
    return {input,label:l,tag};
  };
  const reveal=el('button',{className:'kl-button kl-button--primary',text:'3. Indikator qo‘shish',attrs:{type:'button','data-action':'add-indicator'}});
  reveal.addEventListener('click',()=>send({type:'addIndicator'}));
  const revealHint=el('p',{className:'kl-hydro__hint',attrs:{id:`${uid}-hint`}});
  reveal.setAttribute('aria-describedby',`${uid}-hint`);

  const observation=el('p',{className:'kl-hydro__observation',attrs:{'data-observation':'none'}});
  const feedback=el('p',{className:'kl-hydro__feedback',attrs:{'data-result':'none'}});
  const table=el('table',{className:'kl-hydro__state'});
  table.append(el('caption',{text:'Tajriba holati'}));
  const body=el('tbody');
  const cells                           ={};
  for(const [key,text] of [['salt','Tanlangan tuz'],['prediction','Bashorat'],['observation','Kuzatuv'],['result','Natija']]         ){
    const tr=el('tr'); tr.append(el('th',{text,attrs:{scope:'row'}})); const td=el('td',{attrs:{'data-field':key}}); tr.append(td); body.append(tr); cells[key]=td;
  }
  table.append(body);
  const history=el('ol',{className:'kl-hydro__trials',attrs:{'aria-label':'Sinovlar'}});
  const goalState=el('p',{className:'kl-hydro__goal-state',attrs:{'data-goal':'pending'}});
  const status=el('p',{className:'kl-hydro__summary',attrs:{role:'status','aria-live':'polite','aria-atomic':'true'}});
  card.append(title,goal,saltSet,mediumSet,reveal,revealHint,observation,feedback,table,history,goalState,status);
  root.append(card);

  function update(result        ){
    // an input that is not a hydrolysis result throws: the host's error boundary then fails closed
    const m                        =toHydrolysisRendererModel(result);
    goal.textContent=`Maqsad: ${m.target.label} eritmasi muhitini oldindan ayting va indikator bilan tekshiring.`;
    for(const s of m.salts){
      let input=saltInputs.get(s.id);
      if(!input){ const r=radio(`${uid}-salt`,s.id,s.label,{'data-salt':s.id},()=>send({type:'selectSalt',payload:{salt:s.id}})); saltSet.append(r.label); saltInputs.set(s.id,r.input); input=r.input; saltTags.set(s.id,r.tag); }
      input.checked=s.selected;
      // a salt tried in this attempt stays visible (checked while it is the current one) but cannot be picked again
      input.disabled=s.tried&&!s.selected;
      saltTags.get(s.id) .textContent=s.tried?' (sinab ko‘rilgan)':'';
    }
    for(const md of m.media){
      let input=mediumInputs.get(md.id);
      if(!input){ const r=radio(`${uid}-medium`,md.id,md.label,{'data-medium':md.id},()=>send({type:'predictMedium',payload:{medium:md.id}})); mediumSet.append(r.label); mediumInputs.set(md.id,r.input); input=r.input; }
      input.checked=md.selected; input.disabled=!m.canPredict;
    }
    reveal.disabled=!m.canReveal;
    revealHint.textContent=m.step==='chooseSalt'?'Avval tuzni tanlang.':m.step==='predict'?'Indikator qo‘shishdan oldin muhitni bashorat qiling.':m.step==='reveal'?'Endi indikator qo‘shib, bashoratingizni tekshiring.':'Yangi sinov uchun boshqa tuzni tanlang.';
    observation.dataset.observation=m.observation?m.observation.medium:'none';
    observation.textContent=m.observation?m.observation.text:'Indikator hali qo‘shilmagan.';
    feedback.dataset.result=m.feedback?m.feedback.result:'none';
    feedback.textContent=m.feedback?`${m.feedback.result==='correct'?'✓':m.feedback.result==='incorrect'?'✗':'!'} ${m.feedback.text}`:(m.rejection??'');
    const sel=m.salts.find(s=>s.selected), pred=m.media.find(x=>x.selected);
    cells.salt .textContent=sel?sel.label:'—';
    cells.prediction .textContent=pred?pred.label:'—';
    cells.observation .textContent=m.observation?`${m.observation.colorLabel} (${m.observation.indicatorLabel}) — ${m.observation.mediumLabel}`:'—';
    cells.result .textContent=m.feedback?(m.feedback.result==='correct'?'✓ To‘g‘ri':m.feedback.result==='incorrect'?'✗ Noto‘g‘ri':'! Baholanmaydi'):'—';
    clear(history);
    for(const t of m.trials) history.append(el('li',{text:t.text,attrs:{'data-correct':String(t.correct)}}));
    goalState.dataset.goal=m.goalReached?'reached':'pending';
    goalState.textContent=m.goalReached?`✓ Maqsadga yetildi: ${m.target.label} eritmasi muhiti to‘g‘ri bashorat qilindi.`:`○ Maqsad: ${m.target.label} uchun to‘g‘ri bashorat hali yo‘q.`;
    status.textContent=m.accessibleSummary;
    card.dataset.model=JSON.stringify(m);
  }
  return {update,destroy:()=>clear(root)};
}

export const hydrolysisMediumRenderer                       =Object.freeze({capability:HYDROLYSIS_MEDIUM_CAPABILITY,mount});
