export const qs=(s,r=document)=>r.querySelector(s);
export const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
export const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export async function loadJson(path){const r=await fetch(path);if(!r.ok)throw new Error(`DATA_LOAD_FAILED ${path}`);return r.json();}
export function badgeClass(status=''){if(status==='Mavjud')return 'kl-full';if(status==='Qisman mavjud')return 'kl-partial';return 'kl-new';}
export function navInit(){const name=document.body.dataset.page;document.querySelectorAll('[data-page-link]').forEach(a=>{if(a.dataset.pageLink===name)a.closest('li')?.classList.add('active')});}
document.addEventListener('DOMContentLoaded',navInit);
