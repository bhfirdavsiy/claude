// Atom-builder reference renderer (P1.4). Draws an AtomRendererModel and emits intents; chemistry, scoring,
// completion and persistence all happen behind the host (session → adapter → domain → orchestrator).
//
// Accessibility (declared in the catalog, checked by E2E): native buttons (keyboard), a text-state table (the
// non-visual alternative), an aria-live summary, text + shape for charge and goal (never colour only), and no
// motion at all (reducedMotion: 'static').
import type {PracticeCommand} from '../../features/practice/session.ts';
import type {Particle} from '../../domain/chemistry/atom.ts';
import {el,clear,setDisabled} from '../../ui/components/dom.ts';
import {ATOM_BUILDER_CAPABILITY} from '../catalog.ts';
import type {RendererHost,RendererImplementation,RendererInstance,RendererMountContext} from '../contract.ts';
import {toAtomRendererModel,NO_ELEMENT_YET_TEXT,type AtomRendererModel} from './renderer-model.ts';

const PARTICLE_LABELS:Readonly<Record<Particle,{title:string;singular:string}>>=Object.freeze({
  protons:{title:'Protonlar',singular:'proton'},
  neutrons:{title:'Neytronlar',singular:'neytron'},
  electrons:{title:'Elektronlar',singular:'elektron'},
});
const PARTICLE_ORDER:readonly Particle[]=['protons','neutrons','electrons'];

/** The only intent this renderer emits: the existing simulation command, one particle up or down. */
export function atomIntent(particle:Particle,delta:1|-1):PracticeCommand{
  return {kind:'simulation-action',action:{particle,delta}};
}

function mount(root:HTMLElement,host:RendererHost,context:RendererMountContext):RendererInstance{
  clear(root);
  const card=el('section',{className:'kl-card kl-atom',attrs:{'data-renderer':`${ATOM_BUILDER_CAPABILITY.id}@${ATOM_BUILDER_CAPABILITY.version}`,'aria-labelledby':'kl-atom-title'}});
  const title=el('h2',{text:'Atom konstruktori',attrs:{id:'kl-atom-title'}});
  const goal=el('p',{className:'kl-atom__goal'});
  const controls=el('div',{className:'kl-atom__controls',attrs:{role:'group','aria-label':'Zarrachalar soni'}});
  const counts:Partial<Record<Particle,HTMLElement>>={};
  const minus:Partial<Record<Particle,HTMLButtonElement>>={};
  // intents are applied strictly in order (fast keyboard repeats are queued, never dropped or interleaved)
  let queue:Promise<void>=Promise.resolve();
  // the host draws every engine result through update() (and fails closed if a draw throws)
  const send=(particle:Particle,delta:1|-1)=>{
    queue=queue.then(async()=>{
      try{ await host.dispatch(atomIntent(particle,delta)); }
      catch{ status.textContent='Amalni bajarib bo‘lmadi. Qaytadan urinib ko‘ring.'; }
    });
  };
  for(const particle of PARTICLE_ORDER){
    const l=PARTICLE_LABELS[particle];
    const row=el('div',{className:'kl-particle-row',attrs:{'data-particle':particle}});
    const name=el('span',{className:'kl-atom__particle',text:l.title,attrs:{id:`kl-atom-${particle}`}});
    const out=el('output',{className:'kl-atom__count',attrs:{'aria-labelledby':`kl-atom-${particle}`}});
    const dec=el('button',{className:'kl-button kl-button--secondary',text:'−',attrs:{type:'button','aria-label':`Bitta ${l.singular} ayirish`}});
    const inc=el('button',{className:'kl-button kl-button--secondary',text:'+',attrs:{type:'button','aria-label':`Bitta ${l.singular} qo‘shish`}});
    dec.addEventListener('click',()=>send(particle,-1));
    inc.addEventListener('click',()=>send(particle,1));
    row.append(name,dec,out,inc); controls.append(row);
    counts[particle]=out; minus[particle]=dec;
  }
  // non-visual alternative: the full state as text
  const table=el('table',{className:'kl-atom__state'});
  table.append(el('caption',{text:'Atom holati'}));
  const body=el('tbody');
  const cells:Record<string,HTMLElement>={};
  for(const [key,text] of [['element','Element'],['atomicNumber','Tartib raqami (Z)'],['massNumber','Massa soni (A)'],['charge','Zaryad'],['isotope','Izotop']] as const){
    const tr=el('tr'); tr.append(el('th',{text,attrs:{scope:'row'}})); const td=el('td',{attrs:{'data-field':key}}); tr.append(td); body.append(tr); cells[key]=td;
  }
  table.append(body);
  const goalState=el('p',{className:'kl-atom__goal-state',attrs:{'data-goal':'pending'}});
  const status=el('p',{className:'kl-atom__summary',attrs:{role:'status','aria-live':'polite','aria-atomic':'true'}});
  card.append(title,goal,controls,table,goalState,status);
  root.append(card);

  function update(result:unknown){
    // an input that is not an atom result throws: the host's error boundary then fails closed
    const m:AtomRendererModel=toAtomRendererModel(result,(symbol)=>context.localize?.(`element.${symbol}`)??symbol);
    goal.textContent=`Maqsad: ${m.goal.isotopeLabel} — ${m.goal.summary}`;
    for(const p of PARTICLE_ORDER){ counts[p]!.textContent=String(m[p]); setDisabled(minus[p]!,m[p]===0,()=>minus[p]!.nextElementSibling?.nextElementSibling as HTMLElement); } // P2.7: focus moves to the + button, never to <body>
    cells.element!.textContent=m.construction==='element'&&m.symbol?(m.elementName&&m.elementName!==m.symbol?`${m.symbol} — ${m.elementName}`:m.symbol):NO_ELEMENT_YET_TEXT;
    cells.atomicNumber!.textContent=String(m.atomicNumber);
    cells.massNumber!.textContent=String(m.massNumber);
    cells.charge!.textContent=`${m.chargeIcon} ${m.chargeLabel}`;
    cells.isotope!.textContent=m.isotopeLabel??'—';
    goalState.dataset.goal=m.goalReached?'reached':'pending';
    goalState.textContent=m.goalReached?'✓ Maqsadga yetildi: atom to‘g‘ri yig‘ildi.':'○ Maqsad hali bajarilmagan.';
    status.textContent=m.accessibleSummary;
    card.dataset.model=JSON.stringify(m);
  }
  return {update,destroy:()=>clear(root)};
}

export const atomBuilderRenderer:RendererImplementation=Object.freeze({capability:ATOM_BUILDER_CAPABILITY,mount});
