// P2.12 — «Darslikdan o‘qish»: the learner view of a human-cut, rights-checked textbook excerpt (ADR-P2-013 §4).
// The PDF is loaded ON DEMAND (nothing is fetched until the learner opens it) and is shown by the browser's own viewer;
// the page never parses or executes the file. The same renderer draws the Content Studio preview (one contract, no
// parallel preview renderer). Text is plain DOM text (no HTML from content), every label comes from the uz-Latn catalog.
import {el,clear} from '../../ui/components/dom.js';
                                                               
import {createLabeler} from '../practice/form-question.js';

                                      
               
                                                                      
                                         
                                  
 

                                                                        

const kb=(n       )=>Math.max(1,Math.round(n/1024));

export function renderTextbookExcerpt(root            ,view                    ,opts                                   )                      {
  const t=createLabeler(opts.localize);
  clear(root);
  const section=el('section',{className:'kl-excerpt',attrs:{'aria-labelledby':'kl-excerpt-title','data-textbook-excerpt':''}});
  section.append(el('p',{className:'kl-kicker',text:t.ui('ui.excerpt-kicker')}),el('h2',{text:view.title,attrs:{id:'kl-excerpt-title'}}));
  const meta=el('dl',{className:'kl-excerpt__meta'});
  const row=(k       ,v       )=>{ meta.append(el('dt',{text:t.ui(k)}),el('dd',{text:v})); };
  row('ui.excerpt-source',[view.source.title,view.source.authority,view.source.edition,view.source.year?String(view.source.year):''].filter(Boolean).join(', '));
  if(view.pageRange) row('ui.excerpt-pages',view.pageRange.from===view.pageRange.to?String(view.pageRange.from):`${view.pageRange.from}–${view.pageRange.to}`);
  row('ui.excerpt-file',t.ui('ui.excerpt-file-size',{kb:kb(view.file.bytes)}));
  section.append(meta);
  const viewer=el('div',{className:'kl-excerpt__viewer'});
  const openButton=el('button',{className:'kl-button kl-button--primary',text:t.ui('ui.excerpt-open'),attrs:{type:'button','data-excerpt-open':''}});
  let opened=false;
  const open=()=>{
    if(opened) return; opened=true;
    // the browser's PDF viewer; the fallback link lets a device without one download the same file
    const obj=el('object',{attrs:{type:'application/pdf',data:opts.fileUrl,'aria-label':t.ui('ui.excerpt-viewer',{title:view.title}),'data-excerpt-pdf':''}});
    const fallback=el('p'); const a=el('a',{text:t.ui('ui.excerpt-download'),attrs:{href:opts.fileUrl,download:view.file.name}}); fallback.append(a); obj.append(fallback);
    viewer.append(obj,el('p',{className:'kl-excerpt__alt'}));
    viewer.lastElementChild .append(el('a',{text:t.ui('ui.excerpt-download'),attrs:{href:opts.fileUrl,download:view.file.name,'data-excerpt-download':''}}));
    openButton.remove();
  };
  openButton.addEventListener('click',open);
  section.append(el('p',{className:'kl-notice',text:t.ui('ui.excerpt-note')}),openButton,viewer);
  root.append(section);
  return {opened:()=>opened,open};
}
