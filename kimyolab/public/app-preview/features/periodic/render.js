// P2.13 — «Davriy jadval» and the Element profile (ADR-P2-014), behind periodicTableV1. The page draws the Element Hub
// the content build derived from canonical sources; it computes no chemistry and invents no value or name. Every cell
// is a real link (/periodic/<symbol>) so the profile has a deep link and is reachable by keyboard; the profile is a
// non-modal dialog region that Escape closes, returning focus to the element's cell. Category is never shown by
// colour alone (there is no category colour while no category is sourced). All text comes from the uz-Latn catalog.
import {el,clear,link} from '../../ui/components/dom.js';
                                                               
import {createLabeler} from '../practice/form-question.js';
                                                             
import {availableCategories,availableGrades,elementBySymbol,isFiltered,matchesFilters,NO_FILTERS,                    } from './model.js';

                                      
                    
                                                                                      
                       
                                                                                               
               
                                  
 

// page memory only (never persisted): the filters and the large view survive opening a profile, and the cell that
// opened the profile gets the focus back when it closes
let filters                ={...NO_FILTERS};
let projector=false;
let lastSelected            =null;
export function resetPeriodicPageState(){ filters={...NO_FILTERS}; projector=false; lastSelected=null; }

const sign=(n       )=>n>0?`+${n}`:String(n);

export function renderPeriodicTable(root            ,hub           ,opts                    )     {
  const t=createLabeler(opts.localize);
  const nameOf=(symbol       )=>opts.localize(`element.${symbol}`);
  const href=(path       )=>`${path}${opts.query}`;
  clear(root);
  const page=el('div',{className:`kl-periodic-page${projector?' kl-periodic-page--projector':''}`,attrs:{'data-periodic-page':''}});

  const head=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(el('p',{className:'kl-kicker',text:t.ui('ui.periodic-kicker')}),el('h1',{text:t.ui('ui.periodic-title'),attrs:{id:'kl-periodic-title'}}),el('p',{className:'kl-unit-outcome',text:t.ui('ui.periodic-intro')}));
  head.append(hi);
  const body=el('div',{className:'kl-shell kl-section kl-periodic'});

  // ------------------------------------------------------------ profile (deep link)
  const selected=opts.selected?elementBySymbol(hub,opts.selected):null;
  if(opts.selected&&!selected){
    const box=el('div',{className:'kl-notice',attrs:{role:'alert','data-periodic-not-found':''}});
    box.append(el('p',{text:t.ui('ui.periodic-not-found')}));
    body.append(box);
  }
  if(selected) body.append(renderProfile(hub,selected,t,nameOf,href,opts));

  // ------------------------------------------------------------ filters
  const form=el('form',{className:'kl-periodic__filters',attrs:{'aria-labelledby':'kl-periodic-filters-title','data-periodic-filters':''}});
  form.append(el('h2',{text:t.ui('ui.periodic-filters'),attrs:{id:'kl-periodic-filters-title'}}));
  const row=el('div',{className:'kl-periodic__filter-row'});
  const select=(id       ,label       ,options                       ,value       ,disabled=false)=>{
    const f=el('div',{className:'kl-field'}); const s=el('select',{attrs:{id,name:id}});
    for(const [v,text] of [['',t.ui('ui.periodic-filter-any')]                   ,...options]){ const o=el('option',{text,attrs:{value:v}}); if(v===value) o.selected=true; s.append(o); }
    if(disabled) s.disabled=true;
    f.append(el('label',{text:label,attrs:{for:id}}),s); row.append(f); return s;
  };
  const range=(n       )=>Array.from({length:n},(_,i)=>[String(i+1),String(i+1)]                   );
  const categories=availableCategories(hub);
  const gSel=select('kl-periodic-group',t.ui('ui.periodic-filter-group'),range(18),filters.group===null?'':String(filters.group));
  const pSel=select('kl-periodic-period',t.ui('ui.periodic-filter-period'),range(7),filters.period===null?'':String(filters.period));
  const cSel=select('kl-periodic-category',t.ui('ui.periodic-filter-category'),categories.map(c=>[c,c]                   ),filters.category??'',!categories.length);
  if(!categories.length){ cSel.setAttribute('aria-describedby','kl-periodic-category-note'); }
  const yrSel=select('kl-periodic-grade',t.ui('ui.periodic-filter-grade'),availableGrades(hub).map(g=>[String(g),t.ui('ui.periodic-filter-grade-option',{grade:g})]                   ),filters.grade===null?'':String(filters.grade));
  const check=(id       ,label       ,value        )=>{ const l=el('label',{className:'kl-periodic__check',attrs:{for:id}}); const c=el('input',{attrs:{type:'checkbox',id,name:id}}); c.checked=value; l.append(c,document.createTextNode(` ${label}`)); row.append(l); return c; };
  const topicChk=check('kl-periodic-has-topic',t.ui('ui.periodic-filter-has-topic'),filters.hasTopic);
  const labChk=check('kl-periodic-has-lab',t.ui('ui.periodic-filter-has-lab'),filters.hasLab);
  form.append(row);
  if(!categories.length) form.append(el('p',{className:'kl-field__hint',text:t.ui('ui.periodic-filter-category-empty'),attrs:{id:'kl-periodic-category-note'}}));
  const actions=el('div',{className:'kl-practice-controls'});
  const reset=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.periodic-filter-reset'),attrs:{type:'button','data-periodic-reset':''}});
  const big=el('button',{className:'kl-button kl-button--secondary',text:t.ui('ui.periodic-projector'),attrs:{type:'button','aria-pressed':String(projector),'data-periodic-projector':''}});
  actions.append(reset,big); form.append(actions);
  const status=el('div',{className:'kl-periodic__status',attrs:{role:'status','aria-live':'polite','data-periodic-status':''}});
  body.append(form,status);

  // ------------------------------------------------------------ the table
  const region=el('section',{className:'kl-periodic__table-wrap',attrs:{'aria-label':t.ui('ui.periodic-table-label')}});
  const list=el('ol',{className:'kl-ptable',attrs:{'data-periodic-table':''}});
  const cells=new Map                          ();
  for(const e of hub.elements){
    const name=nameOf(e.symbol);
    const li=el('li',{className:'kl-ptable__item'});
    li.style.setProperty('--kl-row',String(e.display.row)); li.style.setProperty('--kl-col',String(e.display.column));
    const a=link('',href(`/periodic/${e.symbol}`),'kl-ptable__cell')                     ;
    a.setAttribute('data-symbol',e.symbol);
    a.setAttribute('aria-label',name?t.ui('ui.periodic-cell-label',{name,symbol:e.symbol,z:e.z}):t.ui('ui.periodic-cell-label-unnamed',{symbol:e.symbol,z:e.z}));
    if(selected?.symbol===e.symbol) a.setAttribute('aria-current','true');
    a.append(el('span',{className:'kl-ptable__z',text:String(e.z),attrs:{'aria-hidden':'true'}}),el('span',{className:'kl-ptable__symbol',text:e.symbol,attrs:{'aria-hidden':'true'}}),el('span',{className:'kl-ptable__name',text:name??'',attrs:{'aria-hidden':'true'}}));
    li.append(a); list.append(li); cells.set(e.symbol,a);
  }
  // where the two f-block rows belong in the main table (display only; the period of those elements is unchanged)
  for(const [row,from,to] of [[6,57,71],[7,89,103]]         ){
    const li=el('li',{className:'kl-ptable__item kl-ptable__item--placeholder',attrs:{'aria-hidden':'true'}});
    li.style.setProperty('--kl-row',String(row)); li.style.setProperty('--kl-col','3');
    li.append(el('span',{className:'kl-ptable__placeholder',text:t.ui('ui.periodic-f-placeholder',{from,to})}));
    list.append(li);
  }
  region.append(list,el('p',{className:'kl-field__hint',text:t.ui('ui.periodic-f-rows')}));
  const matchList=el('div',{className:'kl-periodic__matches',attrs:{'data-periodic-matches':''}});
  body.append(region,matchList);

  // ------------------------------------------------------------ filtering (visual dimming + a text list, never colour alone)
  const apply=()=>{
    const active=isFiltered(filters);
    const matching=hub.elements.filter(e=>matchesFilters(hub,e,filters));
    for(const e of hub.elements){ const c=cells.get(e.symbol) ; const m=!active||matching.includes(e); c.classList.toggle('kl-ptable__cell--dim',!m); c.toggleAttribute('data-match',active&&m); }
    clear(matchList); status.textContent='';
    if(!active) return;
    status.textContent=matching.length?t.ui('ui.periodic-match-count',{n:matching.length}):t.ui('ui.periodic-match-none');
    if(matching.length){
      matchList.append(el('h2',{text:t.ui('ui.periodic-match-list'),attrs:{id:'kl-periodic-matches-title'}}));
      const ul=el('ul',{className:'kl-periodic__match-list',attrs:{'aria-labelledby':'kl-periodic-matches-title'}});
      for(const e of matching){ const li=el('li'); const name=nameOf(e.symbol); li.append(link(name?`${e.z}. ${name} (${e.symbol})`:`${e.z}. ${e.symbol}`,href(`/periodic/${e.symbol}`),'kl-text-link')); ul.append(li); }
      matchList.append(ul);
    }
  };
  const num=(v       )=>v===''?null:Number(v);
  const read=()=>{ filters={group:num(gSel.value),period:num(pSel.value),category:cSel.value||null,grade:num(yrSel.value),hasTopic:topicChk.checked,hasLab:labChk.checked}; apply(); };
  for(const c of [gSel,pSel,cSel,yrSel,topicChk,labChk]) c.addEventListener('change',read);
  form.addEventListener('submit',e=>{ e.preventDefault(); read(); });
  reset.addEventListener('click',()=>{ filters={...NO_FILTERS}; gSel.value=''; pSel.value=''; cSel.value=''; yrSel.value=''; topicChk.checked=false; labChk.checked=false; apply(); gSel.focus(); });
  big.addEventListener('click',()=>{ projector=!projector; page.classList.toggle('kl-periodic-page--projector',projector); big.setAttribute('aria-pressed',String(projector)); });

  page.append(head,body); root.append(page);
  apply();

  // ------------------------------------------------------------ focus: profile opened → its heading; closed → the cell
  if(selected) root.querySelector             ('#kl-element-title')?.focus();
  else if(lastSelected&&cells.has(lastSelected)) cells.get(lastSelected) .focus();
  lastSelected=selected?.symbol??null;
}

function renderProfile(hub           ,e           ,t                                 ,nameOf                        ,href                   ,opts                    )            {
  const name=nameOf(e.symbol);
  const close=href('/periodic');
  const panel=el('section',{className:'kl-card kl-element-profile',attrs:{role:'dialog','aria-modal':'false','aria-labelledby':'kl-element-title','aria-describedby':'kl-element-close-hint','data-element-profile':e.symbol}});
  panel.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ ev.preventDefault(); opts.navigate(close); } });
  const top=el('div',{className:'kl-element-profile__head'});
  top.append(el('p',{className:'kl-kicker',text:t.ui('ui.periodic-profile')}),el('h2',{text:name?`${name} (${e.symbol})`:e.symbol,attrs:{id:'kl-element-title',tabindex:'-1'}}));
  const closeLink=link(t.ui('ui.periodic-close'),close,'kl-button kl-button--secondary');
  closeLink.setAttribute('data-element-close','');
  top.append(closeLink);
  panel.append(top,el('p',{className:'kl-field__hint',text:t.ui('ui.periodic-close-hint'),attrs:{id:'kl-element-close-hint'}}));

  const dl=el('dl',{className:'kl-element-profile__facts'});
  const row=(key       ,value       ,note        ,field        )=>{
    const dd=el('dd',{attrs:field?{'data-field':field}:{}}); dd.append(el('span',{text:value}));
    if(note) dd.append(el('span',{className:'kl-element-profile__note',text:note}));
    dl.append(el('dt',{text:t.ui(key)}),dd);
  };
  const missing=t.ui('ui.periodic-missing');
  const show=    (key       ,f            ,format              ,field       ,gapText                                )=>{
    if(f.status==='GAP'){ row(key,gapText?.[f.reason]??missing,undefined,field); return; }
    const note=f.status==='SOURCED'?t.ui('ui.periodic-sourced-note',{sources:f.sourceRefs.map(s=>s.title).join('; ')}):f.provenance==='ENGINE_COMPUTED'?t.ui('ui.periodic-computed-note'):t.ui('ui.periodic-derived-note');
    row(key,format(f.value),note,field);
  };
  row('ui.periodic-field-name',name??e.symbol,name?undefined:t.ui('ui.periodic-name-missing'),'name');
  row('ui.periodic-field-symbol',e.symbol,undefined,'symbol');
  row('ui.periodic-field-z',String(e.z),undefined,'z');
  show('ui.periodic-field-mass',e.relativeAtomicMass,v=>String(v),'mass');
  show('ui.periodic-field-group',e.group,v=>String(v),'group',{F_BLOCK_GROUP_CONVENTION:t.ui('ui.periodic-group-f-block')});
  show('ui.periodic-field-period',e.period,v=>String(v),'period');
  show('ui.periodic-field-category',e.category,v=>v,'category');
  show('ui.periodic-field-config',e.electronConfiguration,v=>v,'config',{OUTSIDE_ENGINE_RANGE:t.ui('ui.periodic-config-outside'),ENGINE_KNOWN_GAP:t.ui('ui.periodic-config-known-gap')});
  show('ui.periodic-field-oxidation',e.oxidationStates,v=>v.map(sign).join(', '),'oxidation');
  show('ui.periodic-field-description',e.teachingDescription,v=>v,'description');
  panel.append(dl);

  // ------------------------------------------------------------ evidence-backed links
  const links=el('section',{className:'kl-element-profile__links',attrs:{'aria-labelledby':'kl-element-links-title'}});
  links.append(el('h3',{text:t.ui('ui.periodic-links'),attrs:{id:'kl-element-links-title'}}));
  const r=e.relations;
  if(!r.substances.length&&!r.reactions.length&&!r.topics.length&&!r.labs.length) links.append(el('p',{text:t.ui('ui.periodic-relations-none')}));
  const group=(titleKey       ,whyKey       ,items              ,attr       )=>{
    if(!items.length) return;
    const s=el('div',{className:'kl-element-profile__group',attrs:{[attr]:''}});
    s.append(el('h4',{text:t.ui(titleKey)}),el('p',{className:'kl-field__hint',text:t.ui(whyKey)}));
    const ul=el('ul'); for(const i of items){ const li=el('li'); li.append(i); ul.append(li); } s.append(ul); links.append(s);
  };
  const byId=                       (xs    ,id       )=>xs.find(x=>x.id===id);
  group('ui.periodic-substances','ui.periodic-substances-why',r.substances.map(x=>{ const s=byId(hub.substances,x.id) ; const n=opts.localize(s.nameKey); return el('span',{text:n?`${s.formula} — ${n}`:s.formula}); }),'data-element-substances');
  group('ui.periodic-reactions','ui.periodic-reactions-why',r.reactions.map(x=>el('span',{text:byId(hub.reactions,x.id) .equation})),'data-element-reactions');
  group('ui.periodic-topics','ui.periodic-topics-why',r.topics.map(x=>{ const tp=byId(hub.topics,x.id) ; return link(t.ui('ui.periodic-topic-item',{grade:tp.grade,title:tp.title}),`/learn/${tp.id}/guide`,'kl-text-link'); }),'data-element-topics');
  group('ui.periodic-labs','ui.periodic-labs-why',r.labs.map(x=>link(byId(hub.labs,x.id) .title,`/practice/${x.id}`,'kl-text-link')),'data-element-labs');
  panel.append(links);
  return panel;
}
