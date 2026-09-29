import { HOME_COPY } from './copy.ts';
import { el, clear, link } from '../../ui/components/dom.ts';

type HomeIconKey='topic'|'lab'|'results';
const HOME_ICON_PATHS:Record<HomeIconKey,string>={
  topic:'/assets/home/topic-studio.png',
  lab:'/assets/home/virtual-lab.png',
  results:'/assets/home/results.png',
};
function homeAsset(key:HomeIconKey){
  const path=HOME_ICON_PATHS[key];
  const embedded=(globalThis as any).__KIMYOLAB_STANDALONE_ASSETS__?.[path];
  return typeof embedded==='string'?embedded:path;
}
function featureCard(icon:HomeIconKey,title:string,body:string,href:string,cta:string){
  const card=link('',href,'kl-feature-card');
  const iconWrap=el('span',{className:'kl-feature-icon'});
  iconWrap.append(el('img',{className:'kl-feature-icon__image',attrs:{src:homeAsset(icon),alt:'',width:'96',height:'96',loading:'lazy',decoding:'async'}}));
  card.append(iconWrap,el('h2',{text:title}),el('p',{text:body}),el('span',{className:'kl-arrow',text:`${cta} →`}));
  return card;
}

export function renderHome(root:HTMLElement){
  clear(root);
  const hero=el('section',{className:'kl-hero kl-hero--sinco','attrs':{'aria-labelledby':'home-title'}} as any);
  const wrap=el('div',{className:'kl-shell kl-hero-layout'});
  const copy=el('div',{className:'kl-hero-copy'});
  copy.append(el('p',{className:'kl-kicker',text:HOME_COPY.kicker}));
  const title=el('h1',{className:'kl-hero__title',attrs:{id:'home-title'}});
  title.append(document.createTextNode('Kimyo fanini '),el('span',{text:'tajribalar orqali o‘rganing'}));
  copy.append(title,el('p',{className:'kl-hero__body',text:HOME_COPY.body}));
  const actions=el('div',{className:'kl-actions'});
  actions.append(link(HOME_COPY.primaryCta,'/curriculum','kl-button kl-button--primary'),link(HOME_COPY.secondaryCta,'/labs','kl-button kl-button--secondary'));
  copy.append(actions);
  const visual=el('div',{className:'kl-hero-visual','attrs':{'aria-hidden':'true'}});
  const flask=el('div',{className:'kl-flask'});
  flask.append(
    el('span',{className:'kl-flask-liquid'}),
    el('span',{className:'kl-flask-bubble b1'}),
    el('span',{className:'kl-flask-bubble b2'}),
    el('span',{className:'kl-flask-bubble b3'})
  );
  visual.append(
    el('div',{className:'kl-orbit kl-orbit--one'}),
    el('div',{className:'kl-orbit kl-orbit--two'}),
    flask,
    el('div',{className:'kl-molecule m1',text:'H₂O'}),
    el('div',{className:'kl-molecule m2',text:'NaCl'}),
    el('div',{className:'kl-molecule m3',text:'CO₂'})
  );
  wrap.append(copy,visual); hero.append(wrap);

  const statWrap=el('section',{className:'kl-shell kl-home-stats','attrs':{'aria-label':'Platforma imkoniyatlari'}} as any);
  const stats=[['7–11','sinf'],['57','virtual tajriba va protokol'],['118','kimyoviy element'],['5','interaktiv faoliyat turi']];
  for(const [n,label] of stats){const item=el('div',{className:'kl-stat'});item.append(el('strong',{text:n}),el('span',{text:label}));statWrap.append(item);}

  const ecosystem=el('section',{className:'kl-shell kl-home-section'});
  ecosystem.append(el('p',{className:'kl-kicker',text:'KimyoLab ekotizimi'}),el('h2',{className:'kl-section-title',text:'Nazariya amaliyotga ulanadi.'}),el('p',{className:'kl-section-copy',text:'Mavzuni nazariyadan boshlang, amaliyotda sinab ko‘ring va mustahkamlash bosqichida xulosangizni tekshiring.'}));
  const features=el('div',{className:'kl-feature-grid'});
  features.append(
    featureCard('topic','Mavzu studiyasi','7–11-sinf mavzularini sinf va bob bo‘yicha toping.','/curriculum','Mavzularni ochish'),
    featureCard('lab','Virtual laboratoriya','Virtual tajribalarni tanlang, jarayonlarni bosqichma-bosqich bajaring va natijalarni kuzating.','/labs','Tajriba boshlash'),
    featureCard('results','Natijalarim','Bajargan mashq va tajribalaringiz, baholash natijalari va o‘sishingizni kuzating.','/progress','Natijalarni ko‘rish')
  ); ecosystem.append(features);

  const grades=el('section',{className:'kl-shell kl-home-section kl-home-grades',attrs:{'aria-labelledby':'grades-title'}});
  grades.append(el('p',{className:'kl-kicker',text:'Bosqichma-bosqich o‘rganish'}),el('h2',{className:'kl-section-title',text:'Sinfingizni tanlang',attrs:{id:'grades-title'}}));
  const grid=el('div',{className:'kl-grade-grid'});
  for(const grade of [7,8,9,10,11]){const card=link(`${grade}-sinf`,`/curriculum?grade=${grade}`,'kl-grade-card');card.append(el('span',{text:'Nazariya · tajriba · mashq',className:'kl-grade-card__meta'}));grid.append(card);} grades.append(grid);
  root.append(hero,statWrap,ecosystem,grades);
}
