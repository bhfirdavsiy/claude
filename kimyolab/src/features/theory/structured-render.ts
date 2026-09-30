// P2.3 — reusable structured theory renderer. Semantic sections with a heading hierarchy (h3 under the stage's h2),
// text labels (never colour alone), lazy media through the host asset path, sources and the review state. It renders
// authored text as given and computes nothing; the MINIMAL legacy blocks keep their own renderer in the guide.
// P2.3 closeout (A3): every label comes from the view (learner-interaction catalog, `ui.theory-*`) — no literals here.
import {el} from '../../ui/components/dom.ts';
import {assetUrl} from '../../ui/host-paths.ts';
import type {StructuredTheoryView} from './view.ts';

export function renderStructuredTheory(view:StructuredTheoryView,prefix='kl-theory'):HTMLElement{
  const L=view.labels;
  const sources=(list:string[])=>el('p',{className:'kl-theory__source',text:`${L.source}: ${list.join('; ')}`});
  const section=(id:string,title:string)=>{ const s=el('section',{className:`kl-theory__section kl-theory__section--${id}`,attrs:{'aria-labelledby':`${prefix}-${id}`}}); s.append(el('h3',{text:title,attrs:{id:`${prefix}-${id}`}})); return s; };
  const labelled=(label:string,text:string)=>{ const p=el('p'); p.append(el('strong',{text:`${label}: `}),document.createTextNode(text)); return p; };
  const root=el('div',{className:'kl-theory',attrs:{'data-theory-depth':'STRUCTURED','data-theory-review':view.reviewState}});
  if(L.reviewNote) root.append(el('p',{className:'kl-theory__review',text:L.reviewNote,attrs:{role:'note'}}));
  const expl=section('explanation',L.explanation);
  for(const para of view.explanation.text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean)) expl.append(el('p',{text:para}));
  expl.append(sources(view.explanation.sources));
  for(const m of view.media){
    const fig=el('figure',{className:'kl-theory__figure'});
    fig.append(el('img',{attrs:{src:assetUrl(m.src),alt:m.alt,loading:'lazy',decoding:'async'}}));
    if(m.caption) fig.append(el('figcaption',{text:m.caption}));
    expl.append(fig);
  }
  const ex=section('examples',L.examples);
  view.workedExamples.forEach((w,i)=>{
    const box=el('div',{className:'kl-theory__example',attrs:{role:'group','aria-labelledby':`${prefix}-example-${i+1}`}});
    box.append(el('h4',{text:L.example.replace('{n}',String(i+1)),attrs:{id:`${prefix}-example-${i+1}`}}),labelled(L.problem,w.problem),el('p',{className:'kl-theory__label',text:`${L.steps}:`}));
    const ol=el('ol'); for(const step of w.solutionSteps) ol.append(el('li',{text:step}));
    box.append(ol,labelled(L.answer,w.answer),sources(w.sources)); ex.append(box);
  });
  const mis=section('misconceptions',L.misconceptions);
  for(const m of view.misconceptions){ const box=el('div',{className:'kl-theory__misconception'}); box.append(labelled(L.wrong,m.statement),labelled(L.right,m.correction),sources(m.sources)); mis.append(box); }
  const sum=section('summary',L.summary);
  const ul=el('ul'); for(const p of view.summary.points) ul.append(el('li',{text:p})); sum.append(ul,sources(view.summary.sources));
  const src=section('sources',L.sources);
  const sl=el('ul'); for(const s of view.sourceList) sl.append(el('li',{text:s.title})); src.append(sl);
  root.append(expl,ex,mis,sum,src);
  return root;
}
