import type {ProgressViewItem} from './model.ts';
import {clear,el,link} from '../../ui/components/dom.ts';

export function renderProgress(root:HTMLElement,items:ProgressViewItem[]){
  clear(root);
  const header=el('header',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(el('p',{className:'kl-kicker',text:'O‘rganish jarayoni'}),el('h1',{text:'Natijalarim'}),el('p',{className:'kl-unit-outcome',text:'Boshlagan mavzularingiz va davom ettirish mumkin bo‘lgan faoliyatlar.'})); header.append(hi);
  const section=el('section',{className:'kl-shell kl-section'});
  if(!items.length){const card=el('div',{className:'kl-card'});card.append(el('h2',{text:'Hali natija yo‘q'}),el('p',{text:'Birinchi mavzuni boshlab, amaliy faoliyatni bajaring.'}),link('Mavzularni ko‘rish','/','kl-button kl-button--primary'));section.append(card);root.append(header,section);return;}
  const grid=el('div',{className:'kl-progress-grid'});
  for(const item of items){const card=el('article',{className:'kl-card kl-progress-card'});card.append(el('p',{className:'kl-kicker',text:item.grade?`${item.grade}-sinf`:'Mavzu'}),el('h2',{text:item.title}),el('p',{text:item.statusLabel}),link('Davom etish',item.resumeHref,'kl-button kl-button--secondary'));grid.append(card);} section.append(grid);root.append(header,section);
}
