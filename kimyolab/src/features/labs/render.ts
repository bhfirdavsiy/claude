import type {LabCatalogModel,NativeLabCatalogItem,ExternalLabCatalogItem} from './model.ts';
import {el,clear,link} from '../../ui/components/dom.ts';

const providerLabel=(id:string)=>id==='nobook'?'NOBOOK':id==='chemai'?'ChemAI':'Chem Lab Station';

function nativeCard(item:NativeLabCatalogItem){
  const card=el('article',{className:'kl-lab-card'});
  const top=el('div',{className:'kl-lab-card__top'}); top.append(el('span',{className:'kl-provider-badge kl-provider-badge--native',text:'KimyoLab'}),el('span',{className:'kl-lab-grade',text:`${item.grade}-sinf`})); card.append(top);
  card.append(el('h3',{text:item.title}),el('p',{text:item.goal}),el('small',{text:item.learningUnitTitle,className:'kl-muted'}));
  if(item.executionMode==='guided') card.append(el('span',{className:'kl-status-pill',text:item.hardeningStatus==='procedural-only'?'Bosqichma-bosqich tajriba':'Yo‘naltirilgan tajriba'}));
  else if(item.executionMode==='engine') card.append(el('span',{className:'kl-status-pill',text:'Interaktiv tajriba'}));
  if(item.launchable) card.append(link('Tajribani boshlash',`/practice/${encodeURIComponent(item.id)}`,'kl-button kl-button--primary'));
  else card.append(el('span',{className:'kl-status-pill kl-status-pill--pending',text:'Tajriba tayyorlanmoqda'}));
  return card;
}
function externalCard(item:ExternalLabCatalogItem){
  const b=item.binding; const card=el('article',{className:'kl-lab-card kl-lab-card--external'});
  const top=el('div',{className:'kl-lab-card__top'}); top.append(el('span',{className:`kl-provider-badge kl-provider-badge--${b.provider}`,text:providerLabel(b.provider)}),el('span',{className:'kl-status-pill',text:b.mode==='embed'?'Hamkor laboratoriya':'Qo‘shimcha laboratoriya'})); card.append(top);
  card.append(el('h3',{text:b.title}),el('p',{text:b.description}));
  if(item.learningUnits.length){const names=item.learningUnits.slice(0,2).map(x=>x.title).join(' · ');const more=item.learningUnits.length>2?` · +${item.learningUnits.length-2} mavzu`:'';card.append(el('small',{className:'kl-muted',text:`${names}${more}`}));}
  const lu=item.learningUnits[0]?.id??b.learningUnitIds[0];
  if(b.provider==='nobook'&&b.status==='requires_partner_access') card.append(link('Ulanish holatini ko‘rish',`/external-lab/${encodeURIComponent(b.id)}?lu=${encodeURIComponent(lu)}`,'kl-button kl-button--secondary'));
  else card.append(link('Laboratoriyani ochish',`/external-lab/${encodeURIComponent(b.id)}?lu=${encodeURIComponent(lu)}`,'kl-button kl-button--secondary'));
  return card;
}

export function renderLabs(root:HTMLElement,model:LabCatalogModel){
  clear(root);
  const hero=el('section',{className:'kl-lab-hero'}); const hi=el('div',{className:'kl-shell kl-lab-hero__inner'});
  hi.append(el('p',{className:'kl-kicker',text:'KimyoLab · virtual tajribalar'}),el('h1',{text:'Virtual laboratoriya'}),el('p',{className:'kl-hero__body',text:'Virtual tajribalarni sinf va mavzu bo‘yicha tanlang, bosqichlarni bajaring, kuzatuvlarni qayd eting va natijalarni tekshiring.'})); hero.append(hi);
  const shell=el('div',{className:'kl-shell kl-section'});
  const toolbar=el('div',{className:'kl-lab-toolbar'});
  const q=el('input',{attrs:{type:'search',placeholder:'Tajriba yoki mavzuni qidiring','aria-label':'Laboratoriyani qidirish'}}) as HTMLInputElement;
  const grade=el('select',{attrs:{'aria-label':'Sinf bo‘yicha filter'}}) as HTMLSelectElement;
  grade.append(new Option('Barcha sinflar',''),...([7,8,9,10,11].map(x=>new Option(`${x}-sinf`,String(x)))));
  toolbar.append(q,grade); shell.append(toolbar);
  const nativeCount=model.native.length;
  shell.append(el('div',{className:'kl-lab-summary',text:`${nativeCount} ta KimyoLab tajribasi · ${model.external.length} ta qo‘shimcha hamkor laboratoriya` }));
  const nativeTitle=el('h2',{text:'KimyoLab laboratoriyalari'}); const nativeGrid=el('div',{className:'kl-lab-grid'});
  const externalTitle=el('h2',{text:'Hamkor va qo‘shimcha laboratoriyalar'}); const externalGrid=el('div',{className:'kl-lab-grid'});
  shell.append(nativeTitle,nativeGrid,externalTitle,externalGrid); root.append(hero,shell);
  const render=()=>{
    const query=q.value.trim().toLocaleLowerCase('uz'); const selected=grade.value;
    nativeGrid.replaceChildren(...model.native.filter(x=>(!selected||String(x.grade)===selected)&&(!query||`${x.title} ${x.goal} ${x.learningUnitTitle}`.toLocaleLowerCase('uz').includes(query))).map(nativeCard));
    externalGrid.replaceChildren(...model.external.filter(x=>(!selected||x.grades.includes(Number(selected)))&&(!query||`${x.binding.title} ${x.binding.description} ${x.learningUnits.map(u=>u.title).join(' ')}`.toLocaleLowerCase('uz').includes(query))).map(externalCard));
    if(!nativeGrid.childElementCount) nativeGrid.append(el('p',{className:'kl-muted',text:'Mos KimyoLab tajribasi topilmadi.'}));
    if(!externalGrid.childElementCount) externalGrid.append(el('p',{className:'kl-muted',text:'Mos tashqi laboratoriya topilmadi.'}));
  };
  q.addEventListener('input',render); grade.addEventListener('change',render); render();
}
