// Learner-facing mastery panel (P1.2 — C1). Band = text label + shape icon + ARIA text (never colour only),
// with a keyboard-accessible "Nega?" disclosure (<details>/<summary>). No numbers, no formula, no answers.
import type {MasteryViewModel} from '../../domain/mastery/view.ts';
import {el,link} from '../../ui/components/dom.ts';

export function renderMasteryPanel(view:MasteryViewModel):HTMLElement{
  const box=el('section',{className:`kl-mastery kl-mastery--${view.band.toLowerCase()}`,attrs:{'data-mastery-band':view.band,'aria-label':'O‘zlashtirish holati'}});
  const head=el('p',{className:'kl-mastery__status'});
  head.append(el('span',{className:'kl-mastery__icon',text:view.icon,attrs:{'aria-hidden':'true'}}),el('span',{className:'kl-mastery__label',text:`O‘zlashtirish: ${view.label}`,attrs:{role:'status','aria-label':view.ariaLabel}}));
  box.append(head);
  const why=el('details',{className:'kl-mastery__why'});
  why.append(el('summary',{text:'Nega?'}));
  const list=el('ul');
  for(const line of view.explanation) list.append(el('li',{text:line}));
  why.append(list);
  box.append(why);
  if(view.nextAction) box.append(link(view.nextAction.label,view.nextAction.href,'kl-text-link kl-mastery__next'));
  return box;
}
