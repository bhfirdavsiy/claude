// P2.14 — «Reaksiya izlagich» (ADR-P2-015), behind reactionExplorerV1. The learner chooses canonical reagents (a
// native checkbox list, or a typed formula resolved through the canonical parser + SpeciesRegistry — an ambiguous
// formula asks which species) and states the conditions; the existing ReactionMatcher decides (explorer.ts). The page
// state lives in the URL (deep link, refresh, back). Nothing is dragged, colour is never the only signal, the result is
// announced in a polite live region and errors in an assertive one; focus moves to the result heading.
import {el,clear,link} from '../../ui/components/dom.js';
import {createLabeler} from '../practice/form-question.js';
                                                                                
                                                                                        
import {explore,explorerHref,MAX_REAGENTS,parseExplorerQuery,resolveFormulaInput,substanceHref,                    } from './explorer.js';
import {observationText,phaseText,requirementText,speciesLabel,elementText,                                                       } from './passport.js';

                                                                                                                       

let focusResultOnRender=false;
export function resetExplorerPageState(){ focusResultOnRender=false; }

export function renderReactionExplorer(root            ,data                 ,params                ,links                                              )     {
  const t=createLabeler(data.localize);
  const href=(p       )=>`${p}${links.query}`;
  const state=parseExplorerQuery(params,data.index);
  clear(root);
  const page=el('div',{className:'kl-knowledge-page',attrs:{'data-explorer-page':''}});
  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(el('p',{className:'kl-kicker',text:t.ui('ui.reactions-kicker')}),el('h1',{text:t.ui('ui.reactions-title'),attrs:{id:'kl-reactions-title',tabindex:'-1'}}),el('p',{className:'kl-unit-outcome',text:t.ui('ui.reactions-intro')}));
  head.append(hi);
  const body=el('div',{className:'kl-shell kl-section kl-knowledge'});
  if(state.rejected.length){
    const box=el('div',{className:'kl-notice',attrs:{role:'alert','data-explorer-rejected':''}});
    box.append(el('p',{text:t.ui('ui.reactions-link-invalid')}));
    body.append(box);
  }

  // ------------------------------------------------------------ the form (reagents + conditions)
  const form=el('form',{className:'kl-card kl-knowledge__form',attrs:{'aria-labelledby':'kl-reactions-form-title','data-explorer-form':'',novalidate:''}});
  form.append(el('h2',{text:t.ui('ui.reactions-choose'),attrs:{id:'kl-reactions-form-title'}}));
  const errors=el('div',{className:'kl-knowledge__errors',attrs:{role:'alert','aria-live':'assertive','data-explorer-errors':'',id:'kl-reactions-errors'}});
  const status=el('div',{className:'kl-knowledge__status',attrs:{role:'status','aria-live':'polite','data-explorer-status':''}});
  // typed formula → a canonical species (never guessed)
  const typed=el('div',{className:'kl-field kl-knowledge__typed'});
  const inputId='kl-reactions-formula';
  const input=el('input',{attrs:{id:inputId,type:'text',inputmode:'text',autocomplete:'off',spellcheck:'false',maxlength:'40','aria-describedby':'kl-reactions-formula-hint kl-reactions-errors'}});
  const addBtn=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.reactions-add'),attrs:{type:'button','data-explorer-add':''}});
  const typedRow=el('div',{className:'kl-knowledge__typed-row'}); typedRow.append(input,addBtn);
  typed.append(el('label',{text:t.ui('ui.reactions-formula-label'),attrs:{for:inputId}}),el('p',{className:'kl-field__hint',text:t.ui('ui.reactions-formula-hint'),attrs:{id:'kl-reactions-formula-hint'}}),typedRow);
  const choice=el('div',{className:'kl-knowledge__choice',attrs:{'data-explorer-ambiguous':''}});
  form.append(typed,choice,errors);
  // the canonical species list (identity shown with its phase, so two species with one formula stay distinct)
  const fs=el('fieldset',{className:'kl-knowledge__reagents',attrs:{'data-explorer-reagents':''}});
  fs.append(el('legend',{text:t.ui('ui.reactions-reagents',{max:MAX_REAGENTS})}));
  const list=el('ul',{className:'kl-knowledge__reagent-list'});
  const boxes=new Map                         ();
  const ordered=[...data.index.substances].map(s=>data.registry.byId(s.id) ).sort((a,b)=>a.formula.localeCompare(b.formula)||a.id.localeCompare(b.id));
  ordered.forEach((s,i)=>{
    const id=`kl-reagent-${i}`; const li=el('li',{className:'kl-knowledge__reagent'});
    // the checkbox sits inside its label: the whole 44px row is the target
    const c=el('input',{attrs:{type:'checkbox',id,name:'r',value:s.id,'data-species':s.id}}); c.checked=state.speciesIds.includes(s.id);
    const l=el('label',{attrs:{for:id}}); l.append(c,el('span',{text:t.ui('ui.reactions-reagent-label',{label:speciesLabel(s,data.localize),phase:phaseText(t,s.phase)})}));
    li.append(l);
    list.append(li); boxes.set(s.id,c);
  });
  fs.append(list);
  // conditions: only the condition vocabulary's dimensions and values; "not stated" is never assumed to be anything
  const cfs=el('fieldset',{className:'kl-knowledge__conditions',attrs:{'data-explorer-conditions':''}});
  cfs.append(el('legend',{text:t.ui('ui.reactions-conditions')}),el('p',{className:'kl-field__hint',text:t.ui('ui.reactions-conditions-hint')}));
  const selects=new Map                          ();
  for(const c of data.index.conditions){
    const f=el('div',{className:'kl-field'}); const id=`kl-condition-${c.dimension}`;
    const s=el('select',{attrs:{id,name:'c','data-dimension':c.dimension}});
    for(const [v,text] of [['',t.ui('ui.reactions-condition-unstated')]                   ,...c.values.map(v=>[v,t.ui(`ui.reactions-val-${c.dimension}-${v}`)]                   )]){ const o=el('option',{text,attrs:{value:v}}); if((state.stated[c.dimension]??'')===v) o.selected=true; s.append(o); }
    f.append(el('label',{text:t.ui(`ui.reactions-dim-${c.dimension}`),attrs:{for:id}}),s); cfs.append(f); selects.set(c.dimension,s);
  }
  const actions=el('div',{className:'kl-practice-controls'});
  actions.append(el('button',{className:'kl-button kl-button--primary',text:t.ui('ui.reactions-submit'),attrs:{type:'submit','data-explorer-submit':''}}),
    el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.reactions-reset'),attrs:{type:'button','data-explorer-reset':''}}));
  form.append(fs,cfs,actions,status);
  body.append(form);

  const showError=(key       ,vars                              )=>{ clear(errors); errors.append(el('p',{text:t.ui(key,vars)})); input.setAttribute('aria-invalid','true'); };
  const clearErrors=()=>{ clear(errors); input.removeAttribute('aria-invalid'); };
  const checkedIds=()=>[...boxes].filter(([,c])=>c.checked).map(([id])=>id);
  const select=(speciesId       )=>{
    const c=boxes.get(speciesId) ;
    if(!c.checked&&checkedIds().length>=MAX_REAGENTS){ showError('ui.reactions-too-many',{max:MAX_REAGENTS}); return; }
    c.checked=true; clearErrors(); input.value=''; clear(choice);
    status.textContent=t.ui('ui.reactions-added',{label:speciesLabel(data.registry.byId(speciesId) ,data.localize)});
  };
  addBtn.addEventListener('click',()=>{
    clear(choice);
    const r=resolveFormulaInput(data.registry,input.value);
    if(r.status==='INVALID'){ showError('ui.reactions-formula-invalid'); input.focus(); return; }
    if(r.status==='NOT_FOUND'){ showError('ui.reactions-formula-not-found'); input.focus(); return; }
    if(r.status==='FOUND'){ select(r.speciesId); input.focus(); return; }
    // several canonical species share this formula: the learner chooses (phase / charge / variant are identity)
    clearErrors();
    const g=el('fieldset'); g.append(el('legend',{text:t.ui('ui.reactions-ambiguous')}));
    r.speciesIds.forEach((id,i)=>{ const s=data.registry.byId(id) ; const b=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.reactions-reagent-label',{label:speciesLabel(s,data.localize),phase:phaseText(t,s.phase)}),attrs:{type:'button','data-ambiguous-choice':id}}); b.addEventListener('click',()=>{ select(id); boxes.get(id) .focus(); }); g.append(b); if(i===0) queueMicrotask(()=>b.focus()); });
    choice.append(g);
  });
  input.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); addBtn.click(); } });
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const ids=checkedIds();
    if(!ids.length){ showError('ui.reactions-none-selected'); boxes.get(ordered[0] .id) .focus(); return; }
    if(ids.length>MAX_REAGENTS){ showError('ui.reactions-too-many',{max:MAX_REAGENTS}); return; }
    const stated                      ={}; for(const [d,s] of selects) if(s.value) stated[d]=s.value;
    focusResultOnRender=true;
    links.navigate(explorerHref(ids,stated,links.query));
  });
  form.querySelector('[data-explorer-reset]') .addEventListener('click',()=>{ focusResultOnRender=false; links.navigate(explorerHref([],{},links.query)); });

  // ------------------------------------------------------------ the result (only what the matcher and the record give)
  const result=el('section',{className:'kl-card kl-knowledge__result',attrs:{'aria-labelledby':'kl-reactions-result-title','data-explorer-result':''}});
  if(state.speciesIds.length){
    const outcome=explore(data,state.speciesIds,state.stated);
    result.setAttribute('data-outcome',outcome.kind);
    result.append(el('h2',{text:t.ui('ui.reactions-result'),attrs:{id:'kl-reactions-result-title',tabindex:'-1'}}));
    result.append(el('p',{className:'kl-knowledge__asked',text:t.ui('ui.reactions-asked',{reagents:state.speciesIds.map(id=>data.registry.byId(id) .formula).join(' + '),conditions:requirementText(t,state.stated,'ui.reactions-condition-unstated-asked')})}));
    renderOutcome(result,outcome,data,t,links,href);
    status.textContent=announce(outcome,t);
    body.append(result);
  }
  page.append(head,body); root.append(page);
  if(focusResultOnRender&&state.speciesIds.length) root.querySelector             ('#kl-reactions-result-title')?.focus();
  focusResultOnRender=false;
}

function announce(o                ,t        )       {
  switch(o.kind){
    case 'MODELED_REACTION': return t.ui('ui.reactions-announce-reaction');
    case 'MODELED_NO_REACTION': return t.ui('ui.reactions-announce-no-reaction');
    case 'CONDITION_REQUIRED': case 'CONDITION_CHOICE_REQUIRED': return t.ui('ui.reactions-announce-condition');
    case 'NOT_MODELED': return t.ui('ui.reactions-not-modeled');
    default: return '';
  }
}

function renderOutcome(box            ,o                ,data                 ,t        ,links               ,href                   ){
  const p=(key       ,vars                              ,attrs                      ={})=>el('p',{text:t.ui(key,vars),attrs});
  if(o.kind==='NOT_MODELED'){
    // unknown ≠ no reaction
    box.append(p('ui.reactions-not-modeled',undefined,{'data-explorer-not-modeled':''}),p('ui.reactions-not-modeled-note'));
    return;
  }
  if(o.kind==='CONDITION_REQUIRED'||o.kind==='CONDITION_CHOICE_REQUIRED'){
    box.append(p(o.kind==='CONDITION_REQUIRED'?'ui.reactions-condition-required':'ui.reactions-condition-choice'));
    const ul=el('ul',{attrs:{'data-explorer-requirements':''}});
    for(const req of o.requirements){ const li=el('li',{text:requirementText(t,req)}); ul.append(li); }
    box.append(ul,p('ui.reactions-condition-retry'));
    return;
  }
  if(o.kind==='NO_REAGENTS') return;
  const r=data.reactions.get(o.reactionId) ;
  const k=data.index.reactions.find(x=>x.id===o.reactionId) ;
  if(o.kind==='MODELED_NO_REACTION'){
    box.append(p('ui.reactions-no-reaction',undefined,{'data-explorer-no-reaction':''}),p(k.review==='REVIEWED'?'ui.knowledge-reviewed-record':'ui.knowledge-model-record'));
    return;
  }
  const dl=el('dl',{className:'kl-element-profile__facts'});
  const row=(labelKey       ,field       ,value                   ,note        )=>{ const dd=el('dd',{attrs:{'data-field':field}}); if(typeof value==='string') dd.append(el('span',{text:value})); else dd.append(value); if(note) dd.append(el('span',{className:'kl-element-profile__note',text:note})); dl.append(el('dt',{text:t.ui(labelKey)}),dd); };
  row('ui.reactions-field-equation','equation',r.molecularEquation);
  row('ui.reactions-field-type','type',t.ui(`ui.reactions-type-${r.reactionType}`));
  row('ui.reactions-field-conditions','conditions',requirementText(t,k.requirements));
  if(k.observations.status==='MODEL'){ const ul=el('ul'); for(const ob of k.observations.value){ ul.append(el('li',{text:observationText(t,ob)})); } row('ui.reactions-field-observation','observation',ul); }
  else row('ui.reactions-field-observation','observation',t.ui('ui.reactions-observation-missing'));
  // products: each canonical species links to its passport; a participant without a single species stays its formula
  const prods=el('ul',{className:'kl-knowledge__inline-list'});
  r.products.forEach((ref,i)=>{ const id=k.participants.products[i]; const li=el('li'); const s=id?data.registry.byId(id):null; const text=s?speciesLabel(s,data.localize):ref.formula; li.append(s&&links.passport?link(text,substanceHref(s.id,links.query),'kl-text-link'):el('span',{text})); prods.append(li); });
  row('ui.reactions-field-products','products',prods);
  if(k.ionicEquation.status==='COMPUTED') row('ui.reactions-field-ionic','ionic',k.ionicEquation.value,t.ui('ui.reactions-ionic-note'));
  else row('ui.reactions-field-ionic','ionic',t.ui('ui.reactions-ionic-missing'));
  if(r.safety.length) row('ui.reactions-field-safety','safety',r.safety.map(x=>t.ui(`ui.reactions-safety-${x.replace(/\s+/g,'-')}`)).join('; '),t.ui('ui.reactions-safety-note'));
  box.append(dl,p(k.review==='REVIEWED'?'ui.knowledge-reviewed-record':'ui.knowledge-model-record',undefined,{'data-explorer-provenance':''}));
  // related labs / topics (explicit mappings only) and the elements of the reaction
  const rel=el('div',{className:'kl-knowledge__group'});
  const labs=k.relations.labs.map(l=>link(data.index.labs.find(x=>x.id===l.id) .title,`/practice/${l.id}`,'kl-text-link'));
  const topics=k.relations.topics.map(l=>{ const tp=data.index.topics.find(x=>x.id===l.id) ; return link(t.ui('ui.periodic-topic-item',{grade:tp.grade,title:tp.title}),`/learn/${tp.id}/guide`,'kl-text-link'); });
  const els=k.relations.elements.map(sym=>links.periodic?link(elementText(sym,data.localize),href(`/periodic/${sym}`),'kl-text-link'):el('span',{text:elementText(sym,data.localize)}));
  for(const [titleKey,items,attr] of [['ui.reactions-labs',labs,'data-explorer-labs'],['ui.reactions-topics',topics,'data-explorer-topics'],['ui.reactions-elements',els,'data-explorer-elements']]         ){
    rel.append(el('h3',{text:t.ui(titleKey)}));
    if(!items.length){ rel.append(p('ui.reactions-none-linked')); continue; }
    const ul=el('ul',{attrs:{[attr]:''}}); for(const i of items){ const li=el('li'); li.append(i); ul.append(li); } rel.append(ul);
  }
  box.append(rel);
}
