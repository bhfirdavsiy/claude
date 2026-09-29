import type {ExternalLabBinding,ExternalLabEvidence} from '../../integrations/external-labs/types.ts';
import {getExternalLabProvider} from '../../integrations/external-labs/providers.ts';
import {el,clear,link} from '../../ui/components/dom.ts';
import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';

/** External evidence is persisted in IndexedDB.externalEvidence (never localStorage) and validated on save and restore. */
export interface ExternalEvidenceStore {
  saveExternalEvidence(evidence:unknown,expected:{bindingId:string;learningUnitId:string;provider:string}):Promise<unknown>;
  loadExternalEvidence(expected:{bindingId:string;learningUnitId:string;provider:string}):Promise<ExternalLabEvidence|undefined>;
}

const providerLabel=(id:string)=>id==='nobook'?'NOBOOK':id==='chemai'?'ChemAI':'Chem Lab Station';

export async function renderExternalLab(root:HTMLElement,binding:ExternalLabBinding,learningUnitId:string,evidenceStore:ExternalEvidenceStore=new IndexedDbProgressStore((globalThis as any).indexedDB)){
  const expected={bindingId:binding.id,learningUnitId,provider:binding.provider};
  clear(root); const provider=getExternalLabProvider(binding.provider);
  const hero=el('section',{className:'kl-unit-hero'}); const hi=el('div',{className:'kl-shell'});
  hi.append(link('← Virtual laboratoriya','/labs','kl-back-link'),el('p',{className:'kl-kicker',text:providerLabel(binding.provider)}),el('h1',{text:binding.title}),el('p',{className:'kl-unit-outcome',text:binding.description}));hero.append(hi);
  const shell=el('div',{className:'kl-shell kl-external-lab-layout'}); const info=el('section',{className:'kl-card'});
  info.append(el('h2',{text:'Qanday ishlaydi?'}),el('p',{text:'Hamkor laboratoriyadagi mashg‘ulotdan so‘ng KimyoLab ichidagi qisqa tekshiruv orqali mavzuni mustahkamlaysiz.'}));
  info.append(link('Mavzuga qaytish',`/learn/${encodeURIComponent(learningUnitId)}`,'kl-button kl-button--secondary'));
  shell.append(info);
  if(binding.provider!=='nobook'){
    const launch=el('section',{className:'kl-card kl-external-launch'}); launch.append(el('h2',{text:'Hamkor laboratoriyani ochish'}),el('p',{text:'Laboratoriya yangi oynada ochiladi. Mashg‘ulot tugagach, KimyoLab’ga qaytib kuzatuvingizni yozishingiz mumkin.'}));
    if(binding.externalUrl){const a=el('a',{className:'kl-button kl-button--primary',text:'Laboratoriyani ochish',attrs:{href:binding.externalUrl,target:'_blank',rel:'noopener noreferrer'}});launch.append(a);}
    if(binding.evidencePolicy==='self_report'){
      const form=el('form',{className:'kl-form kl-external-evidence-form'}); const label=el('label',{className:'kl-field'});
      label.append(el('span',{text:'Tajribadan keyingi kuzatuvingiz'})); const note=el('textarea',{attrs:{required:'',placeholder:'Nimani kuzatdingiz? Qaysi omil natijaga ta’sir qildi?'}}) as HTMLTextAreaElement; label.append(note);
      const save=el('button',{className:'kl-button kl-button--secondary',text:'Kuzatuvni saqlash',attrs:{type:'submit'}}); const msg=el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}});form.append(label,save,msg);
      form.addEventListener('submit',event=>{event.preventDefault();const evidence:ExternalLabEvidence={provider:binding.provider,bindingId:binding.id,learningUnitId,evidencePolicy:'self_report',capturedAt:new Date().toISOString(),note:note.value.trim()};void evidenceStore.saveExternalEvidence(evidence,expected).then(()=>{msg.textContent='Kuzatuv saqlandi. Mavzuni yakunlash uchun KimyoLab tekshiruviga qayting.';},()=>{msg.textContent='Kuzatuvni saqlab bo‘lmadi. Matn juda uzun yoki brauzer xotirasi mavjud emas.';});});launch.append(form);
    }
    shell.append(launch);root.append(hero,shell);return;
  }
  const host=el('section',{className:'kl-card kl-nobook-host'}); const status=el('div',{className:'kl-feedback',attrs:{role:'status','aria-live':'polite'}}); const mount=el('div',{className:'kl-external-frame-mount'}); const controls=el('div',{className:'kl-actions'});
  host.append(el('h2',{text:'Hamkor virtual laboratoriya'}),status,mount,controls); shell.append(host); root.append(hero,shell);
  const readiness=await provider.readiness(binding);
  if(!readiness.ready){status.textContent=readiness.code==='PROVIDER_UNAVAILABLE'?'Hamkor laboratoriya bilan ulanishda vaqtinchalik muammo bor. Keyinroq qayta urinib ko‘ring.':'Hamkor virtual laboratoriya hozircha ulanmagan. KimyoLab’dagi mavjud tajribalar orqali davom etishingiz mumkin.';controls.append(link('KimyoLab tajribalariga qaytish','/labs','kl-button kl-button--secondary'));return;}
  status.textContent='Hamkor laboratoriya tayyor. Tajribani ochishingiz mumkin.';
  const start=el('button',{className:'kl-button kl-button--primary',text:'Virtual laboratoriyani ochish',attrs:{type:'button'}});
  controls.append(start); let session:any;
  start.addEventListener('click',async()=>{start.setAttribute('disabled','');status.textContent='Laboratoriya yuklanmoqda…';try{session=await provider.launch(binding,{learningUnitId,mount});status.textContent='Laboratoriya yuklandi. Tajriba holatini saqlashingiz mumkin.';const save=el('button',{className:'kl-button kl-button--secondary',text:'Holatni saqlash',attrs:{type:'button'}});const restore=el('button',{className:'kl-button kl-button--secondary',text:'Saqlangan holatni tiklash',attrs:{type:'button'}});controls.append(save,restore);save.addEventListener('click',async()=>{const evidence:ExternalLabEvidence=await session.saveState();try{await evidenceStore.saveExternalEvidence(evidence,expected);status.textContent='Tajriba holati saqlandi. Mavzuni yakunlash uchun KimyoLab tekshiruviga qayting.';}catch{status.textContent='Tajriba holatini saqlab bo‘lmadi: ma’lumot tekshiruvdan o‘tmadi yoki hajmi juda katta.';}});restore.addEventListener('click',async()=>{const saved=await evidenceStore.loadExternalEvidence(expected).catch(()=>undefined);if(!saved){status.textContent='Saqlangan holat topilmadi.';return;}await session.restoreState(saved);status.textContent='Saqlangan tajriba holati tiklandi.';});}catch{status.textContent='Hamkor laboratoriyani ochib bo‘lmadi. Keyinroq qayta urinib ko‘ring.';start.removeAttribute('disabled');}});
}
