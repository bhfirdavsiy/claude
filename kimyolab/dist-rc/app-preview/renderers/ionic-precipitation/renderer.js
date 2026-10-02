// Ionic-precipitation reference renderer (P1.6). Draws an IonicPrecipitationRendererModel and emits intents; the
// reagent shelf, what a pair does, the observation and the equation verdict all come from the domain behind the
// host (session → adapter → ionic-mixing.ts → ReactionMatcher / IonicEngine). It does no reaction lookup, no
// solubility reasoning and no equation checking of its own.
//
// Flow: 1) choose reagent A and reagent B (native <select>s) → 2) mix (button) → observation → 3) write the net
// ionic equation (text field, plain-text syntax help) → check.
// Accessibility: native controls (keyboard only), labels and syntax help tied to the field, observations as
// text (colour words, never colour only), a text-state table, an aria-live summary, no motion at all.
                                                                        
import {el,clear,setDisabled} from '../../ui/components/dom.js';
import {IONIC_PRECIPITATION_CAPABILITY} from '../catalog.js';
import {commandFor} from '../intent.js';
                                                                                                              
import {toIonicPrecipitationRendererModel,                                    } from './renderer-model.js';

                              
                                                                  
                
                                                     

/** Typed intents in the existing command contract (experiment-action for the 8.1 experiment page). */
export function ionicIntent(action                  ,practiceType                                     ='experiment')                {
  return commandFor(practiceType,action);
}

let instances=0;

function mount(root            ,host             ,context                     )                 {
  clear(root);
  const uid=`kl-ionic-${++instances}`;
  let queue              =Promise.resolve();
  const send=(action                  )=>{
    queue=queue.then(async()=>{
      try{ await host.dispatch(ionicIntent(action,context.practiceType)); }
      catch{ status.textContent='Amalni bajarib bo‘lmadi. Qaytadan urinib ko‘ring.'; }
    });
  };

  const card=el('section',{className:'kl-card kl-ionic',attrs:{'data-renderer':`${IONIC_PRECIPITATION_CAPABILITY.id}@${IONIC_PRECIPITATION_CAPABILITY.version}`,'aria-labelledby':`${uid}-title`}});
  const title=el('h2',{text:'Ion almashinish tajribasi: reagentlarni aralashtiring',attrs:{id:`${uid}-title`}});
  const intro=el('p',{className:'kl-ionic__goal',text:'Tokchadan ikki reagent tanlang, ularni aralashtiring, kuzatuvni yozib oling va qisqa ionli tenglamani tuzing.'});

  const chooser=el('fieldset',{className:'kl-ionic__group'});
  chooser.append(el('legend',{text:'1. Reagentlarni tanlang'}));
  const selects                                  ={}       ;
  for(const slot of ['A','B']         ){
    const id=`${uid}-reagent-${slot}`;
    const wrap=el('div',{className:'kl-ionic__field'});
    const label=el('label',{text:slot==='A'?'Birinchi reagent (A)':'Ikkinchi reagent (B)',attrs:{for:id}});
    const select=el('select',{attrs:{id,'data-slot':slot}});
    select.append(el('option',{text:'— tanlang —',attrs:{value:''}}));
    select.addEventListener('change',()=>{ if(select.value) send({type:'selectReagent',payload:{slot,speciesId:select.value}}); });
    wrap.append(label,select); chooser.append(wrap); selects[slot]=select;
  }
  const mix=el('button',{className:'kl-button kl-button--primary',text:'2. Aralashtirish',attrs:{type:'button','data-action':'mix'}});
  mix.addEventListener('click',()=>send({type:'mix'}));

  const observation=el('p',{className:'kl-ionic__observation',attrs:{'data-reaction-state':'not-mixed'}});

  const form=el('form',{className:'kl-ionic__equation',attrs:{novalidate:''}});
  const eqId=`${uid}-equation`, helpId=`${uid}-equation-help`;
  const eqLabel=el('label',{text:'3. Qisqa ionli tenglama',attrs:{for:eqId}});
  const eqInput=el('input',{attrs:{id:eqId,type:'text',autocomplete:'off',spellcheck:'false','aria-describedby':helpId,'data-field':'equation-input'}});
  const eqHelp=el('p',{className:'kl-ionic__help',attrs:{id:helpId}});
  const check=el('button',{className:'kl-button kl-button--secondary',text:'Tekshirish',attrs:{type:'submit','data-action':'check-equation'}});
  const eqResult=el('p',{className:'kl-ionic__result',attrs:{'data-result':'none'}});
  form.addEventListener('submit',(event)=>{ event.preventDefault(); send({type:'writeEquation',payload:{equation:eqInput.value}}); });
  form.append(eqLabel,eqInput,check,eqHelp,eqResult);

  const table=el('table',{className:'kl-ionic__state'});
  table.append(el('caption',{text:'Tajriba holati'}));
  const body=el('tbody');
  const cells                           ={};
  for(const [key,text] of [['reagents','Reagentlar'],['observation','Kuzatuv'],['equation','Net-ion']]         ){
    const tr=el('tr'); tr.append(el('th',{text,attrs:{scope:'row'}})); const td=el('td',{attrs:{'data-field':key}}); tr.append(td); body.append(tr); cells[key]=td;
  }
  table.append(body);
  const history=el('ol',{className:'kl-ionic__mixes',attrs:{'aria-label':'Aralashtirilgan juftliklar'}});
  const goalState=el('p',{className:'kl-ionic__goal-state',attrs:{'data-goal':'pending'}});
  const status=el('p',{className:'kl-ionic__summary',attrs:{role:'status','aria-live':'polite','aria-atomic':'true'}});
  card.append(title,intro,chooser,mix,observation,form,table,history,goalState,status);
  root.append(card);

  let optionsBuilt=false;
  function update(result        ){
    // an input that is not an ionic result throws: the host's error boundary then fails closed
    const m                                =toIonicPrecipitationRendererModel(result,context.localize);
    if(!optionsBuilt){
      for(const slot of ['A','B']         ) for(const r of m.reagents) selects[slot].append(el('option',{text:r.name?`${r.label} — ${r.name}`:r.label,attrs:{value:r.id,'data-reagent':r.id}}));
      optionsBuilt=true;
    }
    selects.A.value=m.selectedA??''; selects.B.value=m.selectedB??'';
    observation.dataset.reactionState=m.reactionState;
    observation.textContent=m.observation?m.observation.text:'Hali aralashtirilmagan.';
    // P2.7: the focused control is never disabled into a focus loss (setDisabled hands focus on); the equation
    // field is enabled first so a finished mix can hand focus to it
    setDisabled(eqInput,!m.equation.canWrite,()=>eqResult); setDisabled(check,!m.equation.canWrite,()=>eqResult);
    setDisabled(mix,!m.canMix,()=>m.equation.canWrite?eqInput:observation);
    eqHelp.textContent=m.equation.syntaxHelp;
    eqResult.dataset.result=m.equation.lastResult?(m.equation.lastResult.correct?'correct':'incorrect'):'none';
    eqResult.textContent=m.rejection??(m.equation.lastResult?.text??'');
    const label=(id            )=>{ const r=m.reagents.find(x=>x.id===id); return r?(r.name?`${r.label} (${r.name})`:r.label):'—'; };
    cells.reagents .textContent=`${label(m.selectedA)} va ${label(m.selectedB)}`;
    cells.observation .textContent=m.observation?m.observation.text:'—';
    cells.equation .textContent=m.equation.solved?'✓ To‘g‘ri yozilgan':m.equation.lastResult?'✗ Noto‘g‘ri':'—';
    clear(history);
    for(const x of m.mixes) history.append(el('li',{text:x.text,attrs:{'data-state':x.state}}));
    goalState.dataset.goal=m.goalReached?'reached':'pending';
    goalState.textContent=m.goalReached?'✓ Maqsadga yetildi: reaksiya kuzatildi va qisqa ionli tenglama to‘g‘ri yozildi.':'○ Maqsad hali bajarilmagan.';
    status.textContent=m.accessibleSummary;
    card.dataset.model=JSON.stringify(m);
  }
  return {update,destroy:()=>clear(root)};
}

export const ionicPrecipitationRenderer                       =Object.freeze({capability:IONIC_PRECIPITATION_CAPABILITY,mount});
