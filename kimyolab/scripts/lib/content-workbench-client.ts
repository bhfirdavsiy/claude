// P2.4 — browser side of the governed content workbench (ADR-P2-005), embedded into review-packets/reviewer-workspace.html
// next to the P1.8 review tabs. Plain ES2020, no dependencies, no network. Every rule (content hash, dual review,
// stale detection, source state, duplicates) comes from globalThis.KL_GOV — the type-stripped domain modules the
// governed apply runs (scripts/lib/browser-module-bundle.ts). The page never writes the repository: it downloads
// packets / intake entries / option-set drafts that a person then imports (npm run theory:import / theory:apply …).
// Nothing is prefilled with content or identity: empty slots stay empty until a person types.

export const CONTENT_WORKBENCH_CSS=`
.cw-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.cw-block{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0;background:#fff}
.cw-block h4{margin:0 0 8px;font-size:15px}
.cw-block label{display:grid;gap:4px;font-size:12px;font-weight:800;color:var(--muted);margin:6px 0}
.cw-block input[type=text],.cw-block textarea,.cw-block select,.cw-form input,.cw-form select,.cw-form textarea{border:1px solid var(--line);border-radius:10px;padding:8px;background:#fff;color:var(--navy);width:100%}
.cw-block textarea{min-height:70px}
.cw-gov{font-size:12px;border-radius:10px;padding:8px 10px;margin-top:8px;background:#f1f6fc;overflow-wrap:anywhere}
.cw-gov.ok{background:var(--greenbg);color:var(--green)}.cw-gov.warn{background:var(--yellowbg);color:var(--yellow)}.cw-gov.bad{background:var(--redbg);color:var(--red)}
.cw-hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.cw-sources{display:flex;flex-wrap:wrap;gap:8px}.cw-sources label{display:inline-flex;flex-direction:row;gap:5px;align-items:center;font-weight:600;color:var(--navy)}
.cw-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cw-form label{display:grid;gap:4px;font-size:12px;font-weight:800;color:var(--muted)}
@media(max-width:980px){.cw-grid,.cw-form{grid-template-columns:1fr}}`;

export const CONTENT_WORKBENCH_JS=String.raw`
(function(){
var G=globalThis.KL_GOV;var C=JSON.parse(document.getElementById('content-workbench-data').textContent);
var KEY='kimyolab-content-workbench:'+C.fingerprint;
var S={theory:{},intake:{},options:{}};try{var raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function el(tag,attrs,children){var n=document.createElement(tag);if(attrs)for(var k in attrs){var v=attrs[k];if(v===null||v===undefined||v===false)continue;if(k==='text')n.textContent=String(v);else if(k==='class')n.className=v;else n.setAttribute(k,v===true?'':String(v))}(children||[]).forEach(function(c){if(c===null||c===undefined)return;n.appendChild(typeof c==='string'?document.createTextNode(c):c)});return n}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);return n}
function clone(v){return JSON.parse(JSON.stringify(v))}
function short(h){return h?String(h).slice(0,12)+'…':'—'}
function nowIso(){return new Date().toISOString()}
function download(name,obj){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)+'\n'],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}
function readFile(input,cb){var f=input.files&&input.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{cb(JSON.parse(String(r.result)))}catch(e){alert('JSON o‘qilmadi: '+e.message)}input.value=''};r.readAsText(f)}
var registry={byId:new Map(C.sources.map(function(s){return [s.id,s]}))};
function reviewerIdentity(){var id=(document.getElementById('wbReviewerId').value||'').trim(),role=document.getElementById('wbReviewerRole').value;return {id:id,role:role}}
function sameId(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase()}
function lines(t){return String(t||'').split('\n').map(function(x){return x.trim()}).filter(Boolean)}
var STATE_TEXT={APPROVED:'APPROVED — ikki inson bir xil hash’ni tasdiqlagan',REVIEW_PENDING:'REVIEW_PENDING',STALE_REVIEW:'STALE — review eski revision’ga tegishli',CHANGES_REQUESTED:'CHANGES_REQUESTED',DRAFT:'DRAFT'};

// ================================================================ structured theory
var unitSel=document.getElementById('ctUnit'),gradeSel=document.getElementById('ctGrade'),authorIn=document.getElementById('ctAuthor');
authorIn.value=S.author||'';authorIn.addEventListener('change',function(){S.author=authorIn.value.trim();save();renderTheory()});
function basePacket(lu){var p=C.packets.find(function(x){return x.learningUnit.id===lu});return Object.assign(clone(p),{sourceRequirements:C.sourceRequirements,reviewChecklist:C.reviewChecklist})}
function packetFor(lu){if(!S.theory[lu])S.theory[lu]=basePacket(lu);return S.theory[lu]}
function fillUnits(){var g=gradeSel.value;clear(unitSel);C.packets.filter(function(p){return g==='all'||String(p.learningUnit.grade)===g}).forEach(function(p){unitSel.appendChild(el('option',{value:p.learningUnit.id,text:p.learningUnit.id+' — '+p.learningUnit.title+(S.theory[p.learningUnit.id]?' (tahrirda)':'')}))});if(S.unit&&[].some.call(unitSel.options,function(o){return o.value===S.unit}))unitSel.value=S.unit}
var grades=[];C.packets.forEach(function(p){if(grades.indexOf(p.learningUnit.grade)<0)grades.push(p.learningUnit.grade)});grades.sort(function(a,b){return a-b}).forEach(function(g){gradeSel.appendChild(el('option',{value:String(g),text:g+'-sinf'}))});
gradeSel.addEventListener('change',function(){fillUnits();S.unit=unitSel.value;save();renderTheory()});
unitSel.addEventListener('change',function(){S.unit=unitSel.value;save();renderTheory()});
function slotOf(p,name){var m=/^(workedExamples|misconceptions)\[(\d+)\]$/.exec(name);return m?p.slots[m[1]][Number(m[2])]:p.slots[name]}
function touch(p,slot){var a=(S.author||'').trim();slot.authoredBy=a||null;save()}
function govPanel(p,name){
  var conv=G.packetToEntry(p).entry;var blk=null;G.contentBlocks(conv).forEach(function(b){if(b.name===name)blk=b.block});
  var g=G.blockGovernance(blk||{});var box=el('div',{class:'cw-gov '+(g.state==='APPROVED'?'ok':g.state==='STALE_REVIEW'||g.state==='CHANGES_REQUESTED'?'warn':''),'data-gov':name,role:'status'});
  box.appendChild(el('div',{text:'Holat: '+(STATE_TEXT[g.state]||g.state)}));
  box.appendChild(el('div',{class:'cw-hash',text:'Joriy hash: '+g.currentHash}));
  ['chemistry','didactic'].forEach(function(role){var r=(blk&&blk.reviews||[]).filter(function(x){return x.reviewerRole===role}).slice(-1)[0];
    box.appendChild(el('div',{class:'cw-hash','data-review-hash':role,text:role+' review: '+(r?(r.decision+' · '+r.reviewerId+' · '+short(r.reviewedHash)+(r.reviewedHash===g.currentHash?' (joriy)':' (STALE)')):'yo‘q')}))});
  if(g.issues.length)box.appendChild(el('div',{class:'wb-flag',text:'Muammo: '+g.issues.join(', ')}));
  return box}
function sourcesPicker(slot,name,onChange){var wrap=el('div',{class:'cw-sources',role:'group','aria-label':name+' manbalari'});
  C.acceptableSources.forEach(function(s){var id='cs-'+name.replace(/[^a-z0-9]/gi,'_')+'-'+s.id.replace(/[^a-z0-9]/gi,'_');var cb=el('input',{type:'checkbox',id:id});cb.checked=(slot.sourceRefs||[]).indexOf(s.id)>=0;
    cb.addEventListener('change',function(){slot.sourceRefs=C.acceptableSources.map(function(x){return x.id}).filter(function(x){var c=document.getElementById('cs-'+name.replace(/[^a-z0-9]/gi,'_')+'-'+x.replace(/[^a-z0-9]/gi,'_'));return c&&c.checked});onChange()});
    wrap.appendChild(el('label',{for:id},[cb,s.id+' ('+s.category+', '+(s.canonicalAuthoringEligible?'HUMAN_ACCEPTED':'PROPOSED — kanonik apply uchun yaroqsiz')+')']))});
  if(!C.acceptableSources.length)wrap.appendChild(el('span',{class:'wb-flag',text:'Qabul qilinadigan manba ro‘yxatda yo‘q — avval Manbalar bo‘limida manba qo‘shilsin.'}));
  return wrap}
function textField(label,value,onInput,multi){var id='f'+Math.random().toString(36).slice(2);var input=multi?el('textarea',{id:id}):el('input',{type:'text',id:id});input.value=value||'';input.addEventListener('input',function(){onInput(input.value)});return el('label',{for:id},[label,input])}
function reviewButtons(p,name){var wrap=el('div',{class:'actions'});
  [['approved','Tasdiqlash (joriy hash)'],['changes-requested','O‘zgartirish so‘rash']].forEach(function(d){var b=el('button',{type:'button',class:'btn','data-review':d[0],text:d[1]});b.addEventListener('click',function(){recordReview(p,name,d[0])});wrap.appendChild(b)});return wrap}
function recordReview(p,name,decision){var who=reviewerIdentity();var slot=slotOf(p,name);var err='';
  if(!who.id)err='Reviewer ID kiriting (yuqoridagi Reviewer bo‘limi).';else if(G.isAutomationIdentity(who.id))err='Avtomatlashtirish identity review bera olmaydi.';else if(who.role!=='chemistry'&&who.role!=='didactic')err='Rol chemistry yoki didactic bo‘lishi kerak.';else if(slot.authoredBy&&sameId(slot.authoredBy,who.id))err='Muallif o‘z blokini review qila olmaydi.';
  var other=(slot.reviews||[]).find(function(r){return r.reviewerRole!==who.role&&sameId(r.reviewerId,who.id)});if(!err&&other)err='Bir kishi ikkala rolda review qila olmaydi.';
  if(err){showTheoryError(err);return}
  var entry=G.packetToEntry(p).entry;var hash=null;G.contentBlocks(entry).forEach(function(b){if(b.name===name)hash=G.blockContentHash(b.block)});
  slot.reviews=(slot.reviews||[]).filter(function(r){return !(r.reviewerRole===who.role&&sameId(r.reviewerId,who.id))});
  slot.reviews.push({reviewerId:who.id,reviewerRole:who.role,decision:decision,reviewedAt:nowIso(),reviewedHash:hash});save();renderTheory()}
function showTheoryError(msg){var e=document.getElementById('ctError');e.textContent=msg;e.hidden=!msg;if(msg)e.focus()}
function refreshGov(p){document.querySelectorAll('#ctEditor [data-gov]').forEach(function(old){old.replaceWith(govPanel(p,old.getAttribute('data-gov')))});renderTheorySummary(p)}
function blockShell(p,name,title,body){var slot=slotOf(p,name);var st=el('select',{'aria-label':title+' holati'});[['draft','draft'],['ready-for-review','ready-for-review']].forEach(function(o){st.appendChild(el('option',{value:o[0],text:o[1]}))});st.value=slot.status||'draft';st.addEventListener('change',function(){slot.status=st.value;touch(p,slot);refreshGov(p)});
  return el('section',{class:'cw-block','aria-label':title,'data-block':name},[el('h4',{text:title}),el('div',{class:'wb-note',text:'Muallif: '+(slot.authoredBy||'— (kiritilmagan)')})].concat(body,[el('div',{class:'wb-note',text:'Manbalar:'}),sourcesPicker(slot,name,function(){touch(p,slot);refreshGov(p)}),el('label',{},['Muallif holati',st]),govPanel(p,name),reviewButtons(p,name)]))}
function renderTheory(){
  fillUnits();var lu=unitSel.value;if(!lu)return;S.unit=lu;var p=packetFor(lu);showTheoryError('');
  var facts=clear(document.getElementById('ctFacts'));var u=p.learningUnit;
  facts.appendChild(el('dl',{},[['Sinf',u.grade],['Mavzu',u.title],['Bob',u.chapter],['Natijalar',p.learningOutcomes.join(' · ')],['Konseptlar',p.concepts.map(function(c){return c.name||c.id}).join(', ')],['Hozirgi nazariya',p.currentTheory.depth+' — '+p.currentTheory.legacyBlocks.map(function(b){return b.text}).join(' / ')],['Mavjud qabul qilingan manbalar',C.acceptableSources.map(function(s){return s.id}).join(', ')||'yo‘q'],['Repozitoriy holati',(C.unitStatus[lu]||{}).state||'—']].reduce(function(a,r){a.push(el('dt',{text:r[0]}));a.push(el('dd',{text:r[1]===null||r[1]===undefined||r[1]===''?'—':String(r[1])}));return a},[])));
  if(!(S.author||'').trim())facts.appendChild(el('p',{class:'notice warn',text:'Muallif ID kiritilmagan: tahrir qilingan bloklarda muallif bo‘sh qoladi va apply rad etiladi. Hech qanday standart identity qo‘yilmaydi.'}));
  var ed=clear(document.getElementById('ctEditor'));var s=p.slots;
  ed.appendChild(textField('Versiya (masalan 1.0.0)',s.version,function(v){s.version=v.trim()||null;save();renderTheorySummary(p)}));
  ed.appendChild(blockShell(p,'explanation','Tushuntirish (≥'+(s.explanation.minChars||300)+' belgi)',[textField('Matn',s.explanation.text,function(v){s.explanation.text=v||null;touch(p,s.explanation);refreshGov(p)},true)]));
  s.workedExamples.forEach(function(w,i){ed.appendChild(blockShell(p,'workedExamples['+i+']',(i+1)+'-ishlangan misol',[textField('Masala sharti',w.problem,function(v){w.problem=v||null;touch(p,w);refreshGov(p)},true),textField('Yechim qadamlari (har qatorda bitta)',(w.solutionSteps||[]).join('\n'),function(v){w.solutionSteps=lines(v);touch(p,w);refreshGov(p)},true),textField('Javob',w.answer,function(v){w.answer=v||null;touch(p,w);refreshGov(p)})]))});
  s.misconceptions.forEach(function(m,i){ed.appendChild(blockShell(p,'misconceptions['+i+']',(i+1)+'-noto‘g‘ri tushuncha',[textField('Xato fikr',m.statement,function(v){m.statement=v||null;touch(p,m);refreshGov(p)},true),textField('To‘g‘ri izoh',m.correction,function(v){m.correction=v||null;touch(p,m);refreshGov(p)},true)]))});
  ed.appendChild(blockShell(p,'summary','Xulosa',[textField('Xulosa bandlari (har qatorda bitta)',(s.summary.points||[]).join('\n'),function(v){s.summary.points=lines(v);touch(p,s.summary);refreshGov(p)},true)]));
  var add=el('div',{class:'actions'});
  [['ctAddExample','+ misol',function(){s.workedExamples.push({problem:null,solutionSteps:[],answer:null,sourceRefs:[],authoredBy:null,status:'draft',reviews:[]})}],['ctAddMis','+ noto‘g‘ri tushuncha',function(){s.misconceptions.push({statement:null,correction:null,sourceRefs:[],authoredBy:null,status:'draft',reviews:[]})}]].forEach(function(b){var btn=el('button',{type:'button',class:'btn',id:b[0],text:b[1]});btn.addEventListener('click',function(){b[2]();save();renderTheory()});add.appendChild(btn)});
  ed.appendChild(add);renderTheorySummary(p)}
function renderTheorySummary(p){var box=clear(document.getElementById('ctSummary'));var r=G.packetToEntry(p);var entry=r.entry;
  var v=G.validateStructuredTheory(entry,registry);var state=G.theoryReviewState(entry);
  var srcIssues=[];G.contentBlocks(entry).forEach(function(b){G.canonicalSourceIssues(b.block.sourceRefs||[],registry).forEach(function(i){srcIssues.push(i.code+'@'+b.name+':'+i.ref)})});
  v={issues:v.issues.filter(function(i){return i.code!=='SOURCE_UNREGISTERED'&&i.code!=='SOURCE_NOT_ACCEPTABLE'}).concat(srcIssues.map(function(x){return {code:x.split('@')[0],where:x.split('@')[1]}}))};
  box.appendChild(el('div',{class:'cw-gov '+(state==='APPROVED'&&!v.issues.length&&!r.issues.length?'ok':'warn'),'data-theory-state':state},[el('strong',{text:'Nazariya holati: '+state}),el('div',{text:v.issues.length||r.issues.length?'Apply’ga to‘sqinlar: '+r.issues.concat(v.issues.map(function(i){return i.code+'@'+i.where})).join(', '):'Validatsiya: muammo yo‘q'})]))}
document.getElementById('ctExport').addEventListener('click',function(){var lu=unitSel.value;var p=packetFor(lu);var out=G.packetWithEntry(p,G.packetToEntry(p).entry);out.slots.version=p.slots.version||null;download('theory-packet.'+lu+'.json',out)});
document.getElementById('ctImport').addEventListener('change',function(){readFile(this,function(pk){var r=G.packetToEntry(pk);if(r.issues.indexOf('PACKET_SCHEMA')>=0||!pk.learningUnit||!C.packets.some(function(x){return x.learningUnit.id===pk.learningUnit.id})){showTheoryError('Bu fayl nazariya packet’i emas yoki mavzu noma’lum.');return}S.theory[pk.learningUnit.id]=pk;S.unit=pk.learningUnit.id;gradeSel.value='all';save();renderTheory()})});
document.getElementById('ctReset').addEventListener('click',function(){var lu=unitSel.value;if(confirm(lu+' uchun lokal tahrirni o‘chirasizmi?')){delete S.theory[lu];save();renderTheory()}});

// ================================================================ sources
function renderSources(){
  var reg=clear(document.getElementById('csRegistry'));C.sources.forEach(function(s){reg.appendChild(el('li',{},[el('strong',{text:s.id}),' · '+s.category+' · '+s.classification+' — '+s.title]))});
  var q=clear(document.getElementById('csQueue'));if(!C.intake.length)q.appendChild(el('p',{class:'wb-note',text:'Navbat bo‘sh: hali hech kim manba taklif qilmagan.'}));
  C.intake.forEach(function(e){var card=el('div',{class:'wb-card'},[el('h3',{text:e.sourceId+' — '+e.title}),el('div',{class:'wb-badges'},[el('span',{class:'wb-badge',text:e.state}),el('span',{class:'wb-badge',text:e.category})]),el('div',{class:'cw-hash',text:'hash '+e.currentHash}),e.issues.length?el('div',{class:'wb-flag',text:e.issues.join(', ')}):null,e.duplicates.length?el('div',{class:'wb-flag',text:'Takror: '+e.duplicates.map(function(d){return d.code+' '+d.with}).join(', ')}):null]);
    var b=el('button',{type:'button',class:'btn',text:'Review uchun ochish'});b.addEventListener('click',function(){S.source=clone(C.intakeEntries[e.sourceId]);save();renderIntake()});card.appendChild(b);q.appendChild(card)})}
var F=['sourceId','category','title','authority','edition','year','language','authors','isbn','identifier','url','locator','documentName','documentSha256','submittedBy','status'];
function formEntry(){var v={};F.forEach(function(k){v[k]=(document.getElementById('csf-'+k).value||'').trim()});
  var e={schema:'kimyolab.source-intake.v1',sourceId:v.sourceId,category:v.category,title:v.title,authority:v.authority,language:v.language,bibliographic:{},locator:{kind:v.locator||'none'},submittedBy:v.submittedBy,status:v.status||'draft',reviews:(S.source&&S.source.reviews)||[]};
  if(v.edition)e.edition=v.edition;if(v.year)e.year=Number(v.year);if(v.authors)e.bibliographic.authors=v.authors.split(';').map(function(x){return x.trim()}).filter(Boolean);['isbn','identifier','url'].forEach(function(k){if(v[k])e.bibliographic[k]=v[k]});
  if(v.documentName||v.documentSha256)e.document={fileName:v.documentName,sha256:v.documentSha256};return e}
function fillForm(e){var m={sourceId:e.sourceId,category:e.category,title:e.title,authority:e.authority,edition:e.edition,year:e.year,language:e.language,authors:(e.bibliographic&&e.bibliographic.authors||[]).join('; '),isbn:e.bibliographic&&e.bibliographic.isbn,identifier:e.bibliographic&&e.bibliographic.identifier,url:e.bibliographic&&e.bibliographic.url,locator:e.locator&&e.locator.kind,documentName:e.document&&e.document.fileName,documentSha256:e.document&&e.document.sha256,submittedBy:e.submittedBy,status:e.status};F.forEach(function(k){document.getElementById('csf-'+k).value=m[k]===undefined||m[k]===null?'':String(m[k])})}
function renderIntake(){if(S.source)fillForm(S.source);liveIntake()}
function liveIntake(){var e=formEntry();S.source=e;save();var g=G.sourceGovernance(e);var dups=G.detectSourceDuplicates([e],C.sources.concat(C.intake.filter(function(x){return x.sourceId!==e.sourceId}).map(function(x){return {id:x.sourceId,title:x.title}}))).get(e.sourceId)||[];
  var box=clear(document.getElementById('csLive'));box.className='cw-gov '+(g.state==='APPROVED'?'ok':g.issues.length||dups.length?'warn':'');box.setAttribute('data-source-state',g.state);
  box.appendChild(el('div',{text:'Holat: '+g.state}));box.appendChild(el('div',{class:'cw-hash',text:'Joriy hash: '+g.currentHash}));
  if(g.decision)box.appendChild(el('div',{text:'Qaror: '+g.decision.decision+' · '+g.decision.reviewerId+' · '+g.decision.acceptedCategory}));if(g.stale.length)box.appendChild(el('div',{text:'Eski (STALE) qarorlar: '+g.stale.length}));
  if(g.issues.length)box.appendChild(el('div',{class:'wb-flag',text:'Muammo: '+g.issues.join(', ')}));if(dups.length)box.appendChild(el('div',{class:'wb-flag',text:'Takror: '+dups.map(function(d){return d.code+' '+d.with}).join(', ')}))}
F.forEach(function(k){var n=document.getElementById('csf-'+k);n.addEventListener(n.tagName==='SELECT'?'change':'input',liveIntake)});
document.getElementById('csDocFile').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;f.arrayBuffer().then(function(buf){return crypto.subtle.digest('SHA-256',buf)}).then(function(d){document.getElementById('csf-documentName').value=f.name;document.getElementById('csf-documentSha256').value=Array.from(new Uint8Array(d)).map(function(b){return b.toString(16).padStart(2,'0')}).join('');liveIntake()}).catch(function(){alert('Hash hisoblanmadi (brauzer WebCrypto’ni bermadi).')})});
document.getElementById('csReview').addEventListener('click',function(){var who=reviewerIdentity();var e=formEntry();var dec=document.getElementById('csDecision').value,cat=document.getElementById('csAccepted').value;var err='';
  if(!who.id)err='Reviewer ID kiriting.';else if(G.isAutomationIdentity(who.id))err='Avtomatlashtirish manbani tasdiqlay olmaydi.';else if(sameId(who.id,e.submittedBy))err='Manbani taklif qilgan kishi uni o‘zi tasdiqlay olmaydi.';else if(!dec)err='Qarorni tanlang.';else if(!cat)err='Qabul qilinadigan kategoriyani inson tanlaydi.';
  var box=document.getElementById('csError');box.textContent=err;box.hidden=!err;if(err)return;
  e.reviews=(e.reviews||[]).filter(function(r){return !sameId(r.reviewerId,who.id)});e.reviews.push({reviewerId:who.id,decision:dec,acceptedCategory:cat,reviewedAt:nowIso(),reviewedHash:G.sourceEntryHash(e)});S.source=e;save();liveIntake()});
document.getElementById('csExport').addEventListener('click',function(){var e=formEntry();download((e.sourceId||'source')+'.json',e)});
document.getElementById('csImport').addEventListener('change',function(){readFile(this,function(e){S.source=e;save();renderIntake()})});
document.getElementById('csNew').addEventListener('click',function(){S.source=null;F.forEach(function(k){document.getElementById('csf-'+k).value=''});save();liveIntake()});

// ================================================================ option sets
function optKey(f){return f.activityId+'|'+f.field}
function renderOptions(){var list=clear(document.getElementById('coList'));C.optionFields.forEach(function(f){var d=S.options[optKey(f)];var state=d?G.optionSetGovernance(d).state:'—';
  var card=el('div',{class:'wb-card'},[el('h3',{text:f.activityTitle+' · '+f.fieldLabel}),el('div',{class:'wb-badges'},[el('span',{class:'wb-badge',text:f.learningUnitId}),el('span',{class:'wb-badge',text:'maqsad: '+f.canonicalTarget}),el('span',{class:'wb-badge',text:d?'tahrirda · '+state:'AWAITING_HUMAN_AUTHOR'})])]);
  var b=el('button',{type:'button',class:'btn',text:'Variantlarni yozish'});b.addEventListener('click',function(){S.optionKey=optKey(f);if(!S.options[optKey(f)])S.options[optKey(f)]={schema:'kimyolab.option-set-draft.v1',activityId:f.activityId,field:f.field,options:[],sourceRefs:[],authoredBy:null,status:'draft',reviews:[]};save();renderOptionEditor()});card.appendChild(b);list.appendChild(card)})}
function renderOptionEditor(){var box=clear(document.getElementById('coEditor'));var key=S.optionKey;var d=key&&S.options[key];if(!d)return;var f=C.optionFields.find(function(x){return optKey(x)===key});
  box.appendChild(el('h3',{text:f.activityTitle+' · '+f.fieldLabel+' (maqsad: '+f.canonicalTarget+')'}));
  box.appendChild(el('p',{class:'wb-note',text:'Har qatorda: qiymat | o‘zbekcha yorliq | (distraktor uchun) qaysi xato tushunchani tekshiradi. Platforma variant yoki distraktor taklif qilmaydi.'}));
  var ta=el('textarea',{id:'coOptions','aria-label':'Variantlar'});ta.value=d.options.map(function(o){return [o.value,o.label,o.rationale||''].join(' | ')}).join('\n');
  ta.addEventListener('input',function(){d.options=lines(ta.value).map(function(l){var p=l.split('|').map(function(x){return x.trim()});var o={value:p[0]||'',label:p[1]||''};if(p[2])o.rationale=p[2];return o});d.authoredBy=(S.author||'').trim()||null;save();optionGov()});
  box.appendChild(el('label',{for:'coOptions'},['Variantlar',ta]));box.appendChild(sourcesPicker(d,'option',function(){d.authoredBy=(S.author||'').trim()||null;save();optionGov()}));
  var gov=el('div',{id:'coGov'});box.appendChild(gov);var acts=el('div',{class:'actions'});
  [['approved','Tasdiqlash (joriy hash)'],['changes-requested','O‘zgartirish so‘rash']].forEach(function(x){var b=el('button',{type:'button',class:'btn',text:x[1]});b.addEventListener('click',function(){var who=reviewerIdentity();var err=!who.id?'Reviewer ID kiriting.':G.isAutomationIdentity(who.id)?'Avtomatlashtirish review bera olmaydi.':(who.role!=='chemistry'&&who.role!=='didactic')?'Rol chemistry yoki didactic.':d.authoredBy&&sameId(d.authoredBy,who.id)?'Muallif o‘zini review qila olmaydi.':'';if(err){alert(err);return}
    d.reviews=d.reviews.filter(function(r){return !(r.reviewerRole===who.role&&sameId(r.reviewerId,who.id))});d.reviews.push({reviewerId:who.id,reviewerRole:who.role,decision:x[0],reviewedAt:nowIso(),reviewedHash:G.optionSetGovernance(d).hash});save();optionGov()});acts.appendChild(b)});
  var ex=el('button',{type:'button',class:'btn primary',text:'Draftni eksport qilish'});ex.addEventListener('click',function(){download('option-set.'+d.activityId+'.'+d.field+'.json',d)});acts.appendChild(ex);box.appendChild(acts);optionGov()}
function optionGov(){var key=S.optionKey;var d=S.options[key];var f=C.optionFields.find(function(x){return optKey(x)===key});var g=G.optionSetGovernance(d);var issues=G.validateOptionSetDraft(d,f);var box=clear(document.getElementById('coGov'));box.className='cw-gov '+(g.state==='APPROVED'&&!issues.length?'ok':'warn');
  box.appendChild(el('div',{text:'Holat: '+g.state}));box.appendChild(el('div',{class:'cw-hash',text:'Joriy hash: '+g.hash}));if(issues.length)box.appendChild(el('div',{class:'wb-flag',text:'Muammo: '+issues.join(', ')}))}

renderTheory();renderSources();renderIntake();renderOptions();renderOptionEditor();
})();`;
