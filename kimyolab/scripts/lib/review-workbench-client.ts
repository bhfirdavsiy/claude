// Browser side of the Human Review Workbench (P1.8), embedded into review-packets/reviewer-workspace.html.
// Plain ES2020, no dependencies, no network: it reads the embedded model, collects a person's decisions and
// downloads them as a decision file (kimyolab.review-decisions.v1). It never writes a register — the page cannot.
// Every text from the review packets (question, explanation, claim, comment …) is inserted with textContent,
// never as HTML.

export const WORKBENCH_CSS=`
.wb-reviewer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:10px;align-items:end;margin:0 0 14px}
.wb-reviewer label{display:grid;gap:4px;font-size:12px;font-weight:800;color:var(--muted)}
.wb-reviewer input,.wb-reviewer select,.wb-filters select,.wb-filters input{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff;color:var(--navy)}
.wb-filters{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.wb-list{display:grid;gap:12px}
.wb-card{border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:#fff}
.wb-card h3{margin:0 0 6px;font-size:16px;overflow-wrap:anywhere}
.wb-badges{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.wb-badge{font-size:12px;font-weight:800;border-radius:8px;padding:3px 8px;border:1px solid var(--line);background:#f1f6fc}
.wb-badge.warn{background:var(--yellowbg);color:var(--yellow);border-color:#ecd9a0}
.wb-badge.candidate{background:#fff0ee;color:var(--red);border-color:#f3c3bd}
.wb-card dl{display:grid;grid-template-columns:minmax(120px,max-content) 1fr;gap:4px 12px;margin:6px 0}
.wb-card dt{font-weight:800;color:var(--mid)}
.wb-card dd{margin:0;overflow-wrap:anywhere}
.wb-card fieldset{border:1px solid var(--line);border-radius:12px;margin:10px 0 0;padding:8px 12px}
.wb-card legend{font-weight:800;font-size:13px}
.wb-card fieldset label{margin-right:14px;display:inline-flex;gap:5px;align-items:center}
.wb-card textarea{width:100%;min-height:56px;border:1px solid var(--line);border-radius:10px;padding:8px;margin-top:6px}
.wb-note{font-size:12px;color:var(--muted)}
.wb-flag{color:var(--yellow);font-weight:800}
.wb-errors{background:var(--redbg);color:var(--red);border-radius:12px;padding:10px 12px;margin-top:10px}
:focus-visible{outline:3px solid #f5a524;outline-offset:2px}
@media(max-width:980px){.wb-reviewer{grid-template-columns:1fr}}`;

export const WORKBENCH_JS=String.raw`
(function(){
var D=JSON.parse(document.getElementById('workspace-data').textContent);
var W=D.workbench;
var AUTOMATION=new RegExp(W.automationIdentityPattern,'i');
var KEY='kimyolab-review-workbench:'+W.fingerprint;
var draft={reviewer:{id:'',role:''},decisions:{}};
try{var raw=localStorage.getItem(KEY);if(raw)draft=JSON.parse(raw)}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(draft))}catch(e){}countDecisions()}
function el(tag,attrs,children){var n=document.createElement(tag);if(attrs)for(var k in attrs){if(attrs[k]===null||attrs[k]===undefined||attrs[k]===false)continue;if(k==='text')n.textContent=String(attrs[k]);else if(k==='class')n.className=attrs[k];else n.setAttribute(k,attrs[k]===true?'':String(attrs[k]))}(children||[]).forEach(function(c){if(c===null||c===undefined)return;n.appendChild(typeof c==='string'?document.createTextNode(c):c)});return n}
function dl(rows){var d=el('dl');rows.forEach(function(r){d.appendChild(el('dt',{text:r[0]}));d.appendChild(el('dd',{text:r[1]===null||r[1]===undefined||r[1]===''?'—':r[1]}))});return d}
function badge(text,cls){return el('span',{class:'wb-badge'+(cls?' '+cls:''),text:text})}
var STATUS_TEXT={pending:'Holat: kutilmoqda (pending)',approved:'Holat: tasdiqlangan (approved)',rejected:'Holat: rad etilgan (rejected)',change_required:'Holat: o‘zgartirish kerak',stale:'Holat: ESKIRGAN (stale) — qayta review',accept_for_authoring:'Holat: authoring uchun qabul',reject_candidate:'Holat: nomzod rad etilgan',needs_evidence:'Holat: dalil kerak'};
function reviewer(){return {id:(draft.reviewer.id||'').trim(),role:draft.reviewer.role||''}}
function identityProblem(){var r=reviewer();if(!r.id)return 'Reviewer ID kiriting (shaxs).';if(AUTOMATION.test(r.id))return 'Bu identity avtomatlashtirishga o‘xshaydi — review qarorini faqat inson beradi.';if(!r.role)return 'Rolni tanlang.';return ''}
function dkey(surface,id,role){return surface+'|'+id+'|'+role}
function decisionBox(surface,id,role,options,enabled,why,extra){
  var k=dkey(surface,id,role);var cur=draft.decisions[k]||{};
  var fs=el('fieldset',{'aria-describedby':'why-'+cssId(k)});
  fs.appendChild(el('legend',{text:'Qaror ('+role+')'}));
  options.forEach(function(o){
    var input=el('input',{type:'radio',name:'d-'+k,value:o[0],disabled:!enabled});
    if(cur.decision===o[0])input.checked=true;
    input.addEventListener('change',function(){var r=reviewer();draft.decisions[k]=Object.assign({},draft.decisions[k]||{},{surface:surface,id:id,role:role,decision:o[0],reviewerId:r.id});save()});
    fs.appendChild(el('label',null,[input,o[1]]));
  });
  if(extra)fs.appendChild(extra(k,cur,enabled));
  var ta=el('textarea',{'aria-label':'Izoh: '+id+' ('+role+')',disabled:!enabled,placeholder:'Izoh (rad etish / o‘zgartirish uchun majburiy)'});
  ta.value=cur.comment||'';
  ta.addEventListener('change',function(){draft.decisions[k]=Object.assign({},draft.decisions[k]||{surface:surface,id:id,role:role},{comment:ta.value});save()});
  fs.appendChild(ta);
  var clear=el('button',{type:'button',class:'btn secondary',disabled:!enabled,text:'Qarorni bekor qilish'});
  clear.addEventListener('click',function(){delete draft.decisions[k];save();fs.querySelectorAll('input[type=radio]').forEach(function(x){x.checked=false});ta.value=''});
  fs.appendChild(clear);
  fs.appendChild(el('p',{class:'wb-note',id:'why-'+cssId(k),text:enabled?'Qaror faqat shu hash uchun: '+(extraHash[k]||''):why}));
  return fs;
}
var extraHash={};
function cssId(s){return s.replace(/[^a-zA-Z0-9_-]/g,'_')}
// ---------------------------------------------------------------- chemistry
function chemistryCard(a){
  var r=reviewer();var enabled=r.role==='chemistry'&&!identityProblem();
  extraHash[dkey('chemistry',a.id,'chemistry')]=a.currentHash;
  var c=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(a.id)});
  c.appendChild(el('h3',{id:'h-'+cssId(a.id),text:a.id}));
  var b=el('div',{class:'wb-badges'},[badge('Kategoriya: '+a.category),badge('Navbat: '+a.priority),badge(STATUS_TEXT[a.reviewStatus]||a.reviewStatus,a.reviewStatus==='stale'?'warn':'')]);
  a.flags.forEach(function(f){b.appendChild(badge('⚠ '+f,'warn'))});
  c.appendChild(b);
  c.appendChild(el('p',{text:'Da’vo: '+a.claim}));
  c.appendChild(dl(a.display));
  c.appendChild(dl([['Joriy hash',a.currentHash],['Manbalar',a.sourceRefs.join(', ')||'manba yo‘q (tasdiq hisobga olinmaydi: APPROVED_WITHOUT_SOURCE)'],['Ta’sir qiladigan activity',a.affectedActivities.join(', ')],['Fayl',a.files.join(', ')],['Oxirgi qaror',a.lastDecision?(a.lastDecision.decision+' — '+a.lastDecision.reviewerId+', '+a.lastDecision.reviewedAt):'yo‘q']]));
  c.appendChild(decisionBox('chemistry',a.id,'chemistry',[['approve','Tasdiqlash (approve)'],['reject','Rad etish (reject)'],['change_required','O‘zgartirish kerak (change_required)']],enabled,enabled?'':'Kimyo assertion’iga qarorni faqat chemistry rolidagi inson beradi.'));
  return c;
}
function renderChemistry(){
  var list=document.getElementById('wbChemList');list.textContent='';
  var p=document.getElementById('wbChemPriority').value,cat=document.getElementById('wbChemCategory').value,st=document.getElementById('wbChemStatus').value,q=document.getElementById('wbChemSearch').value.trim().toLowerCase();
  var xs=W.chemistry.filter(function(a){return (p==='all'||a.priority===p)&&(cat==='all'||a.category===cat)&&(st==='all'||a.reviewStatus===st)&&(!q||(a.id+' '+a.claim).toLowerCase().indexOf(q)>=0)});
  xs.sort(function(x,y){return x.priority===y.priority?(x.id<y.id?-1:1):(x.priority<y.priority?-1:1)});
  xs.forEach(function(a){list.appendChild(chemistryCard(a))});
  document.getElementById('wbChemCount').textContent='Ko‘rinmoqda: '+xs.length+' / '+W.chemistry.length;
}
// ---------------------------------------------------------------- candidates
function candidateCard(c){
  var r=reviewer();var enabled=r.role==='chemistry'&&!identityProblem();
  extraHash[dkey('chemistry-candidate',c.candidateId,'chemistry')]=c.candidateHash;
  var card=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(c.candidateId)});
  card.appendChild(el('h3',{id:'h-'+cssId(c.candidateId),text:c.pair}));
  card.appendChild(el('div',{class:'wb-badges'},[badge(W.candidateBadge,'candidate'),badge('Sinf: '+c.class),badge('Tur: '+(c.candidate?c.candidate.kind:'condition-dependent')),badge(STATUS_TEXT[c.reviewStatus]||c.reviewStatus)]));
  card.appendChild(dl([['Candidate ID',c.candidateId],['Hozirgi xatti-harakat',c.currentBehavior],['Asos (taklif)',c.candidate?c.candidate.basis:'yozuv bor, lekin boshqa sharoit kerak'],['Ion almashuvi',c.candidate?c.candidate.swaps.map(function(s){return s.ions+' → '+(s.formula||'?')}).join('; '):'—'],['Activity',c.activitiesAffected.join(', ')],['Hash',c.candidateHash]]));
  card.appendChild(el('p',{class:'wb-note',text:'Qaror faqat authoring triage: u bilimlar bazasiga reaksiya yoki “reaksiya bormaydi” yozuvini qo‘shmaydi.'}));
  card.appendChild(decisionBox('chemistry-candidate',c.candidateId,'chemistry',[['accept_for_authoring','Authoring uchun qabul'],['reject_candidate','Nomzodni rad etish'],['needs_evidence','Dalil kerak']],enabled,enabled?'':'Nomzodga qarorni faqat chemistry rolidagi inson beradi.'));
  return card;
}
function renderCandidates(){var list=document.getElementById('wbCandList');list.textContent='';W.candidates.forEach(function(c){list.appendChild(candidateCard(c))})}
// ---------------------------------------------------------------- assessment
function assessmentCard(a){
  var r=reviewer();var role=r.role;var enabled=(role==='chemistry'||role==='didactic')&&!identityProblem();
  var card=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(a.itemId)});
  card.appendChild(el('h3',{id:'h-'+cssId(a.itemId),text:a.itemId+' — '+a.learningUnitId}));
  var b=el('div',{class:'wb-badges'},[badge('Lifecycle: '+a.lifecycle),badge('Chemistry review: '+a.review.chemistry),badge('Didactic review: '+a.review.didactic),badge('Outcome qarori: '+a.outcome)]);
  a.flags.forEach(function(f){b.appendChild(badge('⚠ '+f.split(':')[0],'warn'))});
  card.appendChild(b);
  a.flags.forEach(function(f){card.appendChild(el('p',{class:'wb-flag',text:f}))});
  card.appendChild(el('p',{text:'Savol: '+a.prompt}));
  var ol=el('ul',{'aria-label':'Variantlar'});a.options.forEach(function(o){ol.appendChild(el('li',{text:o.id+'. '+o.text+(o.correct?'  ← to‘g‘ri javob':'')}))});card.appendChild(ol);
  card.appendChild(dl([['To‘g‘ri javob',a.correctOptionId],['Izoh (explanation)',a.explanation],['Konseptlar',a.concepts.map(function(c){return c.name+' ('+c.id+')'}).join(', ')],['Outcome',a.outcomes.map(function(o){return o.id+' — '+o.text}).join('; ')],['Qiyinchilik',a.difficulty||'ko‘rsatilmagan (reviewer baholaydi)'],['Distraktorlar',a.distractors.map(function(o){return o.id+'. '+o.text}).join('; ')],['Item hash',a.itemHash],['Versiya',a.itemVersion],['Review packet',a.evidence?a.evidence.packet+' (sha256 '+a.evidence.packetSha256.slice(0,16)+'…)':'topilmadi — avval npm run review:build']]));
  var roleNow=role==='didactic'?'didactic':'chemistry';
  extraHash[dkey('assessment',a.itemId,roleNow)]=a.itemHash;
  card.appendChild(decisionBox('assessment',a.itemId,roleNow,[['approved','Tasdiqlash (approved)'],['rejected','Rad etish (rejected)'],['changes_requested','O‘zgartirish so‘raladi']],enabled&&!!a.evidence,enabled?'':'Assessment item’iga qarorni chemistry yoki didactic rolidagi inson beradi. Bitta odam ikkala rolni tasdiqlay olmaydi.',roleNow==='didactic'?function(k,cur,en){var box=el('div',{role:'group','aria-label':'Outcome mapping qarori'},[el('span',{class:'wb-note',text:'Outcome mapping: '})]);[['confirm','tasdiqlash'],['reject','rad etish'],['change_required','o‘zgartirish kerak']].forEach(function(o){var i=el('input',{type:'radio',name:'o-'+k,value:o[0],disabled:!en});if(cur.outcomeDecision===o[0])i.checked=true;i.addEventListener('change',function(){draft.decisions[k]=Object.assign({},draft.decisions[k]||{surface:'assessment',id:a.itemId,role:'didactic'},{outcomeDecision:o[0]});save()});box.appendChild(el('label',null,[i,o[1]]))});return box}:null));
  return card;
}
function renderAssessment(){var list=document.getElementById('wbAssessList');list.textContent='';W.assessment.forEach(function(a){list.appendChild(assessmentCard(a))})}
// ---------------------------------------------------------------- pilot sign-off
function pilotCard(p){
  var r=reviewer();var enabled=r.role==='pilot-owner'&&!identityProblem()&&p.canSignOff;
  extraHash[dkey('pilot-signoff',p.learningUnitId,'pilot-owner')]=p.basisHash;
  var card=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(p.learningUnitId)});
  card.appendChild(el('h3',{id:'h-'+cssId(p.learningUnitId),text:p.learningUnitId+(p.title?' — '+p.title:'')}));
  card.appendChild(el('div',{class:'wb-badges'},[badge('Pilot status: '+p.status),badge('Texnik: '+p.technical),badge('Sign-off: '+p.signoff)]));
  card.appendChild(dl([['basisHash',p.basisHash],['Mavjud sign-off yozuvlari',p.records.length?p.records.map(function(s){return s.decision+' — '+s.reviewerId+', '+s.signedAt}).join('; '):'yo‘q']]));
  if(p.pendingHuman.length){var u=el('ul',{'aria-label':'Kutilayotgan inson qarorlari'});p.pendingHuman.forEach(function(x){u.appendChild(el('li',{text:x}))});card.appendChild(el('p',{class:'wb-note',text:'Kutilayotgan inson qarorlari:'}));card.appendChild(u)}
  if(p.blockers.length){var bl=el('ul',{'aria-label':'Blokerlar'});p.blockers.forEach(function(x){bl.appendChild(el('li',{text:x}))});card.appendChild(bl)}
  card.appendChild(decisionBox('pilot-signoff',p.learningUnitId,'pilot-owner',[['signed_off','Sign-off'],['rejected','Rad etish']],enabled,p.canSignOff?'Sign-off’ni faqat pilot-owner rolidagi inson beradi.':'Sign-off hozir mumkin emas: status '+p.status+' (avval barcha review’lar tugashi kerak).'));
  card.appendChild(el('p',{class:'wb-note',text:'Sign-off fayli import qilinmaydi: pilot owner uni content-src/pilot-signoffs.json ga pull request orqali qo‘shadi (ADR-P1-004).'}));
  return card;
}
function renderPilot(){var list=document.getElementById('wbPilotList');list.textContent='';W.pilot.forEach(function(p){list.appendChild(pilotCard(p))})}
// ---------------------------------------------------------------- authoring tasks (read-only)
function taskCard(t){
  var card=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(t.id)});
  card.appendChild(el('h3',{id:'h-'+cssId(t.id),text:t.action+' — '+t.targetId}));
  card.appendChild(el('div',{class:'wb-badges'},[badge('Holat: '+t.status),badge('Sirt: '+t.surface),badge('Navbat: '+t.priority)]));
  card.appendChild(dl([['Task ID',t.id],['Manba qaror',t.sourceDecisionId],['Reviewer qarori',t.reviewerDecision||'hali yo‘q'],['Reviewer izohi',t.reviewerComment||'—'],['basisHash',t.basisHash],['Fayllar',t.affectedFiles.join(', ')],['Activity',t.affectedActivities.join(', ')||'—'],['Draft buyrug‘i','npm run authoring:draft -- '+t.id]]));
  return card;
}
function renderTasks(){var list=document.getElementById('wbTaskList');list.textContent='';var a=document.getElementById('wbTaskAction').value,s=document.getElementById('wbTaskStatus').value;var xs=W.authoring.filter(function(t){return (a==='all'||t.action===a)&&(s==='all'||t.status===s)});xs.slice(0,200).forEach(function(t){list.appendChild(taskCard(t))});document.getElementById('wbTaskCount').textContent='Ko‘rinmoqda: '+Math.min(xs.length,200)+' / '+xs.length+' (jami '+W.authoring.length+')'}
// ---------------------------------------------------------------- release decisions (content owner)
function releaseCard(e){
  var r=reviewer();var enabled=r.role==='content-owner'&&!identityProblem();
  extraHash[dkey('release',e.activityId,'content-owner')]=e.basisHash;
  var card=el('article',{class:'wb-card','aria-labelledby':'h-'+cssId(e.activityId)});
  card.appendChild(el('h3',{id:'h-'+cssId(e.activityId),text:e.activityId+(e.title?' — '+e.title:'')}));
  card.appendChild(el('div',{class:'wb-badges'},[badge('Eligibility: '+e.eligibility.status,e.eligibility.status==='ELIGIBLE'?'':'warn'),badge('Release: '+e.releaseState),badge('Runtime: '+e.runtime),badge('Content: '+e.content)].concat(e.pilot?[badge('PILOT — sign-off alohida')]:[])));
  card.appendChild(dl([['LU',e.learningUnits.join(', ')],['Route',e.route],['Lifecycle',e.lifecycleStatus],['Review’lar','technical '+e.reviews.technical+', didactic '+e.reviews.didactic+', accessibility '+e.reviews.accessibility+', chemistry '+e.reviews.chemistry],['NOT_ELIGIBLE sabablari',e.eligibility.reasons.join(', ')||'—'],['basisHash',e.basisHash]]));
  var box=decisionBox('release',e.activityId,'content-owner',[['RELEASE','Release'],['KEEP_PENDING','Kutishda qoldirish'],['DISABLE','O‘chirish'],['CHANGE_REQUIRED','O‘zgartirish kerak']],enabled,'Release qarorini faqat content-owner rolidagi inson beradi.');
  if(e.eligibility.status!=='ELIGIBLE'){var rel=box.querySelector('input[value=RELEASE]');if(rel){rel.disabled=true;rel.setAttribute('aria-describedby','why-rel-'+cssId(e.activityId))}box.appendChild(el('p',{class:'wb-note',id:'why-rel-'+cssId(e.activityId),text:'RELEASE mumkin emas: NOT_ELIGIBLE (machine shart bajarilmagan).'}))}
  card.appendChild(box);
  return card;
}
function renderRelease(){var list=document.getElementById('wbReleaseList');list.textContent='';W.release.forEach(function(e){list.appendChild(releaseCard(e))})}
// ---------------------------------------------------------------- export (download only — nothing is written anywhere else)
function exportDecisions(){
  var errs=document.getElementById('wbErrors');errs.textContent='';errs.hidden=true;
  var problems=[];var ip=identityProblem();if(ip)problems.push(ip);
  var r=reviewer();var now=new Date().toISOString();var out=[];
  Object.keys(draft.decisions).forEach(function(k){
    var d=draft.decisions[k];if(!d.decision||d.reviewerId!==r.id)return;
    var comment=(d.comment||'').trim();
    var needsComment=['reject','change_required','rejected','changes_requested','reject_candidate','needs_evidence','KEEP_PENDING','DISABLE','CHANGE_REQUIRED'].indexOf(d.decision)>=0||(d.outcomeDecision&&d.outcomeDecision!=='confirm');
    if(needsComment&&!comment)problems.push(d.id+': izoh majburiy');
    var rec=null;
    if(d.surface==='chemistry'){var a=W.chemistry.find(function(x){return x.id===d.id});if(a)rec={surface:'chemistry',assertionId:a.id,assertionHash:a.currentHash,decision:d.decision,reviewerId:r.id,reviewerRole:'chemistry',reviewedAt:now}}
    else if(d.surface==='chemistry-candidate'){var c=W.candidates.find(function(x){return x.candidateId===d.id});if(c)rec={surface:'chemistry-candidate',candidateId:c.candidateId,candidateHash:c.candidateHash,decision:d.decision,reviewerId:r.id,reviewerRole:'chemistry',reviewedAt:now}}
    else if(d.surface==='assessment'){var it=W.assessment.find(function(x){return x.itemId===d.id});if(it){if(d.role==='didactic'&&!d.outcomeDecision)problems.push(d.id+': outcome mapping qarori majburiy');rec={surface:'assessment',itemId:it.itemId,role:d.role,decision:d.decision,reviewerId:r.id,reviewerRole:d.role,reviewedAt:now,itemHash:it.itemHash,itemVersion:it.itemVersion,evidence:it.evidence};if(d.role==='didactic')rec.outcomeDecision=d.outcomeDecision}}
    else if(d.surface==='release'){var re=W.release.find(function(x){return x.activityId===d.id});if(re){if(d.decision==='RELEASE'&&re.eligibility.status!=='ELIGIBLE')problems.push(d.id+': NOT_ELIGIBLE — RELEASE mumkin emas');rec={surface:'release',activityId:re.activityId,basisHash:re.basisHash,decision:d.decision,reviewerId:r.id,role:'content-owner',decidedAt:now}}}
    else if(d.surface==='pilot-signoff'){var p=W.pilot.find(function(x){return x.learningUnitId===d.id});if(p)rec={surface:'pilot-signoff',learningUnitId:p.learningUnitId,reviewerId:r.id,role:'pilot-owner',decision:d.decision,signedAt:now,basisHash:p.basisHash}}
    if(rec){if(comment)rec.comment=comment;out.push(rec)}
  });
  if(!out.length)problems.push('Eksport uchun qaror yo‘q (shu reviewer ID bilan).');
  if(problems.length){problems.forEach(function(p){errs.appendChild(el('p',{text:p}))});errs.hidden=false;errs.focus();return}
  var file={schema:W.decisionsSchema,exportedAt:now,workspaceFingerprint:W.fingerprint,decisions:out};
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)+'\n'],{type:'application/json'}));a.download='review-decisions-'+r.id.replace(/[^a-zA-Z0-9._-]/g,'_')+'-'+now.slice(0,10)+'.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000);
  document.getElementById('wbStatus').textContent=out.length+' ta qaror eksport qilindi. Faylni review-output/ papkasiga qo‘ying va avval npm run review:validate -- <fayl> ni ishga tushiring.';
}
function countDecisions(){var r=reviewer();var n=Object.keys(draft.decisions).filter(function(k){return draft.decisions[k].decision&&draft.decisions[k].reviewerId===r.id}).length;var e=document.getElementById('wbCount');if(e)e.textContent='Qarorlar (shu reviewer): '+n}
function renderAll(){var ip=identityProblem();var w=document.getElementById('wbIdentity');w.textContent=ip||('Reviewer: '+reviewer().id+' · rol: '+reviewer().role);w.className='notice '+(ip?'warn':'ok');renderChemistry();renderCandidates();renderAssessment();renderPilot();renderTasks();renderRelease();countDecisions()}
// ---------------------------------------------------------------- wiring
var idInput=document.getElementById('wbReviewerId'),roleInput=document.getElementById('wbReviewerRole');
idInput.value=draft.reviewer.id||'';roleInput.value=draft.reviewer.role||'';
idInput.addEventListener('change',function(){draft.reviewer.id=idInput.value.trim();save();renderAll()});
roleInput.addEventListener('change',function(){draft.reviewer.role=roleInput.value;save();renderAll()});
['wbChemPriority','wbChemCategory','wbChemStatus'].forEach(function(id){document.getElementById(id).addEventListener('change',renderChemistry)});
document.getElementById('wbChemSearch').addEventListener('input',renderChemistry);
var cats=[];W.chemistry.forEach(function(a){if(cats.indexOf(a.category)<0)cats.push(a.category)});cats.sort().forEach(function(c){document.getElementById('wbChemCategory').appendChild(el('option',{value:c,text:c}))});
Object.keys(W.priorities).forEach(function(p){document.getElementById('wbChemPriority').appendChild(el('option',{value:p,text:W.priorities[p]}))});
var acts=[];W.authoring.forEach(function(t){if(acts.indexOf(t.action)<0)acts.push(t.action)});acts.sort().forEach(function(a){document.getElementById('wbTaskAction').appendChild(el('option',{value:a,text:a}))});
['wbTaskAction','wbTaskStatus'].forEach(function(id){document.getElementById(id).addEventListener('change',renderTasks)});
document.getElementById('wbExport').addEventListener('click',exportDecisions);
renderAll();
})();`;
