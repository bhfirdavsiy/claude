import {el,clear,link} from '../../ui/components/dom.js';

                                                                                                     

export function renderCurriculum(root            ,units                 ){
  clear(root);
  const hero=el('section',{className:'kl-page-hero kl-curriculum-hero'});
  const hi=el('div',{className:'kl-shell'});
  hi.append(el('p',{className:'kl-kicker',text:'Mavzu studiyasi'}),el('h1',{text:'Kimyoni sinf va mavzu bo‘yicha o‘rganing'}),el('p',{className:'kl-hero__body',text:'7–11-sinf mavzularidan birini tanlang. Har bir mavzu Nazariya → Amaliyot → Mustahkamlash ketma-ketligida ochiladi.'}));
  hero.append(hi);
  const shell=el('div',{className:'kl-shell kl-section'});
  const controls=el('div',{className:'kl-curriculum-toolbar'});
  const q=el('input',{attrs:{type:'search',placeholder:'Mavzu yoki bobni qidiring','aria-label':'Mavzuni qidirish'}})                    ;
  const grade=el('select',{attrs:{'aria-label':'Sinfni tanlash'}})                     ;
  grade.append(new Option('Barcha sinflar',''),...([7,8,9,10,11].map(g=>new Option(`${g}-sinf`,String(g)))));
  controls.append(q,grade); shell.append(controls);
  const summary=el('p',{className:'kl-curriculum-summary'}); const grid=el('div',{className:'kl-curriculum-grid'}); shell.append(summary,grid); root.append(hero,shell);
  const draw=()=>{
    const query=q.value.trim().toLocaleLowerCase('uz'); const selected=grade.value;
    const rows=units.filter(u=>(!selected||String(u.grade)===selected)&&(!query||`${u.title} ${u.chapter??''} ${(u.learningOutcomes??[]).join(' ')}`.toLocaleLowerCase('uz').includes(query)));
    summary.textContent=`${rows.length} ta mavzu ko‘rsatilmoqda`;
    grid.replaceChildren(...rows.map(u=>{
      const card=link('',`/learn/${encodeURIComponent(u.id)}/guide`,'kl-curriculum-card');
      card.append(el('span',{className:'kl-grade-pill',text:`${u.grade}-sinf`}),el('h2',{text:u.title}),el('p',{text:u.chapter??u.learningOutcomes?.[0]??'Nazariya va amaliy faoliyat'}),el('span',{className:'kl-arrow',text:'Mavzuni ochish →'}));
      return card;
    }));
    if(!rows.length) grid.append(el('div',{className:'kl-card kl-empty-card',text:'Mos mavzu topilmadi.'}));
  };
  q.addEventListener('input',draw); grade.addEventListener('change',draw); draw();
}
