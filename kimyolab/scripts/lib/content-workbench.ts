// P2.4 — the governed content workbench model (ADR-P2-005): structured-theory authoring + dual review, source intake
// + review, and the OPTION_SET_MISSING authoring queue. It joins the ONE offline reviewer workspace as three tabs; the
// learner runtime never loads any of it. Data only — no content, no identity and no decision is prefilled.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ACCEPTABLE} from '../../src/domain/governance/source-policy.ts';
import {buildTheoryAuthoring} from '../theory-authoring.ts';
import {buildTheoryAuthoringStatus,readSourceIntake,sourceReviewQueue} from './content-operations.ts';
import {bundleBrowserModules} from './browser-module-bundle.ts';
import {CONTENT_WORKBENCH_CSS,CONTENT_WORKBENCH_JS} from './content-workbench-client.ts';

const here=path.dirname(fileURLToPath(import.meta.url));
const src=(rel:string)=>path.join(here,'../../src',rel);
/** The browser-safe modules the workbench runs (the same code as the governed apply). Authoring-only modules live in
 *  src/authoring/, which no learner build copies (the learner runtime never ships authoring code). */
export const WORKBENCH_DOMAIN_MODULES=['authoring/authoring-packet.ts','domain/theory/structured-theory.ts','authoring/source-intake.ts','authoring/option-set-draft.ts','domain/governance/source-policy.ts'].map(src);

export function buildContentWorkbenchModel(root:string){
  const {packets}=buildTheoryAuthoring(root);
  const registryRaw=JSON.parse(fs.readFileSync(path.join(root,'content-src/source-registry.json'),'utf8'));
  const status=buildTheoryAuthoringStatus(root);
  const optionQueue=JSON.parse(fs.readFileSync(path.join(root,'review-packets/option-set-authoring/queue.json'),'utf8'));
  const shared=(packets[0] as any)??{};
  const model={
    schema:'kimyolab.content-workbench.v1',
    sources:registryRaw.sources.map((s:any)=>({id:s.id,category:s.category,title:s.title,classification:s.classification??null})),
    acceptableSources:registryRaw.sources.filter((s:any)=>ACCEPTABLE.chemistry.includes(s.category)).map((s:any)=>({id:s.id,category:s.category,title:s.title})),
    // packets without the two fields every packet shares (added back on export)
    packets:packets.map((p:any)=>{ const {sourceRequirements,reviewChecklist,...rest}=p; return rest; }),
    sourceRequirements:shared.sourceRequirements,reviewChecklist:shared.reviewChecklist,
    unitStatus:Object.fromEntries(status.units.map((u:any)=>[u.learningUnitId,{state:u.state,origin:u.origin}])),
    intake:sourceReviewQueue(root),
    intakeEntries:Object.fromEntries(readSourceIntake(root).map(i=>[i.entry.sourceId,i.entry])),
    optionFields:optionQueue.activities.flatMap((a:any)=>a.fields.map((f:any)=>({activityId:a.activityId,activityTitle:a.activityTitle,learningUnitId:a.learningUnitId,field:f.field,fieldLabel:f.fieldLabel,canonicalTarget:f.canonicalTarget}))),
  };
  const fingerprint=createHash('sha256').update(JSON.stringify(model)).digest('hex');
  return {...model,fingerprint};
}

const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const scriptJson=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c');

export const CONTENT_TABS=[{id:'theory',label:'Nazariya (structured)'},{id:'sources',label:'Manbalar'},{id:'optionsets',label:'Option set'}] as const;

/** Tab buttons, tab panels and scripts for the reviewer workspace. */
export function contentWorkbenchHtml(root:string){
  const m=buildContentWorkbenchModel(root);
  const tabs=CONTENT_TABS.map(t=>`<button type="button" role="tab" id="tabbtn-${t.id}" aria-controls="tab-${t.id}" aria-selected="false" tabindex="-1" data-tab="${t.id}">${esc(t.label)}</button>`).join('');
  const field=(k:string,label:string,input='')=>`<label for="csf-${k}">${esc(label)}${input||`<input id="csf-${k}" type="text" autocomplete="off">`}</label>`;
  const cats=['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE','LOCALIZATION_GLOSSARY'];
  const panels=`
<section id="tab-theory" class="panel hidden" role="tabpanel" aria-labelledby="tabbtn-theory"><h2 tabindex="-1">Structured nazariya — mualliflik va ikki kishilik review</h2>
<p>Slotlar bo‘sh: matn, misol, noto‘g‘ri tushuncha va xulosani faqat inson yozadi. Har blok o‘z manbasi bilan; chemistry va didactic review — ikki xil odam, ikkalasi ham <strong>joriy hash</strong>ga. Har qanday tahrir eski review’ni STALE qiladi. Eksport qilingan packet: <code>npm run theory:import</code> (draft) → ikki review → <code>npm run theory:apply</code> (inson).</p>
<div class="wb-filters"><label>Sinf <select id="ctGrade"><option value="all">hammasi</option></select></label><label>Mavzu <select id="ctUnit"></select></label><label>Muallif ID (shaxs) <input id="ctAuthor" autocomplete="off"></label></div>
<div class="actions"><label class="btn">Packet import <input type="file" id="ctImport" accept="application/json,.json" hidden></label><button type="button" class="btn primary" id="ctExport">Packet’ni eksport qilish</button><button type="button" class="btn" id="ctReset">Lokal tahrirni o‘chirish</button></div>
<div class="wb-errors" id="ctError" role="alert" tabindex="-1" hidden></div>
<div class="cw-grid"><div id="ctFacts" class="wb-card"></div><div id="ctSummary" role="status" aria-live="polite"></div></div><div id="ctEditor"></div></section>
<section id="tab-sources" class="panel hidden" role="tabpanel" aria-labelledby="tabbtn-sources"><h2 tabindex="-1">Manbalar — governed intake va review</h2>
<p>Mashina metadata’ni tekshiradi, hujjat hash’ini hisoblaydi va takrorni topadi; manbani <strong>authoritative deb faqat inson</strong> qabul qiladi (kategoriyani tanlab, joriy hash’ga). Taklif qilgan kishi o‘zini tasdiqlay olmaydi. Registry’ga faqat <code>npm run source:apply</code> (inson) qo‘shadi.</p>
<div class="cw-grid"><div><h3>Ro‘yxatdagi manbalar</h3><ul id="csRegistry"></ul><h3>Review navbati</h3><div id="csQueue" class="wb-list"></div></div>
<div><h3>Manba taklifi / review</h3><div class="cw-form">${field('sourceId','sourceId (src.…)')}${field('category','Kategoriya',`<select id="csf-category"><option value="">—</option>${cats.map(c=>`<option>${c}</option>`).join('')}</select>`)}${field('title','Nomi')}${field('authority','Nashriyot / vakolatli organ')}${field('edition','Nashr')}${field('year','Yil')}${field('language','Til (uz-Latn, ru …)')}${field('authors','Mualliflar (; bilan)')}${field('isbn','ISBN')}${field('identifier','Identifikator')}${field('url','URL')}${field('locator','Sahifa/bo‘lim havolasi',`<select id="csf-locator"><option value="none">none</option><option value="page">page</option><option value="section">section</option></select>`)}${field('documentName','Hujjat fayli')}${field('documentSha256','Hujjat SHA-256')}${field('submittedBy','Taklif qiluvchi (shaxs)')}${field('status','Holat',`<select id="csf-status"><option value="draft">draft</option><option value="ready-for-review">ready-for-review</option></select>`)}</div>
<label>Lokal hujjatdan hash hisoblash <input type="file" id="csDocFile"></label>
<div id="csLive" role="status" aria-live="polite"></div>
<div class="cw-form"><label for="csDecision">Qaror<select id="csDecision"><option value="">—</option><option value="approved">approved</option><option value="changes-requested">changes-requested</option><option value="rejected">rejected</option></select></label><label for="csAccepted">Qabul qilingan kategoriya<select id="csAccepted"><option value="">—</option>${cats.map(c=>`<option>${c}</option>`).join('')}</select></label></div>
<div class="wb-errors" id="csError" role="alert" hidden></div>
<div class="actions"><button type="button" class="btn" id="csReview">Qarorni yozish (reviewer)</button><button type="button" class="btn primary" id="csExport">Intake JSON eksport</button><label class="btn">Import <input type="file" id="csImport" accept="application/json,.json" hidden></label><button type="button" class="btn" id="csNew">Yangi</button></div></div></div></section>
<section id="tab-optionsets" class="panel hidden" role="tabpanel" aria-labelledby="tabbtn-optionsets"><h2 tabindex="-1">OPTION_SET_MISSING — inson yozadigan variantlar</h2>
<p>${m.optionFields.length} ta maydon. Platforma <strong>distraktor o‘ylab topmaydi</strong>: har variantni muallif yozadi. Draft structured nazariya bilan bir xil governance’ga ega (chemistry + didactic, ikki odam, bir hash). Kanonik kiritish — mavjud governed authoring yo‘li orqali.</p>
<div class="cw-grid"><div id="coList" class="wb-list"></div><div id="coEditor" class="wb-card"></div></div></section>`;
  const scripts=`<script id="content-workbench-data" type="application/json">${scriptJson(m)}</script><script>${bundleBrowserModules(WORKBENCH_DOMAIN_MODULES,'KL_GOV')}</script><script>${CONTENT_WORKBENCH_JS}</script>`;
  return {model:m,tabs,panels,scripts,css:CONTENT_WORKBENCH_CSS};
}
