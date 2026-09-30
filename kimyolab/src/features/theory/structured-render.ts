// P2.3 — reusable structured theory renderer. Semantic sections with a heading hierarchy (h3 under the stage's h2),
// text labels (never colour alone), lazy media through the host asset path, sources and the review state. It renders
// authored text as given and computes nothing; the MINIMAL legacy blocks keep their own renderer in the guide.
import {el} from '../../ui/components/dom.ts';
import {assetUrl} from '../../ui/host-paths.ts';
import type {StructuredTheoryView} from './view.ts';

const T={explanation:'Tushuntirish',examples:'Ishlangan misollar',example:(n:number)=>`${n}-misol`,problem:'Masala',steps:'Yechim',answer:'Javob',
  misconceptions:'Keng tarqalgan xato tushunchalar',wrong:'Xato fikr',right:'To‘g‘risi',summary:'Xulosa',sources:'Manbalar',source:'Manba',
  review:{REVIEW_PENDING:'Bu nazariya mutaxassislar tekshiruvida.',DRAFT:'Bu nazariya hali tayyorlanmoqda.',CHANGES_REQUESTED:'Bu nazariya mutaxassislar izohi bo‘yicha qayta ishlanmoqda.'}};

function sources(list:string[]){ return el('p',{className:'kl-theory__source',text:`${T.source}: ${list.join('; ')}`}); }
function section(prefix:string,id:string,title:string){
  const s=el('section',{className:`kl-theory__section kl-theory__section--${id}`,attrs:{'aria-labelledby':`${prefix}-${id}`}});
  s.append(el('h3',{text:title,attrs:{id:`${prefix}-${id}`}})); return s;
}

export function renderStructuredTheory(view:StructuredTheoryView,prefix='kl-theory'):HTMLElement{
  const root=el('div',{className:'kl-theory',attrs:{'data-theory-depth':'STRUCTURED'}});
  if(view.reviewState!=='APPROVED') root.append(el('p',{className:'kl-theory__review',text:T.review[view.reviewState],attrs:{role:'note'}}));
  const expl=section(prefix,'explanation',T.explanation);
  for(const para of view.explanation.text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean)) expl.append(el('p',{text:para}));
  expl.append(sources(view.explanation.sources));
  for(const m of view.media){
    const fig=el('figure',{className:'kl-theory__figure'});
    fig.append(el('img',{attrs:{src:assetUrl(m.src),alt:m.alt,loading:'lazy',decoding:'async'}}));
    if(m.caption) fig.append(el('figcaption',{text:m.caption}));
    expl.append(fig);
  }
  const ex=section(prefix,'examples',T.examples);
  view.workedExamples.forEach((w,i)=>{
    const box=el('div',{className:'kl-theory__example',attrs:{role:'group','aria-labelledby':`${prefix}-example-${i+1}`}});
    box.append(el('h4',{text:T.example(i+1),attrs:{id:`${prefix}-example-${i+1}`}}));
    const q=el('p'); q.append(el('strong',{text:`${T.problem}: `}),document.createTextNode(w.problem)); box.append(q);
    box.append(el('p',{className:'kl-theory__label',text:`${T.steps}:`}));
    const ol=el('ol'); for(const step of w.solutionSteps) ol.append(el('li',{text:step})); box.append(ol);
    const a=el('p'); a.append(el('strong',{text:`${T.answer}: `}),document.createTextNode(w.answer)); box.append(a,sources(w.sources));
    ex.append(box);
  });
  const mis=section(prefix,'misconceptions',T.misconceptions);
  for(const m of view.misconceptions){
    const box=el('div',{className:'kl-theory__misconception'});
    const wrong=el('p'); wrong.append(el('strong',{text:`${T.wrong}: `}),document.createTextNode(m.statement));
    const right=el('p'); right.append(el('strong',{text:`${T.right}: `}),document.createTextNode(m.correction));
    box.append(wrong,right,sources(m.sources)); mis.append(box);
  }
  const sum=section(prefix,'summary',T.summary);
  const ul=el('ul'); for(const p of view.summary.points) ul.append(el('li',{text:p})); sum.append(ul,sources(view.summary.sources));
  const src=section(prefix,'sources',T.sources);
  const sl=el('ul'); for(const s of view.sourceList) sl.append(el('li',{text:s.title})); src.append(sl);
  root.append(expl,ex,mis,sum,src);
  return root;
}
