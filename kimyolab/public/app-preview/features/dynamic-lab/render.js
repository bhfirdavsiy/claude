// P2.10 — the guided dynamic lab page (feature flag guidedDynamicLabV1, ADR-P2-011).
//
// Mobile-first, no drag: 1. select an object (apparatus, container, substance, observation point) → 2. choose an action
// (each one says whether it is the instruction's next step, possible, unavailable, unsupported or blocked by an earlier
// step) → 3. configure its parameters → the lab runtime decides. The page never changes chemistry state itself: every
// change is the `nextState` returned by applyLabAction, and every rejection reason comes from the domain boundary.
//
// Learner flow: Maqsad → Amal → Kuzatish → Nega? — four sections on ONE page (not a slideshow). Nothing is persisted:
// no attempt, no evidence, no progress (evidence candidates stay in memory and are discarded).
import {el,clear,link} from '../../ui/components/dom.js';
import {createLocalizer,             } from '../localization/element-names.js';
import {createLabeler,            } from '../practice/form-question.js';
                                                                   
import {LAB_ACTION_FAMILIES,                    } from '../../domain/lab/action-catalog.js';
import {availableActions,createLabRuntime,createLabState,                                                                                       } from '../../domain/lab/lab-runtime.js';
                                                                                         
import {createLabDomain} from '../../domain/lab/lab-domain.js';

                                                                 

/** The flag is off or the activity has no profile: a notice and the way back to the unchanged runtime. */
export function renderDynamicLabUnavailable(root            ,page                         ,reason                        ){
  const t=createLabeler(createLocalizer(page.localization));
  clear(root);
  const shell=el('div',{className:'kl-shell kl-practice-workspace'});
  shell.append(el('h1',{text:page.title}),el('p',{className:'kl-notice',text:t.ui(reason==='flag-off'?'ui.dlab-flag-off':'ui.dlab-no-profile'),attrs:{role:'status'}}),link(t.ui('ui.dlab-open-classic'),`/practice/${page.id}`,'kl-button kl-button--primary'));
  root.append(shell);
}

                                                                                                             

export function renderDynamicLab(root            ,page                         ,profile                )                 {
  if(profile.activityId!==page.id) throw new Error('DYNAMIC_LAB_PROFILE_MISMATCH');
  const localize         =createLocalizer(page.localization);
  const t        =createLabeler(localize);
  const runtime=createLabRuntime(createLabDomain(page.chemistry       ));
  let state=createLabState(profile);
  let selected               =null;
  let pending               =null;
  let level              =profile.guidance.defaultLevel;
  let stage                                ='goal';

  const opt=(key       ,vars                              )=>{ const v=localize(key); return v===null?null:v.replace(/\{(\w+)\}/g,(_,k)=>String(vars?.[k]??'')); };
  const label=(key       )=>t.text(key,key.split('.').pop() );
  const familyName=(f       )=>t.ui(`ui.dlab-family-${f}`);
  const apparatusName=(id       )=>label(profile.apparatus.find(a=>a.id===id)?.labelKey??id);
  const substanceName=(id       )=>label(profile.substances.find(s=>s.id===id)?.labelKey??id);
  const targetName=(id       )=>label(profile.observationTargets.find(o=>o.id===id)?.labelKey??id);
  const objectName=(o          )=>o.kind==='apparatus'?apparatusName(o.id):o.kind==='substance'?substanceName(o.id):targetName(o.id);
  const actionText=(a          )=>{
    const p=a.params??{};
    const parts=[familyName(String(a.family))];
    if(p.apparatus) parts.push(apparatusName(String(p.apparatus)));
    if(p.substance) parts.push(substanceName(String(p.substance)));
    if(p.container) parts.push(apparatusName(String(p.container)));
    if(p.target) parts.push(targetName(String(p.target)));
    return parts.join(' — ');
  };
  // a procedure step is named by its action (several steps can come from one instruction sentence)
  const stepLabel=(stepId       )=>{ const s=profile.procedure.steps.find(x=>x.id===stepId); return s?actionText({family:s.family,params:s.match}):stepId; };

  clear(root);
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  const title=el('h1',{text:page.title,attrs:{tabindex:'-1'}});
  hi.append(link(t.ui('ui.dlab-open-classic'),`/practice/${page.id}`,'kl-back-link'),el('p',{className:'kl-kicker',text:t.ui('ui.dlab-kicker')}),title,el('p',{className:'kl-notice',text:t.ui('ui.dlab-not-saved')}));
  head.append(hi);
  const shell=el('div',{className:'kl-shell kl-practice-workspace kl-dlab',attrs:{'data-dynamic-lab':profile.profileId,'data-order-mode':profile.procedure.mode}});

  // the four stages: an ordered list of in-page links (not a carousel); the current one is marked
  const flow=el('nav',{className:'kl-dlab__flow',attrs:{'aria-label':t.ui('ui.dlab-flow')}});
  const flowList=el('ol');
  const stages=[['goal','ui.dlab-stage-goal'],['action','ui.dlab-stage-action'],['observe','ui.dlab-stage-observe'],['why','ui.dlab-stage-why']]         ;
  const flowLinks=new Map                          ();
  for(const [id,key] of stages){ const a=el('a',{text:t.ui(key),attrs:{href:`#dlab-${id}`}}); a.addEventListener('click',e=>{ e.preventDefault(); const target=root.querySelector             (`#dlab-${id}-title`); target?.focus(); }); flowLinks.set(id,a); const li=el('li'); li.append(a); flowList.append(li); }
  flow.append(flowList);
  const section=(id       ,key       )=>{ const s=el('section',{className:`kl-dlab__stage kl-dlab__stage--${id}`,attrs:{id:`dlab-${id}`,'aria-labelledby':`dlab-${id}-title`}}); s.append(el('h2',{text:t.ui(key),attrs:{id:`dlab-${id}-title`,tabindex:'-1'}})); return s; };

  // Maqsad: the goal, the instruction (its own sentences), the order rule and the safety notes
  const goal=section('goal','ui.dlab-stage-goal');
  goal.append(el('p',{className:'kl-unit-outcome',text:profile.instruction.goal}));
  const instruction=el('details',{className:'kl-dlab__instruction'}); instruction.append(el('summary',{text:t.ui('ui.dlab-instruction')}));
  const steps=el('ol'); for(const s of profile.instruction.steps) steps.append(el('li',{text:s.text})); instruction.append(steps);
  if(profile.instruction.equipmentText) instruction.append(el('p',{text:t.ui('ui.lab-equipment',{text:profile.instruction.equipmentText})}));
  if(profile.instruction.materialsText) instruction.append(el('p',{text:t.ui('ui.lab-materials',{text:profile.instruction.materialsText})}));
  goal.append(instruction,el('p',{className:'kl-dlab__order',text:t.ui(`ui.dlab-order-${profile.procedure.mode}`)}));
  for(const n of profile.safety.notes) goal.append(el('p',{className:'kl-notice kl-dlab__safety',text:t.ui('ui.lab-safety',{text:n.text})}));

  // Amal: object → action → parameters
  const action=section('action','ui.dlab-stage-action');
  const objectsBox=el('div',{className:'kl-dlab__objects'});
  const actionsBox=el('div',{className:'kl-dlab__actions',attrs:{'aria-live':'off'}});
  const paramsBox=el('div',{className:'kl-dlab__params'});
  const result=el('p',{className:'kl-feedback kl-dlab__result',attrs:{role:'status','aria-live':'polite','aria-atomic':'true',tabindex:'-1'}});
  const reset=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.dlab-reset'),attrs:{type:'button','data-dlab-reset':''}});
  action.append(objectsBox,actionsBox,paramsBox,result,reset);

  // Kuzatish: the observations (text, never colour alone) and the state
  const observe=section('observe','ui.dlab-stage-observe');
  const obsList=el('ol',{className:'kl-dlab__observations',attrs:{'aria-label':t.ui('ui.dlab-observations')}});
  const obsEmpty=el('p',{text:t.ui('ui.dlab-no-observations')});
  const stateBox=el('div',{className:'kl-dlab__state'});
  observe.append(obsEmpty,obsList,el('h3',{text:t.ui('ui.dlab-state')}),stateBox);

  // Nega?: where each observation comes from + guidance levels 1–4 (never the answer)
  const why=section('why','ui.dlab-stage-why');
  const sources=el('ul',{className:'kl-dlab__sources'});
  const guidanceFs=el('fieldset',{className:'kl-choice-group kl-dlab__guidance'}); guidanceFs.append(el('legend',{text:t.ui('ui.dlab-guidance')}));
  for(const l of profile.guidance.levels){
    const id=`dlab-guidance-${l}`; const input=el('input',{attrs:{type:'radio',name:'dlab-guidance',id,value:String(l)}}); if(l===level) input.checked=true;
    input.addEventListener('change',()=>{ level=l                 ; draw(); });
    const lab=el('label',{attrs:{for:id}}); lab.append(input,document.createTextNode(` ${t.ui(`ui.dlab-guidance-${l}`)}`)); guidanceFs.append(lab);
  }
  const guidanceOut=el('div',{className:'kl-dlab__guidance-text',attrs:{'aria-live':'polite'}});
  why.append(sources,guidanceFs,guidanceOut);

  shell.append(flow,goal,action,observe,why);
  root.append(head,shell);

  function categoryText(o             ){
    const base=t.ui(`ui.dlab-cat-${o.category}`);
    if(o.category==='procedural-dependency'&&o.blockedBy.length) return `${base}: ${o.blockedBy.map(stepLabel).join(', ')}`;
    if(o.category==='unavailable'||o.category==='unsupported'){ const r=o.code?opt(`ui.dlab-reason-${o.code}`):null; return r?`${base}: ${r}`:base; }
    return base;
  }

  function touches(o             ,ref          ){
    const p=o.action.params??{};
    if(ref.kind==='apparatus') return p.apparatus===ref.id||p.container===ref.id;
    if(ref.kind==='substance') return p.substance===ref.id;
    return p.target===ref.id;
  }

  function drawObjects(){
    clear(objectsBox);
    objectsBox.append(el('h3',{text:t.ui('ui.dlab-choose-object')}));
    const group=(key       ,refs            )=>{
      if(!refs.length) return;
      const g=el('div',{className:'kl-dlab__group',attrs:{role:'group','aria-label':t.ui(key)}});
      g.append(el('p',{className:'kl-dlab__group-title',text:t.ui(key),attrs:{'aria-hidden':'true'}}));
      for(const ref of refs){
        const b=el('button',{className:'kl-button kl-button--secondary kl-dlab__object',text:objectName(ref),attrs:{type:'button','aria-pressed':String(selected?.kind===ref.kind&&selected.id===ref.id),'data-object':`${ref.kind}:${ref.id}`}});
        b.addEventListener('click',()=>{ selected=ref; pending=null; draw(); actionsBox.querySelector             ('h3')?.focus(); });
        g.append(b);
      }
      objectsBox.append(g);
    };
    group('ui.dlab-group-apparatus',profile.apparatus.map(a=>({kind:'apparatus'         ,id:a.id})));
    group('ui.dlab-group-substances',profile.substances.map(s=>({kind:'substance'         ,id:s.id})));
    if(profile.allowedFamilies.includes('OBSERVE')) group('ui.dlab-group-targets',profile.observationTargets.map(o=>({kind:'target'         ,id:o.id})));
  }

  function drawActions(){
    clear(actionsBox);
    if(!selected){ actionsBox.append(el('p',{text:t.ui('ui.dlab-no-object')})); return; }
    actionsBox.append(el('h3',{text:t.ui('ui.dlab-choose-action',{object:objectName(selected)}),attrs:{tabindex:'-1'}}));
    // a container lists what can be done TO it; adding a substance starts from the substance (no 7× "add" list)
    const options=availableActions(state,profile).filter(o=>touches(o,selected )&&!(selected .kind==='apparatus'&&o.action.family==='ADD_SUBSTANCE'));
    // one entry per family for this object (ADD of a substance asks for the container in step 3)
    const seen=new Set        (); const list=el('ul',{className:'kl-dlab__action-list'});
    for(const o of options){
      const key=selected.kind==='substance'?String(o.action.family):JSON.stringify(o.action);
      if(seen.has(key)) continue; seen.add(key);
      const best=selected.kind==='substance'?pickBest(options.filter(x=>x.action.family===o.action.family)):o;
      const id=`dlab-act-${list.children.length}`;
      const b=el('button',{className:`kl-button ${best.category==='recommended'?'kl-button--primary':'kl-button--secondary'}`,text:selected.kind==='substance'?familyName(String(o.action.family)):actionText(o.action),attrs:{type:'button','aria-describedby':`${id}-cat`,'data-action-family':String(o.action.family),'data-category':best.category}});
      b.addEventListener('click',()=>choose(o.action));
      const li=el('li'); li.append(b,el('span',{className:'kl-dlab__category',text:categoryText(best),attrs:{id:`${id}-cat`}})); list.append(li);
    }
    actionsBox.append(list);
    // families the topic's instruction does not contain (for a container): offered so the learner hears WHY not
    if(selected.kind==='apparatus'&&profile.apparatus.find(a=>a.id===selected .id)?.isContainer){
      const others=LAB_ACTION_FAMILIES.filter(d=>!profile.allowedFamilies.includes(d.family)&&d.parameters.filter(p=>p.required).map(p=>p.name).join()==='container'&&localize(`ui.dlab-family-${d.family}`)!==null);
      if(others.length){
        const det=el('details',{className:'kl-dlab__other'}); det.append(el('summary',{text:t.ui('ui.dlab-other-actions')}));
        const ul=el('ul');
        for(const d of others){ const b=el('button',{className:'kl-button kl-button--secondary',text:familyName(d.family),attrs:{type:'button','data-action-family':d.family,'data-category':'not-in-topic'}}); b.addEventListener('click',()=>run({family:d.family,params:{container:selected .id}})); const li=el('li'); li.append(b); ul.append(li); }
        det.append(ul); actionsBox.append(det);
      }
    }
  }
  function pickBest(xs               ){ const rank=['recommended','possible','procedural-dependency','unavailable','unsupported']; return [...xs].sort((a,b)=>rank.indexOf(a.category)-rank.indexOf(b.category))[0] ; }

  function choose(a          ){
    const needsContainer=selected?.kind==='substance';
    const needsText=a.family==='RECORD';
    const limit=a.family==='ADD_SUBSTANCE'?profile.limits.quantities.find(q=>q.substanceId===a.params?.substance):undefined;
    if(!needsContainer&&!needsText&&!limit){ run(a); return; }
    pending=a; drawParams(limit); paramsBox.querySelector             ('select,input,textarea')?.focus();
  }

  function drawParams(limit                            ){
    clear(paramsBox);
    if(!pending) return;
    const a=pending;
    const form=el('form',{className:'kl-form',attrs:{novalidate:''}});
    form.append(el('h3',{text:t.ui('ui.dlab-configure',{action:familyName(String(a.family))})}));
    const alert=el('p',{className:'kl-field-error',attrs:{role:'alert',id:'dlab-param-error'}});
    let container                       =null, quantity                      =null, text                      =null;
    if(selected?.kind==='substance'){
      const f=el('div',{className:'kl-field'}); const id='dlab-param-container';
      container=el('select',{attrs:{id,required:'','aria-describedby':'dlab-param-error'}});
      container.append(el('option',{text:t.ui('ui.choose'),attrs:{value:''}}));
      for(const c of profile.apparatus.filter(x=>x.isContainer)) container.append(el('option',{text:apparatusName(c.id),attrs:{value:c.id}}));
      f.append(el('label',{text:t.ui('ui.dlab-container'),attrs:{for:id}}),container); form.append(f);
    }
    if(limit){
      const f=el('div',{className:'kl-field'}); const id='dlab-param-quantity';
      quantity=el('input',{attrs:{id,type:'number',inputmode:'decimal',min:'0',step:'any',value:String(limit.value),'aria-describedby':'dlab-param-error'}});
      f.append(el('label',{text:t.ui('ui.dlab-quantity',{unit:limit.unit,value:limit.value}),attrs:{for:id}}),quantity); form.append(f);
    }
    if(a.family==='RECORD'){
      const f=el('div',{className:'kl-field'}); const id='dlab-param-text';
      text=el('input',{attrs:{id,type:'text',autocomplete:'off',spellcheck:'false','aria-describedby':'dlab-param-error'}});
      f.append(el('label',{text:t.ui('ui.dlab-equation'),attrs:{for:id}}),text); form.append(f);
    }
    const row=el('div',{className:'kl-practice-controls'});
    const cancel=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.dlab-cancel'),attrs:{type:'button'}});
    cancel.addEventListener('click',()=>{ pending=null; drawParams(); actionsBox.querySelector             ('button')?.focus(); });
    row.append(el('button',{className:'kl-button kl-button--primary',text:t.ui('ui.dlab-do'),attrs:{type:'submit'}}),cancel);
    form.append(alert,row);
    form.addEventListener('submit',e=>{
      e.preventDefault();
      const params                             ={...(a.params??{})};
      if(container){ if(!container.value){ alert.textContent=t.ui('ui.dlab-param-required'); container.setAttribute('aria-invalid','true'); container.focus(); return; } params.container=container.value; }
      if(quantity){ const v=Number(quantity.value); if(!quantity.value||!Number.isFinite(v)){ alert.textContent=t.ui('ui.dlab-param-required'); quantity.setAttribute('aria-invalid','true'); quantity.focus(); return; } params.quantity=v; }
      if(text){ if(!text.value.trim()){ alert.textContent=t.ui('ui.dlab-param-required'); text.setAttribute('aria-invalid','true'); text.focus(); return; } params.text=text.value; }
      pending=null; run({family:a.family,params});
    });
    paramsBox.append(form);
  }

  function resultText(r                ,a          ){
    if(r.error){
      const base=t.ui(`ui.dlab-err-${r.error.code}`,{list:r.procedural.blockedBy.map(stepLabel).join(', ')});
      const detail=opt(`ui.dlab-reason-${r.error.detail}`);
      return detail?`${base} ${detail}`:base;
    }
    if(r.unsupported){ const detail=opt(`ui.dlab-reason-${r.unsupported.detail}`); const key=r.unsupported.code==='UNSUPPORTED_CHEMISTRY'?'ui.dlab-unsupported-chemistry':r.unsupported.code==='LEARNER_RESPONSE_CHECKER_MISSING'?'ui.dlab-unsupported-response':'ui.dlab-unsupported-action'; return `${t.ui(key)}${detail?` ${detail}`:''}`; }
    const parts=[t.ui('ui.dlab-accepted',{action:actionText(a)})];
    const consequence=opt(`ui.dlab-reason-${r.guidance.code}`); if(consequence) parts.push(consequence);
    for(const o of r.observations) parts.push(observationText(o));
    const eq=r.chemistryEvents.find(e=>e.type==='equation'); if(eq) parts.push(t.ui(eq.detail.correct?'ui.dlab-equation-correct':'ui.dlab-equation-incorrect'));
    if(r.procedural.completedStep){ const s=profile.procedure.steps.find(x=>x.id===r.procedural.completedStep); if(s?.instructionStep!==null&&s?.instructionStep!==undefined) parts.push(t.ui('ui.dlab-step-done',{n:s.instructionStep+1})); }
    if(r.nextState.complete&&!state.complete) parts.push(t.ui('ui.dlab-complete'));
    return parts.join(' ');
  }

  function run(a          ){
    const r=runtime.applyLabAction(state,a,profile);
    pending=null; clear(paramsBox);
    result.textContent=resultText(r,a);
    result.dataset.status=r.status;
    result.dataset.code=r.error?.code??r.unsupported?.code??r.guidance.code;
    state=r.nextState;
    if(r.status==='accepted') stage=r.observations.length?'observe':'action';
    draw();
    result.focus();
    return r;
  }

  function observationText(o               ){
    const d=(o.data??{})       ;
    const electrode=o.target==='cathode'||o.target==='anode'?targetName(o.target):'';
    let text       ;
    switch(o.kind){
      case 'precipitate': { const c=d.color?opt(`ui.dlab-color-${d.color}`):null; text=c?t.ui('ui.dlab-obs-precipitate-color',{color:c}):t.ui('ui.dlab-obs-precipitate'); break; }
      case 'gas': text=o.producedBy==='ElectrolysisModel'?t.ui('ui.dlab-obs-electrode-gas',{electrode,product:String(d.product)}):t.ui('ui.dlab-obs-gas'); break;
      case 'deposit': text=t.ui('ui.dlab-obs-deposit',{electrode,product:String(d.product)}); break;
      case 'color-change': text=t.ui('ui.dlab-obs-color-change'); break;
      case 'no-reaction': text=t.ui('ui.dlab-obs-no-reaction'); break;
      case 'dissolved': text=t.ui('ui.dlab-obs-dissolved',{formula:String(d.formula)}); break;
      case 'turbid-mixture': text=t.ui('ui.dlab-obs-turbid'); break;
      case 'clear-filtrate': text=t.ui('ui.dlab-obs-filtrate'); break;
      case 'state-change': text=o.target==='crystals'?t.ui('ui.dlab-obs-crystals'):t.ui('ui.dlab-obs-other'); break;
      default: text=t.ui('ui.dlab-obs-other');
    }
    const where=o.container?apparatusName(o.container):targetName(o.target);
    return t.ui('ui.dlab-obs-line',{target:where,text});
  }
  function sourceText(o               ){
    if(o.producedBy==='ReactionMatcher') return t.ui('ui.dlab-src-reaction',{id:o.source.split('#')[1]??''});
    if(o.producedBy==='ElectrolysisModel') return t.ui('ui.dlab-src-electrolysis',{query:o.source.split('#')[1]??''});
    if(o.producedBy==='IonicEngine') return t.ui('ui.dlab-src-solubility');
    const m=o.source.match(/steps\[(\d+)\]/);
    return `${t.ui('ui.dlab-src-instruction')}${m?`, ${t.ui('ui.dlab-step-n',{n:Number(m[1])+1})}`:''}. ${t.ui('ui.dlab-why-instruction-note')}`;
  }

  function drawObservations(){
    clear(obsList); clear(sources);
    obsEmpty.hidden=state.observations.length>0;
    for(const o of state.observations){
      obsList.append(el('li',{text:observationText(o),attrs:{'data-observation-kind':o.kind,'data-produced-by':o.producedBy,'data-grounding':o.grounding}}));
      sources.append(el('li',{text:`${observationText(o)} — ${t.ui('ui.dlab-why-source',{source:sourceText(o)})}`,attrs:{'data-grounding':o.grounding}}));
    }
  }

  function drawState(){
    clear(stateBox);
    stateBox.append(el('p',{text:t.ui('ui.dlab-state-setup',{list:state.setUp.length?state.setUp.map(apparatusName).join(', '):t.ui('ui.dlab-state-none')})}));
    const ul=el('ul');
    for(const c of profile.apparatus.filter(a=>a.isContainer)){
      const cs=state.containers[c.id] ;
      const items=cs.contents.map(e=>substanceName(e.substanceId)+(e.amount?` (${e.amount.value} ${e.amount.unit})`:''));
      const temp=cs.temperature.modeled?t.ui('ui.dlab-heated'):t.ui('ui.dlab-not-modeled');
      ul.append(el('li',{text:`${t.ui('ui.dlab-contents',{container:apparatusName(c.id),list:items.length?items.join(', '):t.ui('ui.dlab-state-empty')})}; ${t.ui('ui.dlab-temperature',{value:temp})}; ${t.ui('ui.dlab-ph',{value:t.ui('ui.dlab-not-modeled')})}`}));
    }
    stateBox.append(ul);
    if(state.current.on) stateBox.append(el('p',{text:t.ui('ui.dlab-current-on')}));
  }

  function drawGuidance(){
    clear(guidanceOut);
    const g=runtime.guidance(state,profile,level);
    const lines=[t.ui('ui.dlab-guidance-goal',{goal:g.goal})];
    if(level>=2) lines.push(t.ui('ui.dlab-guidance-possible',{list:g.possibleFamilies.map(familyName).join(', ')||t.ui('ui.dlab-state-none')}));
    if(level>=3) lines.push(g.recommended.length?t.ui(g.ordered?'ui.dlab-guidance-next':'ui.dlab-guidance-next-unordered',{list:g.recommended.map(r=>actionText(r.action)).join('; ')}):t.ui('ui.dlab-guidance-none'));
    if(level>=4){ for(const x of g.instructionText) lines.push(t.ui('ui.dlab-guidance-text',{text:x})); for(const b of g.blocked.slice(0,1)) lines.push(t.ui('ui.dlab-guidance-blocked',{step:stepLabel(b.step),list:b.blockedBy.map(stepLabel).join(', ')})); }
    lines.push(t.ui('ui.dlab-guidance-no-answer'));
    for(const l of lines) guidanceOut.append(el('p',{text:l}));
  }

  function draw(){
    for(const [id,a] of flowLinks){ if(id===stage) a.setAttribute('aria-current','step'); else a.removeAttribute('aria-current'); }
    shell.dataset.complete=String(state.complete);
    drawObjects(); drawActions(); drawObservations(); drawState(); drawGuidance();
  }

  reset.addEventListener('click',()=>{ state=runtime.reset(profile); selected=null; pending=null; stage='goal'; clear(paramsBox); draw(); result.textContent=t.ui('ui.dlab-reset-done'); result.dataset.status='reset'; result.dataset.code='RESET'; title.focus(); });
  draw();
  return {state:()=>state,apply:(a)=>run(a),reset:()=>reset.click()};
}
