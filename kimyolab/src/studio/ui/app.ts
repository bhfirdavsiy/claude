// P2.12 — Content Studio UI (ADR-P2-013). Tanla → To‘ldir → Ko‘r → Tekshir → Nashrga tayyorla, one task per screen.
//
// The author sees class and topic names and plain uz-Latn text only — never JSON, schema names, ids, engine or handler
// names, hashes, revisions, branches or error codes. Every label comes from content-src/studio/content-studio.uz-latn.json.
// The preview draws the LEARNER renderers themselves (renderTextbookExcerpt, renderDynamicLab) with the learner's own
// content contracts, so it cannot drift from production. Nothing here writes canonical content: the last screen only
// downloads a deterministic publish candidate for the human-only apply pipeline.
import {el,clear} from '../../ui/components/dom.ts';
import {createLocalizer,type Localize} from '../../features/localization/element-names.ts';
import {renderTextbookExcerpt} from '../../features/textbook-excerpt/render.ts';
import {renderDynamicLab} from '../../features/dynamic-lab/render.ts';
import type {StudentPracticePageModel} from '../../features/practice/model.ts';
import type {TopicLabProfile} from '../../domain/lab/topic-lab-profile.ts';
import {buildCapabilityRegistry} from '../../domain/lab/capability-registry.ts';
import {CONTENT_ROLES} from '../content-roles.ts';
import {attachPdf,emptyExcerpt,validateExcerpt,type ExcerptPayload,type PdfRejection,type StudioFinding} from '../pdf-excerpt.ts';
import {analyzeInstruction,emptyInstruction,instructionFromLegacy,labDerived,labFindings,previewProfile,stepsFromText,type LabInstructionPayload} from '../lab-instruction.ts';
import {createDraft,markPreviewed,withValidation,type PreviewEvidence,type StudioDraft} from '../draft.ts';
import {buildPublishCandidate,serializeCandidate} from '../publish-candidate.ts';
import type {StudioData} from '../studio-data.ts';

/** what the Studio needs from the learner content pack (the learner's own ContentClient in production) */
export interface StudioLearnerContent {
  loadPractice(practiceActivityId:string):Promise<StudentPracticePageModel>;
  loadTopicLabProfile(practiceActivityId:string):Promise<TopicLabProfile|null>;
}
export interface StudioEnvironment { createObjectUrl(bytes:Uint8Array,type:string):string; revokeObjectUrl(url:string):void }

type Role='TEXTBOOK_EXCERPT'|'LAB_INSTRUCTION';
const STAGES=['studio.stage.choose','studio.stage.fill','studio.stage.preview','studio.stage.check','studio.stage.prepare'] as const;
const PDF_REJECTION_MESSAGE:Partial<Record<PdfRejection,string>>={TOO_LARGE:'studio.excerpt.file-too-large',ENCRYPTED:'studio.excerpt.file-encrypted',ACTIVE_CONTENT:'studio.excerpt.file-active',MALFORMED:'studio.excerpt.file-structure',UNSUPPORTED_STRUCTURE:'studio.excerpt.file-unsupported'};
const UNCOVERED_REASON:Record<string,string>={AMBIGUOUS_OR_UNMAPPED:'studio.reason.ambiguous',NOT_OFFERED:'studio.reason.not-offered',NOT_OFFERED_FOR_THIS_TRIAL:'studio.reason.not-offered-trial',LEARNER_RESPONSE_NOT_OFFERED:'studio.reason.learner-response',OBSERVATION_NOT_PRODUCED:'studio.reason.observation'};
const FIELD_ID:Record<string,string>={topic:'studio-topic',title:'studio-x-title','source-title':'studio-x-source-title','source-authority':'studio-x-source-authority','source-year':'studio-x-year','page-from':'studio-x-page-from',file:'studio-x-file',rights:'studio-x-rights',steps:'studio-lab-steps'};

export function renderContentStudio(root:HTMLElement,data:StudioData,content:StudioLearnerContent,env:StudioEnvironment){
  const s=(key:string,vars?:Record<string,string|number>)=>{ const v=data.studioLabels[key]; if(v===undefined) throw new Error(`STUDIO_LABEL_MISSING:${key}`); return v.replace(/\{(\w+)\}/g,(_,k)=>String(vars?.[k]??'')); };
  const learnerLocalize:Localize=createLocalizer({interaction:{locale:'uz-Latn',labels:data.learnerLabels}});
  const registry=buildCapabilityRegistry(data.registryData);

  let stage=0, grade:number|null=null, luId:string|null=null, role:Role|null=null;
  let draft:StudioDraft|null=null, pdfBytes:Uint8Array|null=null, pdfSha:string|null=null, pdfUrl:string|null=null, candidateUrl:string|null=null;
  let previewMode:'desktop'|'mobile'='desktop';
  let canonical:{page:StudentPracticePageModel;profile:TopicLabProfile|null}|null=null;
  const unit=()=>data.units.find(u=>u.id===luId)??null;
  const labSource=()=>data.labSources.find(x=>x.learningUnitId===luId)??null;

  clear(root);
  const shell=el('main',{className:'kl-shell kl-studio',attrs:{'data-content-studio':''}});
  const head=el('header',{className:'kl-studio__head'});
  head.append(el('p',{className:'kl-kicker',text:s('studio.kicker')}),el('h1',{text:s('studio.title')}),el('p',{text:s('studio.intro')}),el('p',{className:'kl-notice',text:s('studio.not-saved')}));
  const nav=el('nav',{className:'kl-studio__flow',attrs:{'aria-label':s('studio.flow')}}); const navList=el('ol'); nav.append(navList);
  const live=el('p',{className:'kl-visually-hidden',attrs:{role:'status','aria-live':'polite'}});
  const screen=el('section',{className:'kl-studio__screen',attrs:{'aria-labelledby':'studio-screen-title'}});
  shell.append(head,nav,live,screen); root.append(shell);

  function drawNav(){ clear(navList); STAGES.forEach((k,i)=>{ const li=el('li',{text:s(k)}); if(i===stage) li.setAttribute('aria-current','step'); if(i<stage) li.dataset.done='true'; navList.append(li); }); }
  function go(next:number){ stage=next; draw(); live.textContent=s(STAGES[stage]!); screen.querySelector<HTMLElement>('h2')?.focus(); }
  function title(key:string){ return el('h2',{text:s(key),attrs:{id:'studio-screen-title',tabindex:'-1'}}); }
  function buttons(back:boolean,nextLabel:string,onNext:()=>void){
    const row=el('div',{className:'kl-practice-controls'});
    if(back){ const b=el('button',{className:'kl-button kl-button--secondary',text:s('studio.back'),attrs:{type:'button','data-studio-back':''}}); b.addEventListener('click',()=>go(stage-1)); row.append(b); }
    const n=el('button',{className:'kl-button kl-button--primary',text:nextLabel,attrs:{type:'submit','data-studio-next':''}}); row.append(n);
    void onNext; return row;
  }
  /** a labelled form field; `required` is announced in text, not by colour */
  function field(id:string,label:string,control:HTMLElement,opts:{required?:boolean;hint?:string}={}){
    const f=el('div',{className:'kl-field'});
    const l=el('label',{text:`${label} (${s(opts.required?'studio.required':'studio.optional')})`,attrs:{for:id}});
    f.append(l);
    if(opts.hint){ const h=el('p',{className:'kl-field__hint',text:opts.hint,attrs:{id:`${id}-hint`}}); f.append(h); control.setAttribute('aria-describedby',`${id}-hint`); }
    control.id=id; f.append(control); return f;
  }
  function input(type:string,value:string,attrs:Record<string,string>={}){ return el('input',{attrs:{type,value,autocomplete:'off',...attrs}}); }
  function formWithAlert(onSubmit:(form:HTMLFormElement,alert:HTMLElement)=>void){
    const form=el('form',{className:'kl-form',attrs:{novalidate:''}});
    const alert=el('p',{className:'kl-field-error',attrs:{role:'alert',id:'studio-form-error'}});
    form.addEventListener('submit',e=>{ e.preventDefault(); alert.textContent=''; for(const x of form.querySelectorAll('[aria-invalid]')){ x.removeAttribute('aria-invalid'); const d=(x.getAttribute('aria-describedby')??'').split(/\s+/).filter(v=>v&&v!=='studio-form-error').join(' '); if(d) x.setAttribute('aria-describedby',d); else x.removeAttribute('aria-describedby'); } onSubmit(form,alert); });
    return {form,alert};
  }
  /** the error is announced (role=alert) AND bound to every field to fix (aria-describedby), never colour-only */
  function fail(alert:HTMLElement,controls:HTMLElement[]){ alert.textContent=s('studio.form-error'); for(const c of controls){ c.setAttribute('aria-invalid','true'); const d=new Set((c.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean)); d.add('studio-form-error'); c.setAttribute('aria-describedby',[...d].join(' ')); } controls[0]?.focus(); }

  // ---------------------------------------------------------------- 1. Tanla
  function drawChoose(){
    screen.append(title('studio.stage.choose'));
    const {form,alert}=formWithAlert((_,a)=>{
      const bad:HTMLElement[]=[];
      if(!grade) bad.push(gradeSel); if(!luId) bad.push(topicSel); if(!role) bad.push(roleFs.querySelector('input')!);
      if(bad.length){ fail(a,bad); return; }
      startDraft(); go(1);
    });
    const gradeSel=el('select'); gradeSel.append(el('option',{text:s('studio.choose'),attrs:{value:''}}));
    for(const g of [...new Set(data.units.map(u=>u.grade))].sort((a,b)=>a-b)){ const o=el('option',{text:s('studio.grade-option',{grade:g}),attrs:{value:String(g)}}); if(g===grade) o.selected=true; gradeSel.append(o); }
    const topicSel=el('select');
    const fillTopics=()=>{ clear(topicSel); topicSel.append(el('option',{text:s('studio.choose'),attrs:{value:''}})); for(const u of data.units.filter(x=>x.grade===grade)){ const o=el('option',{text:u.chapter?`${u.chapter} — ${u.title}`:u.title,attrs:{value:u.id}}); if(u.id===luId) o.selected=true; topicSel.append(o); } topicSel.disabled=!grade; };
    gradeSel.addEventListener('change',()=>{ grade=gradeSel.value?Number(gradeSel.value):null; luId=null; fillTopics(); });
    topicSel.addEventListener('change',()=>{ luId=topicSel.value||null; });
    fillTopics();
    const roleFs=el('fieldset',{className:'kl-choice-group'}); roleFs.append(el('legend',{text:`${s('studio.role')} (${s('studio.required')})`}));
    for(const [r,label,hint] of [['TEXTBOOK_EXCERPT','studio.role.textbook-excerpt','studio.role.textbook-excerpt-hint'],['LAB_INSTRUCTION','studio.role.lab-instruction','studio.role.lab-instruction-hint']] as const){
      const id=`studio-role-${r.toLowerCase()}`; const i=el('input',{attrs:{type:'radio',name:'studio-role',id,value:r,'aria-describedby':`${id}-hint`}}); if(role===r) i.checked=true;
      i.addEventListener('change',()=>{ role=r; });
      const lab=el('label',{attrs:{for:id}}); lab.append(i,document.createTextNode(` ${s(label)}`));
      roleFs.append(lab,el('p',{className:'kl-field__hint',text:s(hint),attrs:{id:`${id}-hint`}}));
    }
    const later=CONTENT_ROLES.filter(r=>r.support!=='implemented').map(r=>s(r.labelKey)).join(', ');
    form.append(field('studio-grade',s('studio.grade'),gradeSel,{required:true}),field('studio-topic',s('studio.topic'),topicSel,{required:true}),roleFs,el('p',{className:'kl-field__hint',text:s('studio.roles-later',{list:later})}),alert,buttons(false,s('studio.next'),()=>{}));
    screen.append(form);
  }
  /** forget the current PDF: revoke its viewer address so a rejected or replaced file can never be shown */
  function dropPdf(){ if(pdfUrl){ env.revokeObjectUrl(pdfUrl); pdfUrl=null; } pdfBytes=null; pdfSha=null; }
  function startDraft(){
    if(draft&&draft.role===role&&draft.target.learningUnitId===luId) return;
    dropPdf(); canonical=null;
    draft=role==='TEXTBOOK_EXCERPT'?createDraft('TEXTBOOK_EXCERPT',{kind:'TEXTBOOK_EXCERPT',excerpt:emptyExcerpt()},luId):createDraft('LAB_INSTRUCTION',{kind:'LAB_INSTRUCTION',instruction:emptyInstruction()},luId);
  }

  // ---------------------------------------------------------------- 2. To‘ldir
  function drawFill(){
    screen.append(title('studio.stage.fill'));
    const u=unit(); if(u) screen.append(el('p',{className:'kl-studio__context',text:`${s('studio.grade-option',{grade:u.grade})} · ${u.title} · ${s(role==='TEXTBOOK_EXCERPT'?'studio.role.textbook-excerpt':'studio.role.lab-instruction')}`}));
    if(draft!.payload.kind==='TEXTBOOK_EXCERPT') drawExcerptForm(draft!.payload.excerpt); else drawLabForm(draft!.payload.instruction);
  }
  function drawExcerptForm(x:ExcerptPayload){
    const status=el('p',{className:'kl-studio__file-status',attrs:{role:'status','aria-live':'polite','data-studio-file-status':''}});
    if(x.file) status.textContent=s('studio.excerpt.file-ok',{name:x.file.safeName,kb:Math.max(1,Math.round(x.file.bytes/1024))});
    const t=input('text',x.title), st=input('text',x.source.title), sa=input('text',x.source.authority), ed=input('text',x.source.edition??''), yr=input('number',x.source.year?String(x.source.year):'',{inputmode:'numeric',min:'1900',max:'2100'});
    const pf=input('number',x.pageRange?String(x.pageRange.from):'',{inputmode:'numeric',min:'1'}), pt=input('number',x.pageRange?String(x.pageRange.to):'',{inputmode:'numeric',min:'1'});
    const file=el('input',{attrs:{type:'file',accept:'application/pdf,.pdf'}});
    const author=input('text',draft!.provenance.authorName);
    const rights=el('input',{attrs:{type:'checkbox'}}); rights.checked=x.rights.status==='DOCUMENTED';
    const basis=el('textarea',{attrs:{rows:'3'}}); basis.value=x.rights.basis;
    file.addEventListener('change',async()=>{
      const f=file.files?.[0]; if(!f) return;
      const bytes=new Uint8Array(await f.arrayBuffer());
      const r=attachPdf(collect(),f.name,bytes);
      // a rejected file is dropped entirely (fail closed): no viewer address, no bytes, nothing in the draft
      if(!r.inspection.ok){ dropPdf(); status.textContent=s(PDF_REJECTION_MESSAGE[r.inspection.reason!]??'studio.excerpt.file-bad'); file.setAttribute('aria-invalid','true'); update(r.payload); return; }
      file.removeAttribute('aria-invalid');
      dropPdf();
      pdfBytes=bytes; pdfSha=r.inspection.sha256; pdfUrl=env.createObjectUrl(bytes,'application/pdf');
      update(r.payload);
      status.textContent=s('studio.excerpt.file-ok',{name:r.payload.file!.safeName,kb:Math.max(1,Math.round(bytes.length/1024))});
    });
    const num=(v:string)=>v.trim()===''?undefined:Number(v);
    const collect=():ExcerptPayload=>{
      const cur=(draft!.payload as any).excerpt as ExcerptPayload;
      const from=num(pf.value), to=num(pt.value);
      return {title:t.value,source:{title:st.value,authority:sa.value,...(ed.value.trim()?{edition:ed.value}:{}),...(num(yr.value)!==undefined?{year:num(yr.value)!}:{})},pageRange:from!==undefined||to!==undefined?{from:from??NaN,to:to??from??NaN}:null,file:cur.file,rights:{status:rights.checked?'DOCUMENTED':'NOT_DOCUMENTED',basis:basis.value}};
    };
    const update=(p:ExcerptPayload)=>{ draft={...draft!,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:p},provenance:{...draft!.provenance,authorName:author.value}}; };
    const {form,alert}=formWithAlert((_,a)=>{
      update(collect());
      const f=validateExcerpt((draft!.payload as any).excerpt,draft!.target).filter(z=>z.severity==='MISSING');
      const bad:HTMLElement[]=[];
      for(const z of f){ const c=z.field?form.querySelector<HTMLElement>(`#${FIELD_ID[z.field]}`):null; if(c) bad.push(c); }
      if(!author.value.trim()) bad.push(author);
      if(bad.length){ fail(a,bad); return; }
      go(2);
    });
    form.append(
      field('studio-x-title',s('studio.excerpt.title'),t,{required:true}),
      field('studio-x-source-title',s('studio.excerpt.source-title'),st,{required:true}),
      field('studio-x-source-authority',s('studio.excerpt.source-authority'),sa,{required:true}),
      field('studio-x-edition',s('studio.excerpt.edition'),ed),
      field('studio-x-year',s('studio.excerpt.year'),yr),
      field('studio-x-page-from',s('studio.excerpt.page-from'),pf),
      field('studio-x-page-to',s('studio.excerpt.page-to'),pt),
      field('studio-x-file',s('studio.excerpt.file'),file,{required:true,hint:s('studio.excerpt.file-hint')}),status,
      field('studio-x-author',s('studio.excerpt.author'),author,{required:true}),
    );
    const rightsRow=el('div',{className:'kl-field'}); const rl=el('label',{attrs:{for:'studio-x-rights'}}); rights.id='studio-x-rights'; rl.append(rights,document.createTextNode(` ${s('studio.excerpt.rights')}`)); rightsRow.append(rl);
    form.append(rightsRow,field('studio-x-rights-basis',s('studio.excerpt.rights-basis'),basis),alert,buttons(true,s('studio.next'),()=>{}));
    screen.append(form);
  }
  function drawLabForm(x:LabInstructionPayload){
    const src=labSource();
    const info=el('p',{className:'kl-notice',attrs:{role:'status','aria-live':'polite','data-studio-lab-source':''}});
    const goal=el('textarea',{attrs:{rows:'2'}}); goal.value=x.goal;
    const eq=el('textarea',{attrs:{rows:'2'}}); eq.value=x.equipment;
    const ma=el('textarea',{attrs:{rows:'2'}}); ma.value=x.materials;
    const sa=el('textarea',{attrs:{rows:'2'}}); sa.value=x.safety;
    const steps=el('textarea',{attrs:{rows:'8',spellcheck:'false'}}); steps.value=x.steps.join('\n');
    const collect=():LabInstructionPayload=>({goal:goal.value,equipment:eq.value,materials:ma.value,safety:sa.value,steps:stepsFromText(steps.value)});
    const {form,alert}=formWithAlert((_,a)=>{
      draft={...draft!,payload:{kind:'LAB_INSTRUCTION',instruction:collect()}};
      if(!stepsFromText(steps.value).length){ fail(a,[steps]); return; }
      void ensureCanonical().then(()=>go(2));
    });
    if(src){
      const b=el('button',{className:'kl-button kl-button--secondary',text:s('studio.lab.start-from-existing'),attrs:{type:'button','data-studio-start-existing':''}});
      b.addEventListener('click',()=>{ const i=instructionFromLegacy(src.goal,src.legacy); goal.value=i.goal; eq.value=i.equipment; ma.value=i.materials; sa.value=i.safety; steps.value=i.steps.join('\n'); draft={...draft!,provenance:{...draft!.provenance,basis:'CANONICAL_INSTRUCTION',canonicalActivityId:src.practiceActivityId}}; info.textContent=s('studio.lab.started-from-existing'); steps.focus(); });
      form.append(b);
    }else info.textContent=s('studio.lab.no-existing');
    form.append(info,field('studio-lab-goal',s('studio.lab.goal'),goal),field('studio-lab-equipment',s('studio.lab.equipment'),eq),field('studio-lab-materials',s('studio.lab.materials'),ma),field('studio-lab-safety',s('studio.lab.safety'),sa),
      field('studio-lab-steps',s('studio.lab.steps'),steps,{required:true,hint:s('studio.lab.steps-hint')}),alert,buttons(true,s('studio.next'),()=>{}));
    screen.append(form);
  }
  async function ensureCanonical(){
    const src=labSource();
    if(!src||canonical) return;
    const [page,profile]=await Promise.all([content.loadPractice(src.practiceActivityId),content.loadTopicLabProfile(src.practiceActivityId)]);
    canonical={page,profile};
  }

  // ---------------------------------------------------------------- 3. Ko‘r
  function drawPreview(){
    screen.append(title('studio.stage.preview'));
    const modeFs=el('fieldset',{className:'kl-choice-group kl-studio__mode'}); modeFs.append(el('legend',{text:s('studio.preview.mode')}));
    for(const [m,k] of [['desktop','studio.preview.desktop'],['mobile','studio.preview.mobile']] as const){ const id=`studio-mode-${m}`; const i=el('input',{attrs:{type:'radio',name:'studio-mode',id,value:m}}); if(previewMode===m) i.checked=true; i.addEventListener('change',()=>{ previewMode=m; frame.dataset.mode=m; }); const l=el('label',{attrs:{for:id}}); l.append(i,document.createTextNode(` ${s(k)}`)); modeFs.append(l); }
    const frame=el('div',{className:'kl-studio__frame',attrs:{role:'region','aria-label':s('studio.preview.frame'),'data-mode':previewMode,'data-studio-preview':''}});
    // the preview never navigates away (learner links are inert inside it); downloads still work
    frame.addEventListener('click',e=>{ const a=(e.target as HTMLElement).closest('a'); if(a&&!a.hasAttribute('download')) e.preventDefault(); });
    const learner=el('div',{className:'kl-studio__learner'}); frame.append(learner);
    screen.append(modeFs);
    const notes=el('div',{className:'kl-studio__notes'});
    let shown:PreviewEvidence={kind:'NOTHING_SHOWN'};
    if(draft!.payload.kind==='TEXTBOOK_EXCERPT'){
      const x=draft!.payload.excerpt;
      // only the accepted file the draft records is drawn; anything else shows no viewer and counts as no preview
      if(x.file&&pdfUrl&&pdfSha===x.file.sha256&&!x.file.activeContent.length){ renderTextbookExcerpt(learner,{title:x.title,source:x.source,pageRange:x.pageRange,file:{name:x.file.safeName,bytes:x.file.bytes}},{fileUrl:pdfUrl,localize:learnerLocalize}); shown={kind:'EXCERPT_PDF_SHOWN',sha256:pdfSha}; }
      else learner.append(el('p',{text:s('studio.preview.excerpt-empty')}));
      screen.append(frame);
    }else{
      const x=draft!.payload.instruction;
      const pv=previewProfile(x,canonical?.profile??null);
      if(pv.profile&&canonical){ renderDynamicLab(learner,canonical.page,pv.profile); if(pv.profile.completionScope.kind==='PARTIAL_INSTRUCTION') notes.append(el('p',{className:'kl-notice',text:s('studio.preview.partial')})); }
      else learner.append(el('p',{className:'kl-notice',text:s(pv.state==='INSTRUCTION_CHANGED'?'studio.preview.instruction-changed':'studio.preview.no-profile')}));
      screen.append(frame,notes);
      if(pv.profile?.completionScope.uncovered.length){
        notes.append(el('p',{text:s('studio.preview.uncovered')})); const ul=el('ul',{attrs:{'data-studio-uncovered':''}});
        for(const u of pv.profile.completionScope.uncovered) ul.append(el('li',{text:s('studio.preview.uncovered-item',{n:u.instructionStep+1,verb:u.verb,reason:s(UNCOVERED_REASON[u.reason]??'studio.reason.ambiguous')})}));
        notes.append(ul);
      }
      const ops=analyzeInstruction(x,registry);
      const analysis=el('section',{className:'kl-studio__analysis',attrs:{'aria-labelledby':'studio-analysis-title'}}); analysis.append(el('h3',{text:s('studio.preview.lab-analysis'),attrs:{id:'studio-analysis-title'}}));
      const ol=el('ol',{attrs:{'data-studio-analysis':''}});
      x.steps.forEach((text,i)=>{ const li=el('li'); li.append(el('p',{className:'kl-studio__step-text',text})); const mine=ops.filter(o=>o.step===i); const ul=el('ul'); if(!mine.length) ul.append(el('li',{text:s('studio.preview.no-operations')})); for(const o of mine) ul.append(el('li',{text:`«${o.verb}» — ${s(o.messageKey)}`,attrs:{'data-severity':o.severity}})); li.append(ul); ol.append(li); });
      analysis.append(ol); screen.append(analysis);
      shown={kind:'LAB_PREVIEW_SHOWN'};
    }
    draft=markPreviewed(draft!,shown);
    const {form}=formWithAlert(()=>go(3)); form.append(buttons(true,s('studio.next'),()=>{})); screen.append(form);
  }

  // ---------------------------------------------------------------- 4. Tekshir
  function findings():StudioFinding[]{
    if(draft!.payload.kind==='TEXTBOOK_EXCERPT') return validateExcerpt(draft!.payload.excerpt,draft!.target);
    return labFindings(draft!.payload.instruction,draft!.target,registry,canonical?.profile??null);
  }
  function drawCheck(){
    screen.append(title('studio.stage.check'));
    const previewed=draft!.preview.viewedRevision;
    draft=withValidation(draft!,findings());
    // validating does not count as a new preview: the preview mark stays bound to what the author looked at
    draft={...draft!,preview:{viewedRevision:previewed}};
    const v=draft.validation;
    const box=el('div',{className:'kl-studio__check',attrs:{'data-studio-status':v.status}});
    box.append(el('h3',{text:`${s('studio.check.heading')}: ${s(`studio.status.${v.status}`)}`,attrs:{tabindex:'-1'}}));
    const ul=el('ul',{attrs:{'data-studio-findings':''}});
    if(!v.findings.length) ul.append(el('li',{text:s('studio.check.all-ready')}));
    for(const f of v.findings){
      const li=el('li',{attrs:{'data-severity':f.severity}}); li.append(el('strong',{text:`${s(`studio.severity.${f.severity}`)}: `}),document.createTextNode(s(f.messageKey)));
      if(f.field&&f.severity==='MISSING'){ const b=el('button',{className:'kl-button kl-button--secondary kl-studio__fix',text:s('studio.check.fix'),attrs:{type:'button'}}); b.addEventListener('click',()=>{ go(1); screen.querySelector<HTMLElement>(`#${FIELD_ID[f.field!]}`)?.focus(); }); li.append(document.createTextNode(' '),b); }
      ul.append(li);
    }
    box.append(ul); screen.append(box);
    const {form}=formWithAlert(()=>go(4)); form.append(buttons(true,s('studio.next'),()=>{})); screen.append(form);
  }

  // ---------------------------------------------------------------- 5. Nashrga tayyorla
  function drawPrepare(){
    screen.append(title('studio.stage.prepare'));
    screen.append(el('p',{text:s('studio.prepare.explain')}),el('p',{className:'kl-notice',text:s('studio.prepare.no-publish')}));
    screen.append(el('p',{text:s('studio.prepare.gates')}));
    const gates=el('ul'); for(const g of draft!.role==='TEXTBOOK_EXCERPT'?['studio.prepare.gate.source','studio.prepare.gate.rights','studio.prepare.gate.didactic']:['studio.prepare.gate.chemistry','studio.prepare.gate.didactic']) gates.append(el('li',{text:s(g)})); screen.append(gates);
    const out=el('div',{attrs:{role:'status','aria-live':'polite','data-studio-prepare-result':''}});
    const {form}=formWithAlert(()=>{
      clear(out);
      const derived=draft!.payload.kind==='LAB_INSTRUCTION'?labDerived(draft!.payload.instruction,registry,canonical?.profile??null):undefined;
      const r=buildPublishCandidate(draft!,{...(pdfBytes?{pdf:pdfBytes}:{}),...(derived?{labDerived:derived}:{})});
      if(!r.candidate){ out.append(el('p',{text:s('studio.prepare.blocked')})); const ul=el('ul',{attrs:{'data-studio-blockers':''}}); for(const b of r.blockers) ul.append(el('li',{text:s(`studio.blocker.${b}`)})); out.append(ul); return; }
      if(candidateUrl) env.revokeObjectUrl(candidateUrl);
      candidateUrl=env.createObjectUrl(new TextEncoder().encode(serializeCandidate(r.candidate)),'application/json');
      draft={...draft!,publish:{state:'PACKAGE_PREPARED',packageRevision:r.candidate.candidateRevision}};
      const u=unit();
      out.append(el('p',{text:s('studio.prepare.ready')}),el('a',{className:'kl-button kl-button--primary',text:s('studio.prepare.download'),attrs:{href:candidateUrl,download:`nashrga-tayyor-${u?.grade??''}-sinf.json`,'data-studio-download':''}}));
      (out.querySelector('a') as HTMLElement).focus();
    });
    const row=el('div',{className:'kl-practice-controls'}); const back=el('button',{className:'kl-button kl-button--secondary',text:s('studio.back'),attrs:{type:'button','data-studio-back':''}}); back.addEventListener('click',()=>go(3));
    row.append(back,el('button',{className:'kl-button kl-button--primary',text:s('studio.prepare.button'),attrs:{type:'submit','data-studio-prepare':''}}));
    form.append(row); screen.append(form,out);
  }

  function draw(){ clear(screen); drawNav(); [drawChoose,drawFill,drawPreview,drawCheck,drawPrepare][stage]!(); }
  draw();
  return {state:()=>({stage,draft})};
}
