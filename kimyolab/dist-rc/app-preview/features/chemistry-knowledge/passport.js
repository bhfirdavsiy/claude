// P2.14 — «Modda pasporti» (ADR-P2-015), behind substancePassportV1. The page shows one canonical species
// (SpeciesRegistry identity) and the knowledge index's derived facts; it computes no chemistry and invents no value,
// name, ion or hazard. Every value says how it is known; a gap is a natural Uzbek sentence. Identifiers (species /
// reaction ids, engine names, provenance codes, hashes) never reach the learner. All text comes from the uz-Latn catalog.
import {el,clear,link} from '../../ui/components/dom.js';
                                                               
import {createLabeler} from '../practice/form-question.js';
                                                                                
                                                                            
                                                                                     
import {reactionExplorerHref,substanceHref} from './explorer.js';

                                    
                       
                           
                                               
                    
 
/** which sibling pages exist (their flags) and the flag query kept on every in-page link */
                                                                                                      
                                                     

// ------------------------------------------------------------------ shared learner wording (also used by the explorer)

export function speciesLabel(s        ,localize         )       { const n=localize(s.nameKey); return n?`${s.formula} — ${n}`:s.formula; }
export const phaseText=(t        ,phase       )=>t.ui(`ui.substance-phase-${phase}`);
export const chargeText=(t        ,charge       )=>charge===0?t.ui('ui.substance-charge-neutral'):charge>0?`+${charge}`:String(charge);
export function elementText(symbol       ,localize         ){ const n=localize(`element.${symbol}`); return n?`${n} (${symbol})`:symbol; }

/** An observation of a model record, as text (never colour alone). Only what the record states: a colour name only
 *  when the record gives one, a gas without a name (the record names none). */
export function observationText(t        ,o    )       {
  switch(o?.type){
    case 'precipitate': { const c=o.color?t.text(`ui.dlab-color-${o.color}`,''):''; return c?t.ui('ui.dlab-obs-precipitate-color',{color:c}):t.ui('ui.dlab-obs-precipitate'); }
    case 'gas': return t.ui('ui.dlab-obs-gas');
    case 'temperature-change': return o.direction==='up'?t.ui('ui.reactions-obs-heat-up'):o.direction==='down'?t.ui('ui.reactions-obs-heat-down'):t.ui('ui.dlab-obs-temperature-change');
    case 'no-visible-change': return t.ui('ui.dlab-obs-no-visible-change');
    case 'color-change': return o.to&&o.to!=='changed'?t.ui('ui.reactions-obs-color-to',{color:t.text(`ui.dlab-color-${o.to}`,'')||t.ui('ui.dlab-obs-color-change')}):t.ui('ui.dlab-obs-color-change');
    default: return t.ui('ui.dlab-obs-other');
  }
}
/** the condition a record requires, in words (condition vocabulary dimension + value) */
export const conditionText=(t        ,dimension       ,value       )=>t.ui('ui.reactions-condition-item',{dimension:t.ui(`ui.reactions-dim-${dimension}`),value:t.ui(`ui.reactions-val-${dimension}-${value}`)});
/** conditions in words; `emptyKey` says what no condition means here (a record that requires none / nothing stated) */
export const requirementText=(t        ,req                      ,emptyKey='ui.reactions-condition-none')=>Object.keys(req).length?Object.entries(req).sort(([a],[b])=>a.localeCompare(b)).map(([d,v])=>conditionText(t,d,v)).join('; '):t.ui(emptyKey);

/** a model note: the value is the KimyoLab model's own data, not an expert-approved fact */
const MODEL_NOTE='ui.knowledge-model-note';

let lastFocusKey            =null;

export function renderSubstancePassport(root            ,data                  ,key       ,links               )     {
  const t=createLabeler(data.localize);
  const href=(p       )=>`${p}${links.query}`;
  clear(root);
  const page=el('div',{className:'kl-knowledge-page',attrs:{'data-substance-page':''}});
  const sub=data.index.substances.find(s=>s.key===key)??null;
  const species=sub?data.registry.byId(sub.id)??null:null;

  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  const body=el('div',{className:'kl-shell kl-section kl-knowledge'});
  hi.append(el('p',{className:'kl-kicker',text:t.ui('ui.substance-kicker')}));
  if(!sub||!species){
    hi.append(el('h1',{text:t.ui('ui.substance-title'),attrs:{id:'kl-substance-title',tabindex:'-1'}}));
    const box=el('div',{className:'kl-notice',attrs:{role:'alert','data-substance-not-found':''}});
    box.append(el('p',{text:t.ui('ui.substance-not-found')}));
    body.append(box);
    head.append(hi); page.append(head,body); root.append(page); return;
  }
  const name=data.localize(species.nameKey);
  hi.append(el('h1',{text:name?`${name} (${species.formula})`:species.formula,attrs:{id:'kl-substance-title',tabindex:'-1'}}),el('p',{className:'kl-unit-outcome',text:t.ui('ui.substance-intro')}));
  head.append(hi);

  // ------------------------------------------------------------ facts (each with how it is known)
  const facts=el('section',{className:'kl-card kl-knowledge__facts',attrs:{'aria-labelledby':'kl-substance-facts'}});
  facts.append(el('h2',{text:t.ui('ui.substance-facts'),attrs:{id:'kl-substance-facts'}}));
  const dl=el('dl',{className:'kl-element-profile__facts'});
  const row=(labelKey       ,field       ,value                   ,note        )=>{
    const dd=el('dd',{attrs:{'data-field':field}});
    if(typeof value==='string') dd.append(el('span',{text:value})); else dd.append(value);
    if(note) dd.append(el('span',{className:'kl-element-profile__note',text:note}));
    dl.append(el('dt',{text:t.ui(labelKey)}),dd);
  };
  const gapText=(f                        ,specific                                )=>(f.status==='GAP'?specific?.[f.reason]:undefined)??t.ui('ui.periodic-missing');
  row('ui.substance-field-name','name',name??species.formula,name?t.ui('ui.substance-name-review'):t.ui('ui.substance-name-missing'));
  row('ui.substance-field-formula','formula',species.formula);
  row('ui.substance-field-phase','phase',phaseText(t,species.phase),t.ui(MODEL_NOTE));
  row('ui.substance-field-charge','charge',chargeText(t,species.charge),t.ui(MODEL_NOTE));
  // composition: the canonical formula parser; each element links to its profile when the periodic table is on
  if(sub.composition.status==='DERIVED'){
    const ul=el('ul',{className:'kl-knowledge__inline-list'});
    for(const [sym,count] of Object.entries(sub.composition.value)){
      const li=el('li'); const text=t.ui('ui.substance-atom-count',{element:elementText(sym,data.localize),n:count});
      li.append(links.periodic?link(text,href(`/periodic/${sym}`),'kl-text-link'):el('span',{text})); ul.append(li);
    }
    row('ui.substance-field-composition','composition',ul,t.ui('ui.substance-derived-note'));
  } else row('ui.substance-field-composition','composition',gapText(sub.composition,{FORMULA_NOT_PARSEABLE:t.ui('ui.substance-formula-not-parseable')}));
  if(sub.molarMass.status==='COMPUTED') row('ui.substance-field-molar-mass','molar-mass',t.ui('ui.substance-molar-mass-value',{value:sub.molarMass.value}),t.ui('ui.substance-molar-mass-note'));
  else if(sub.molarMass.status==='GAP') row('ui.substance-field-molar-mass','molar-mass',gapText(sub.molarMass,{ATOMIC_MASS_NOT_REVIEWED:t.ui('ui.substance-molar-mass-missing'),FORMULA_NOT_PARSEABLE:t.ui('ui.substance-formula-not-parseable')}));
  if(sub.dissociation.status==='MODEL') row('ui.substance-field-ions','ions',sub.dissociation.value.map(i=>i.coefficient>1?`${i.coefficient} ${i.formula}`:i.formula).join(' + '),t.ui(MODEL_NOTE));
  else if(sub.dissociation.status==='GAP') row('ui.substance-field-ions','ions',t.ui('ui.substance-ions-not-modeled'));
  // properties / hazards reach the learner only as reviewed facts (an eligible source + a human decision)
  const reviewedNote=(f                        )=>f.status==='REVIEWED'?t.ui('ui.periodic-reviewed-note',{sources:f.sources.map(x=>x.title).join('; ')}):undefined;
  if(sub.properties.status==='REVIEWED') row('ui.substance-field-properties','properties',Object.entries(sub.properties.value).map(([k,v])=>`${k}: ${v}`).join('; '),reviewedNote(sub.properties));
  else row('ui.substance-field-properties','properties',t.ui('ui.periodic-missing'));
  if(sub.hazards.status==='REVIEWED') row('ui.substance-field-hazards','hazards',sub.hazards.value.map(h=>t.text(`ui.substance-hazard-${h}`,h)).join(', '),reviewedNote(sub.hazards));
  else row('ui.substance-field-hazards','hazards',t.ui('ui.substance-hazards-missing'));
  facts.append(dl);
  body.append(facts);

  // ------------------------------------------------------------ relations (one canonical graph)
  body.append(renderRelations(t,data,sub,links,href));

  page.append(head,body); root.append(page);
  // a newly opened passport takes the focus to its heading (deep link, search result, element profile link)
  if(lastFocusKey!==key) root.querySelector             ('#kl-substance-title')?.focus();
  lastFocusKey=key;
}
export function resetSubstancePageState(){ lastFocusKey=null; }

function renderRelations(t        ,data                  ,sub                   ,links               ,href                   )            {
  const wrap=el('div',{className:'kl-knowledge__relations'});
  const group=(id       ,titleKey       ,whyKey       ,items              ,attr       ,emptyKey        )=>{
    const s=el('section',{className:'kl-card kl-knowledge__group',attrs:{'aria-labelledby':id,[attr]:''}});
    s.append(el('h2',{text:t.ui(titleKey),attrs:{id}}));
    if(!items.length){ if(emptyKey) s.append(el('p',{text:t.ui(emptyKey)})); wrap.append(s); return; }
    s.append(el('p',{className:'kl-field__hint',text:t.ui(whyKey)}));
    const ul=el('ul'); for(const i of items){ const li=el('li'); li.append(i); ul.append(li); } s.append(ul); wrap.append(s);
  };
  // reactions: the record's equation; the explorer link runs the matcher with the record's own reactants + conditions
  group('kl-substance-reactions','ui.substance-reactions','ui.substance-reactions-why',sub.relations.reactions.map(id=>{
    const r=data.reactions.get(id) ; const box=el('span',{className:'kl-knowledge__reaction'});
    box.append(el('span',{text:r.molecularEquation}));
    const h=links.explorer?reactionExplorerHref(data.index,id,links.query):null;
    if(h){ box.append(document.createTextNode(' ')); box.append(link(t.ui('ui.substance-open-explorer'),h,'kl-text-link')); }
    return box;
  }),'data-substance-reactions','ui.substance-reactions-none');
  group('kl-substance-elements','ui.substance-elements','ui.substance-elements-why',sub.relations.elements.map(sym=>links.periodic?link(elementText(sym,data.localize),href(`/periodic/${sym}`),'kl-text-link'):el('span',{text:elementText(sym,data.localize)})),'data-substance-elements','ui.substance-elements-none');
  const topic=(id       )=>data.index.topics.find(x=>x.id===id) ;
  group('kl-substance-topics','ui.substance-topics','ui.substance-topics-why',sub.relations.topics.map(r=>{ const tp=topic(r.id); return link(t.ui('ui.periodic-topic-item',{grade:tp.grade,title:tp.title}),`/learn/${tp.id}/guide`,'kl-text-link'); }),'data-substance-topics','ui.substance-topics-none');
  group('kl-substance-labs','ui.substance-labs','ui.substance-labs-why',sub.relations.labs.map(r=>link(data.index.labs.find(x=>x.id===r.id) .title,`/practice/${r.id}`,'kl-text-link')),'data-substance-labs','ui.substance-labs-none');
  return wrap;
}

export {substanceHref};
