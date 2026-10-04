// P2.12 — Content Studio MVP (ADR-P2-013): role-first content, the textbook-excerpt lane (synthetic PDF only), the
// lab-instruction lane over the P2.11 pipeline, the draft and the deterministic publish candidate, the learner/Studio
// boundary, uz-Latn author text without technical concepts, and the reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTENT_ROLES,mayParseInstruction} from '../src/studio/content-roles.ts';
import {attachPdf,emptyExcerpt,inspectPdf,sanitizeFileName,validateExcerpt,overallStatus,excerptRecord,MAX_EXCERPT_BYTES,PAGE_TREE_LIMITS} from '../src/studio/pdf-excerpt.ts';
import {labDerived,labFindings} from '../src/studio/lab-instruction.ts';
import {analyzeInstruction,instructionFromLegacy,previewProfile,stepsFromText,validateInstruction,emptyInstruction} from '../src/studio/lab-instruction.ts';
import {createDraft,draftRevision,markPreviewed,withValidation,packageBlockers} from '../src/studio/draft.ts';
import {buildPublishCandidate,serializeCandidate,verifyPublishCandidate,fromBase64,base64} from '../src/studio/publish-candidate.ts';
import {sha256HexSync,utf8} from '../src/domain/content/sha256.ts';
import {canonicalJson} from '../src/studio/draft.ts';
import {validateSourceIntake} from '../src/authoring/source-intake.ts';
import {buildCapabilityRegistry} from '../src/domain/lab/capability-registry.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';
import {compileTopicLabProfiles} from '../scripts/lib/topic-lab-profiles.ts';
import {loadRegistry} from '../scripts/guided-dynamic-lab.ts';
import {studioData,studioModuleClosure,studioIndexHtml} from '../scripts/build-content-studio.ts';
import {studioOutputs,STUDIO_REPORTS,TECHNICAL_TERMS,labCheckContext} from '../scripts/content-studio.ts';
import {syntheticPdf} from '../scripts/lib/synthetic-pdf.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const {profiles}=compileTopicLabProfiles(root);
const P=Object.fromEntries(profiles.map(p=>[p.activityId.replace('practice.experiment.',''),p]));
const registry=loadRegistry(root);
const activity=(id)=>json('content-src/practice-activities.json').find(a=>a.id===id);
const enc=(s)=>new TextEncoder().encode(s);
const AUTHOR='Sinov Muallifi';   // an isolated test draft's author; never written into canonical content

function excerptDraft(over={}){
  let d=createDraft('TEXTBOOK_EXCERPT',{kind:'TEXTBOOK_EXCERPT',excerpt:emptyExcerpt()},'lu.7.01');
  const r=attachPdf({...emptyExcerpt(),title:'Sinov qismi',source:{title:'Sinov darsligi',authority:'Sinov nashriyoti',year:2024},pageRange:{from:12,to:14},...over},'Sinov darslik (12-14).pdf',syntheticPdf());
  d={...d,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:r.payload},provenance:{...d.provenance,authorName:AUTHOR}};
  return d;
}

const shownPdf=(d)=>({kind:'EXCERPT_PDF_SHOWN',sha256:d.payload.excerpt.file.sha256});
function readyExcerpt(over={}){ const d=excerptDraft(over); return markPreviewed(withValidation(d,validateExcerpt(d.payload.excerpt,d.target)),shownPdf(d)); }
/** re-seal a tampered candidate so that only the targeted integrity check can fail (the outer hash is not the defence) */
function reseal(c){ const {candidateRevision,...body}=c; return {...body,candidateRevision:sha256HexSync(utf8(canonicalJson(body)))}; }
const xrefStreamPdf=()=>{ const head='%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'; const off=head.length; return enc(`${head}2 0 obj\n<< /Type /XRef /Size 3 /Root 1 0 R /W [1 2 1] /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n${off}\n%%EOF\n`); };

test('roles: content role first; only content authored as a lab instruction reaches the instruction parser',()=>{
  assert.deepEqual(CONTENT_ROLES.filter(r=>r.instructionParser).map(r=>r.role),['LAB_INSTRUCTION']);
  assert.equal(mayParseInstruction('TEXTBOOK_EXCERPT'),false); assert.equal(mayParseInstruction('PRACTICAL_ACTIVITY'),false);
  for(const r of ['EXPLANATION','TEXTBOOK_EXCERPT','VISUAL','QUESTION','INTERACTIVE_TASK','PRACTICAL_ACTIVITY','LAB_INSTRUCTION','SAFETY','LEARNER_RESPONSE','ASSESSMENT']) assert.ok(CONTENT_ROLES.some(x=>x.role===r),r);
  assert.deepEqual(CONTENT_ROLES.filter(r=>r.support==='implemented').map(r=>r.role).sort(),['LAB_INSTRUCTION','TEXTBOOK_EXCERPT']);
  // a keyword never routes: an excerpt titled like an experiment is still an excerpt; the excerpt lane never imports the parser
  const d=excerptDraft({title:'Elektroliz tajribasi — amaliy ish'});
  assert.equal(d.role,'TEXTBOOK_EXCERPT');
  assert.ok(!/action-catalog|classifyInstructionStep/.test(read('src/studio/pdf-excerpt.ts')));
});

test('PDF: real signature, end marker, no encryption; active content rejected; safe names; checksum by the machine',()=>{
  const pdf=syntheticPdf();
  const ok=inspectPdf(pdf); assert.equal(ok.ok,true); assert.equal(ok.version,'1.4'); assert.match(ok.sha256,/^[0-9a-f]{64}$/); assert.deepEqual(ok.activeContent,[]);
  assert.equal(inspectPdf(enc('<html><script>alert(1)</script></html>')).reason,'NOT_PDF');
  assert.equal(inspectPdf(new Uint8Array()).reason,'EMPTY');
  assert.equal(inspectPdf(enc(new TextDecoder().decode(pdf).replace('%%EOF',''))).reason,'TRUNCATED');
  assert.equal(inspectPdf(enc(new TextDecoder().decode(pdf).replace('/Root 1 0 R','/Root 1 0 R /Encrypt 9 0 R'))).reason,'ENCRYPTED');
  // P2.12 closeout: active content used to pass (ok:true + ATTENTION); it is now REJECTED. The fixture is built by the
  // generator, because a string replace shifts every object offset and would now be refused as MALFORMED instead.
  const js=inspectPdf(syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (x) >>'}));
  assert.equal(js.ok,false); assert.equal(js.reason,'ACTIVE_CONTENT'); assert.ok(js.activeContent.includes('/JavaScript'));
  const big=new Uint8Array(MAX_EXCERPT_BYTES+1); big.set(enc('%PDF-1.4')); assert.equal(inspectPdf(big).reason,'TOO_LARGE');
  // names: never a path, never a control character, always .pdf
  assert.equal(sanitizeFileName('../../etc/passwd.pdf'),'passwd.pdf');
  assert.equal(sanitizeFileName('C:\\Users\\a\\Kimyo 7-sinf (12–14).PDF'),'Kimyo-7-sinf-12-14.pdf');
  assert.equal(sanitizeFileName('O‘zbek darsligi.pdf'),'Ozbek-darsligi.pdf');
  assert.equal(sanitizeFileName('\u0000\u0007.pdf'),'darslik-qismi.pdf');
  assert.equal(sanitizeFileName('..hidden.pdf'),'hidden.pdf');
  const a=attachPdf(emptyExcerpt(),'x.pdf',enc('not a pdf')); assert.equal(a.payload.file,null);
});

test('excerpt validation: missing information, rights and source acceptance are explicit; nothing is invented',()=>{
  const empty=validateExcerpt(emptyExcerpt(),{learningUnitId:null});
  assert.equal(overallStatus(empty),'MISSING_INFORMATION');
  assert.deepEqual(empty.filter(f=>f.severity==='MISSING').map(f=>f.field),['topic','title','source-title','source-authority','file']);
  const d=excerptDraft();
  const f=validateExcerpt(d.payload.excerpt,d.target);
  assert.equal(overallStatus(f),'ATTENTION_REQUIRED');
  assert.deepEqual(f.map(x=>x.code),['RIGHTS_NOT_DOCUMENTED','SOURCE_ACCEPTANCE_REQUIRED']);
  // a documented right removes only that finding; source acceptance stays a human gate
  const ok=validateExcerpt({...d.payload.excerpt,rights:{status:'DOCUMENTED',basis:'Nashriyot bilan yozma kelishuv'}},d.target);
  assert.deepEqual(ok.map(x=>x.code),['SOURCE_ACCEPTANCE_REQUIRED']);
  assert.equal(validateExcerpt({...d.payload.excerpt,pageRange:{from:14,to:12}},d.target).some(x=>x.code==='PAGE_RANGE_INVALID'),true);
  const rec=excerptRecord(d.payload.excerpt,'lu.7.01');
  assert.equal(rec.schema,'kimyolab.textbook-excerpt.v1'); assert.equal(rec.file.name,'Sinov-darslik-12-14.pdf'); assert.equal(rec.file.sha256,inspectPdf(syntheticPdf()).sha256);
});

test('draft: hidden deterministic revision; preview and check are bound to the revision; canonical content untouched',()=>{
  const before=read('content-src/practice-activities.json');
  const d=excerptDraft();
  assert.equal(draftRevision(d),draftRevision(JSON.parse(JSON.stringify(d))));
  const edited={...d,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:{...d.payload.excerpt,title:'Boshqa sarlavha'}}};
  assert.notEqual(draftRevision(edited),draftRevision(d));
  assert.deepEqual(packageBlockers(d),['NOT_CHECKED','NOT_PREVIEWED']);
  // P2.12 closeout: markPreviewed now needs the evidence of what the preview drew (the accepted PDF's checksum)
  const ready=markPreviewed(withValidation(d,validateExcerpt(d.payload.excerpt,d.target)),shownPdf(d));
  assert.deepEqual(packageBlockers(ready),[]);
  // an edit after the preview needs a new preview and a new check
  assert.deepEqual(packageBlockers({...ready,payload:edited.payload}).sort(),['NOT_CHECKED','NOT_PREVIEWED']);
  assert.equal(ready.review.state,'NOT_REVIEWED');
  assert.equal(read('content-src/practice-activities.json'),before);
});

test('publish candidate: deterministic, source intake reused, human gates required, no approval; tampering detected',()=>{
  const pdf=syntheticPdf();
  // P2.12 closeout: markPreviewed now needs the evidence of what the preview drew
  const d=readyExcerpt();
  const a=buildPublishCandidate(d,{pdf}), b=buildPublishCandidate(JSON.parse(JSON.stringify(d)),{pdf:syntheticPdf()});
  assert.deepEqual(a.blockers,[]);
  assert.equal(serializeCandidate(a.candidate),serializeCandidate(b.candidate),'byte-identical');
  const c=a.candidate;
  assert.equal(c.applyBoundary.canonicalWriteFromStudio,false);
  assert.ok(c.humanGates.length>=3&&c.humanGates.every(g=>g.status==='REQUIRED'));
  const intake=c.derived.sourceIntake;
  assert.deepEqual(validateSourceIntake(intake),[]);
  assert.equal(intake.status,'draft'); assert.deepEqual(intake.reviews,[]); assert.equal(intake.category,'TEXTBOOK');
  assert.equal(intake.submittedBy,AUTHOR); assert.equal(intake.document.sha256,inspectPdf(pdf).sha256);
  assert.deepEqual([...fromBase64(c.files[0].base64)],[...pdf]);
  assert.deepEqual(verifyPublishCandidate(JSON.parse(serializeCandidate(c))),[]);
  const t=JSON.parse(serializeCandidate(c)); t.files[0].base64=t.files[0].base64.replace(/^./,ch=>ch==='J'?'K':'J');
  assert.ok(verifyPublishCandidate(t).some(x=>x.startsWith('CANDIDATE_REVISION_MISMATCH')||x.startsWith('FILE_CHECKSUM_MISMATCH')));
  const g=JSON.parse(serializeCandidate(c)); g.humanGates[0].status='APPROVED'; assert.ok(verifyPublishCandidate(g).length>0);
  // a different file than the one checked is refused; no file → refused
  assert.deepEqual(buildPublishCandidate(d,{pdf:syntheticPdf('another file')}).blockers,['FILE_CHECKSUM_MISMATCH']);
  assert.ok(buildPublishCandidate(d,{}).blockers.includes('FILE_MISSING'));
  // no author name → no candidate (the Studio never invents an identity)
  assert.ok(buildPublishCandidate({...d,provenance:{...d.provenance,authorName:''}},{pdf}).blockers.includes('AUTHOR_MISSING'));
});

test('lab: operations resolved with the registry; ambiguous stays null; never asks for facts the instruction omits',()=>{
  const ops=analyzeInstruction({...emptyInstruction(),steps:['Probirkani qizdiring.','Rang o‘zgarishini kuzating.','Kondensatni yig‘ing.','Natijalarni taqqoslang.','Probirkani o‘zingizga qaratmang.']},registry);
  const by=(v)=>ops.find(o=>o.verb===v);
  assert.equal(by('qizdiring').family,'HEAT'); assert.equal(by('qizdiring').resolution,'AUTHORITY_AT_RUNTIME');
  assert.equal(by('yig‘ing').family,null); assert.equal(by('yig‘ing').resolution,'AMBIGUOUS'); assert.equal(by('yig‘ing').messageKey,'studio.lab.op-ambiguous');
  assert.equal(by('taqqoslang').resolution,'LEARNER_RESPONSE');
  assert.equal(by('qaratmang').resolution,'SAFETY_RULE');
  const f=validateInstruction({...emptyInstruction(),steps:['Probirkani qizdiring.','Rang o‘zgarishini kuzating.']},{learningUnitId:'lu.7.01'},analyzeInstruction({...emptyInstruction(),steps:['Probirkani qizdiring.','Rang o‘zgarishini kuzating.']},registry),previewProfile(emptyInstruction(),null));
  // no temperature, colour or time is requested; the only gap is the missing lab view
  assert.deepEqual(f.map(x=>x.code),['NO_LAB_PROFILE']);
  assert.ok(!JSON.stringify(f).match(/temperature|harorat|rang\b|colour|color|vaqt/i));
  assert.deepEqual(stepsFromText('1. Quying.\n\n2) Aralashtiring.\n  '),['Quying.','Aralashtiring.']);
  assert.ok(analyzeInstruction({...emptyInstruction(),steps:['Gugurt alangasi bilan tekshiring.']},registry).some(o=>o.resolution==='UNSUPPORTED_ACTION'&&o.messageKey==='studio.lab.op-no-model'));
});

test('lab preview: the same instruction reuses the canonical contract; a changed one or a topic without a profile gets none',()=>{
  const a=activity('practice.experiment.7.10');
  const same=previewProfile(instructionFromLegacy(a.goal,a.legacyContent),P['7.10']);
  assert.equal(same.state,'PROFILE_PREVIEW'); assert.deepEqual(same.problems,[]);
  assert.equal(same.profile.completionScope.kind,'PARTIAL_INSTRUCTION');
  assert.deepEqual(same.profile.completionScope,P['7.10'].completionScope);
  const changed=instructionFromLegacy(a.goal,a.legacyContent); changed.steps=[...changed.steps,'Natijani daftarga yozing.'];
  assert.equal(previewProfile(changed,P['7.10']).state,'INSTRUCTION_CHANGED');
  assert.equal(previewProfile(changed,null).state,'NO_PROFILE');
  // 8.14: the recorded source conflict stays a conflict in the Studio too — never resolved
  const b=activity('practice.experiment.8.14'); const d=instructionFromLegacy(b.goal,b.legacyContent);
  const v=validateInstruction(d,{learningUnitId:'lu.8.22'},analyzeInstruction(d,registry),previewProfile(d,P['8.14']));
  assert.ok(v.some(x=>x.severity==='CONFLICT'&&x.code==='SOURCE_CONFLICT_REVIEW_REQUIRED'));
  assert.ok(v.some(x=>x.code==='PARTIAL_INSTRUCTION'));
});

test('round trip: 7.10 and 8.14 through the Studio derive the same semantics and the same chemistry',()=>{
  const r=json(STUDIO_REPORTS.roundTrip);
  assert.deepEqual(r.summary,{activities:2,equal:2});
  for(const row of r.rows){
    for(const [k,d] of Object.entries(row.dimensions)) assert.equal(d.equal,true,`${row.activityId}: ${k}`);
    assert.equal(row.canonicalUntouched,true);
  }
  assert.ok(r.rows.find(x=>x.activityId==='practice.experiment.7.10').recordedGaps.includes('MODEL_SOURCE_GAP_CU_HCL'));
});

test('boundary: the learner build never contains the Studio; the Studio carries no learner progress; flag off by default',()=>{
  assert.equal(FEATURE_FLAGS.contentStudioV1.default,false);
  assert.ok(!/['"]studio['"]|['"]authoring['"]/.test(read('scripts/build-browser-preview.ts').match(/const roots=\[[^\]]*\]/)[0]));
  assert.ok(!fs.existsSync(path.join(root,'public/app-preview/studio')),'no Studio module in the learner build');
  for(const f of ['scripts/build-production.ts','scripts/build-standalone.ts','scripts/build-release-bundle.ts','scripts/deploy-build.ts']) assert.ok(!/src\/studio|dist-studio|content-studio/.test(read(f)),f);
  assert.ok(!/studio/i.test(read('src/app/routes.ts')+read('src/app/bootstrap.ts')),'no Studio navigation in the learner app');
  assert.match(read('.gitignore'),/^\/dist-studio\/$/m);
  const closure=studioModuleClosure(root).map(m=>m.rel);
  assert.ok(closure.includes('src/features/dynamic-lab/render.ts')&&closure.includes('src/features/textbook-excerpt/render.ts'),'the preview reuses the learner renderers');
  assert.ok(!closure.some(r=>/^src\/(runtime\/progress|features\/progress|runtime\/learning-orchestrator)\//.test(r)),'no learner progress in the Studio');
  // the Studio page: uz-Latn, strict CSP, no external origin
  const html=studioIndexHtml();
  assert.match(html,/<html lang="uz-Latn">/); assert.match(html,/default-src 'none'/); assert.ok(!/https?:\/\//.test(html));
  // the Studio catalog is not shipped in the learner content pack
  assert.ok(!fs.existsSync(path.join(root,'content-src/locales/uz-latn/content-studio.json')));
});

test('author UI: every label is uz-Latn text with no technical concept; every used key exists',()=>{
  const labels=json('content-src/studio/content-studio.uz-latn.json').labels;
  for(const [k,v] of Object.entries(labels)){ assert.ok(!TECHNICAL_TERMS.test(v),`${k}: ${v}`); assert.ok(!/[\u0400-\u04ff]/.test(v),`${k} is not Latin script`); }
  const r=json(STUDIO_REPORTS.readiness);
  assert.deepEqual(r.localization.missingKeys,[]); assert.equal(r.localization.technicalTermsInAuthorLabels,0);
  // the plain-Uzbek replacements the instruction demands
  assert.equal(labels['studio.check.profile-incomplete'],'Laboratoriya ma’lumotlari to‘liq emas.');
  assert.equal(labels['studio.lab.op-no-chemistry-model'],'Bu jarayon uchun kimyoviy model hali mavjud emas.');
  assert.equal(labels['studio.lab.op-no-model'],'Bu amal uchun model hali mavjud emas.');
  assert.equal(labels['studio.reason.not-offered-trial'],'yo‘riqnoma bu amalni shu tajriba uchun ko‘rsatmagan');
  for(const k of ['studio.stage.choose','studio.stage.fill','studio.stage.preview','studio.stage.check','studio.stage.prepare']) assert.ok(labels[k]);
  // no "Nashr qilish" action is offered — only the honest preparation
  assert.ok(!Object.values(labels).some(v=>/^Nashr qilish$/.test(v)));
  const learner=json('content-src/locales/uz-latn/learner-interaction.json').labels;
  assert.equal(learner['ui.excerpt-kicker'],'Darslikdan o‘qish');
});

test('studio data: copied from the canonical sources; the in-browser registry equals the generator’s registry',()=>{
  const d=studioData(root);
  assert.equal(d.schema,'kimyolab.content-studio-data.v1');
  assert.equal(d.units.length,json('content-src/learning-units.json').length);
  assert.ok(d.units.every(u=>u.title&&u.grade));
  assert.deepEqual(buildCapabilityRegistry(d.registryData),registry);
  const s=d.labSources.find(x=>x.practiceActivityId==='practice.experiment.7.10');
  assert.equal(s.profiled,true); assert.deepEqual(s.legacy.steps,activity('practice.experiment.7.10').legacyContent.steps);
});

test('reports: generator-equal; statuses from the fixed vocabulary; metrics unchanged',()=>{
  const out=studioOutputs(root);
  for(const rel of Object.values(STUDIO_REPORTS)) assert.equal(read(rel),out[rel],rel);
  const r=json(STUDIO_REPORTS.readiness);
  const statuses=new Set(['implemented','preview only','human review required','not yet supported']);
  for(const s of [...r.lanes.textbookExcerpt.steps,...r.lanes.labInstruction.steps,...r.governanceBlockers]) assert.ok(statuses.has(s.status),s.status);
  for(const c of r.contentRoles) assert.ok(statuses.has(c.status));
  assert.equal(r.architecture.canonicalWriteFromStudio,false);
  assert.equal(r.architecture.learnerBoundary.studioRootInLearnerBuild,false);
  assert.deepEqual(r.architecture.learnerBoundary.learnerBuildScriptsReferencingStudio,[]);
  assert.equal(r.previewParity.allIdentical,true);
  assert.equal(r.lanes.textbookExcerpt.syntheticRun.notPdfRejected,true);
  assert.deepEqual([r.formalMetrics.learningProduct,r.formalMetrics.overall],[12.189,47.313]);
});

test('P2.12 closeout — PDF acceptance: envelope, structure, encryption, active content, compressed storage; fail closed',()=>{
  // 1. header + %%EOF with no document structure is NOT a usable excerpt
  for(const bytes of [enc('%PDF-1.4\n%%EOF\n'),enc('%PDF-1.4\n%garbage\nhello world\n%%EOF\n'),enc('%PDF-1.4\nx\nstartxref\n9\n%%EOF\n')]){
    const r=inspectPdf(bytes); assert.equal(r.ok,false); assert.equal(r.reason,'MALFORMED'); assert.equal(r.structure,null);
    assert.equal(attachPdf(emptyExcerpt(),'a.pdf',bytes).payload.file,null);
  }
  // objects not at their recorded offsets, a missing catalog or an empty page tree: refused
  const txt=new TextDecoder().decode(syntheticPdf());
  assert.equal(inspectPdf(enc(txt.replace('/Type /Catalog','/Type /Catalog /X 1'))).reason,'MALFORMED');
  assert.equal(inspectPdf(enc(txt.replace('/Type /Catalog','/Type /Catalox'))).reason,'MALFORMED');
  assert.equal(inspectPdf(enc(txt.replace('/Count 1','/Count 0'))).reason,'MALFORMED');
  // 2. encrypted stays rejected
  assert.equal(inspectPdf(enc(txt.replace('/Root 1 0 R','/Root 1 0 R /Encrypt 9 0 R'))).reason,'ENCRYPTED');
  // 3./4. active or interactive content is rejected, including #-escaped names and an /OpenAction action
  for(const [opts,marker] of [
    [{catalogExtra:'/OpenAction 6 0 R',extraObjects:['<< /S /JavaScript /JS (app.alert(1)) >>']},'/JavaScript'],
    [{catalogExtra:'/Names << /J#61vaScript 6 0 R >>',extraObjects:['<< >>']},'/JavaScript'],
    [{catalogExtra:'/AcroForm << /Fields [] /XFA 6 0 R >>',extraObjects:['<< >>']},'/XFA'],
    [{extraObjects:['<< /Type /EmbeddedFile /Length 0 >>\nstream\n\nendstream']},'/EmbeddedFile'],
    [{catalogExtra:'/OpenAction << /S /Launch /F (calc.exe) >>'},'/Launch'],
    [{catalogExtra:'/OpenAction 6 0 R',extraObjects:['<< /S /URI /URI (http://example.invalid) >>']},'/OpenAction'],
  ]){
    const r=inspectPdf(syntheticPdf(undefined,opts)); assert.equal(r.ok,false,marker); assert.equal(r.reason,'ACTIVE_CONTENT'); assert.ok(r.activeContent.includes(marker),`${marker}: ${r.activeContent}`);
  }
  // a plain destination array is not an action; words inside raw page drawing data are not dictionaries
  assert.equal(inspectPdf(syntheticPdf(undefined,{catalogExtra:'/OpenAction [3 0 R /Fit]'})).ok,true);
  assert.equal(inspectPdf(syntheticPdf('/JS /AA /Launch /JavaScript')).ok,true);
  // compressed object storage is invisible to the scan: refused, never trusted
  assert.equal(inspectPdf(syntheticPdf(undefined,{extraObjects:['<< /Type /ObjStm /N 0 /First 0 /Length 0 >>\nstream\n\nendstream']})).reason,'UNSUPPORTED_STRUCTURE');
  assert.equal(inspectPdf(xrefStreamPdf()).reason,'UNSUPPORTED_STRUCTURE');
  // 5. the safe synthetic PDF still passes, with its proven structure
  // (page-tree proof) the structure now also reports the reachable /Page leaves and the walked tree depth
  const ok=inspectPdf(syntheticPdf()); assert.equal(ok.ok,true); assert.deepEqual(ok.structure,{crossReferenceSections:1,objects:5,pageLeaves:1,pageTreeDepth:2});
  // an incremental update (/Prev chain) is followed
  const base=txt, xrefAt=Number(/startxref\n(\d+)/.exec(base)[1]);
  const upd=`${base}6 0 obj\n<< /Producer (synthetic update) >>\nendobj\n`; const off6=upd.length-`6 0 obj\n<< /Producer (synthetic update) >>\nendobj\n`.length;
  const inc=`${upd}xref\n6 1\n${String(off6).padStart(10,'0')} 00000 n \ntrailer\n<< /Size 7 /Root 1 0 R /Prev ${xrefAt} >>\nstartxref\n${upd.length}\n%%EOF\n`;
  assert.deepEqual(inspectPdf(enc(inc)).structure,{crossReferenceSections:2,objects:6,pageLeaves:1,pageTreeDepth:2});
});

test('P2.12 closeout — preview truth: only a drawn, accepted PDF is a preview; edit → preview again → check again',()=>{
  const d=withValidation(excerptDraft(),validateExcerpt(excerptDraft().payload.excerpt,excerptDraft().target));
  const rev=draftRevision(d);
  assert.equal(markPreviewed(d,{kind:'NOTHING_SHOWN'}).preview.viewedRevision,null,'entering the screen is not a preview');
  assert.equal(markPreviewed(d,{kind:'EXCERPT_PDF_SHOWN',sha256:'0'.repeat(64)}).preview.viewedRevision,null,'another file');
  assert.equal(markPreviewed(d,{kind:'LAB_PREVIEW_SHOWN'}).preview.viewedRevision,null,'wrong lane');
  assert.equal(markPreviewed(d,shownPdf(d)).preview.viewedRevision,rev);
  // 6. a rejected PDF leaves no file → nothing can be recorded as previewed, and the package stays blocked
  const active=syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (x) >>'});
  const rej=attachPdf(d.payload.excerpt,'a.pdf',active);
  const dr={...d,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:rej.payload}};
  assert.equal(dr.payload.excerpt.file,null);
  const pr=markPreviewed(dr,{kind:'EXCERPT_PDF_SHOWN',sha256:rej.inspection.sha256});
  assert.equal(pr.preview.viewedRevision,null);
  assert.ok(packageBlockers(pr).includes('NOT_PREVIEWED'));
  // a hand-edited draft that claims an active-content file is never previewed and is UNSUPPORTED at the check
  const forged={...d,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:{...d.payload.excerpt,file:{...d.payload.excerpt.file,activeContent:['/JS']}}}};
  assert.equal(markPreviewed(forged,shownPdf(forged)).preview.viewedRevision,null);
  assert.ok(validateExcerpt(forged.payload.excerpt,forged.target).some(f=>f.code==='PDF_ACTIVE_CONTENT_REJECTED'&&f.severity==='UNSUPPORTED'));
  // an edit after a real preview needs a new preview and a new check
  const ready=markPreviewed(d,shownPdf(d));
  assert.deepEqual(packageBlockers({...ready,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:{...ready.payload.excerpt,title:'Boshqa'}}}).sort(),['NOT_CHECKED','NOT_PREVIEWED']);
});

test('P2.12 closeout — a rejected PDF can never become an excerpt publish candidate',()=>{
  const active=syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (x) >>'});
  // 4. through the Studio path: the file is refused at upload, so there is no file to package
  const d0=excerptDraft(); const rej=attachPdf(d0.payload.excerpt,'a.pdf',active);
  const dr=withValidation({...d0,payload:{kind:'TEXTBOOK_EXCERPT',excerpt:rej.payload}},validateExcerpt(rej.payload,d0.target));
  assert.ok(buildPublishCandidate(markPreviewed(dr,{kind:'NOTHING_SHOWN'}),{pdf:active}).blockers.includes('FILE_MISSING'));
  // a hand-forged draft that records the active file as if accepted: the builder re-inspects the bytes
  const ins=inspectPdf(active);
  const file={originalName:'a.pdf',safeName:'a.pdf',bytes:ins.bytes,sha256:ins.sha256,pdfVersion:ins.version,activeContent:[]};
  const forged=excerptDraft(); forged.payload={kind:'TEXTBOOK_EXCERPT',excerpt:{...forged.payload.excerpt,file}};
  const fr=markPreviewed(withValidation(forged,validateExcerpt(forged.payload.excerpt,forged.target)),{kind:'EXCERPT_PDF_SHOWN',sha256:ins.sha256});
  assert.deepEqual(buildPublishCandidate(fr,{pdf:active}).blockers,['PDF_REJECTED']);
  // and a forged candidate file that embeds it is refused offline even when every hash is recomputed
  const good=buildPublishCandidate(readyExcerpt(),{pdf:syntheticPdf()}).candidate;
  const t=JSON.parse(serializeCandidate(good));
  t.files[0]={...t.files[0],base64:base64(active),bytes:active.length,sha256:ins.sha256};
  t.draft.payload.excerpt.file={...t.draft.payload.excerpt.file,bytes:active.length,sha256:ins.sha256};
  const problems=verifyPublishCandidate(reseal(t));
  assert.ok(problems.includes('PDF_REJECTED:ACTIVE_CONTENT'),problems.join());
});

test('P2.12 closeout — candidate integrity: revisions, recomputed derived data, deterministic verification',()=>{
  const pdf=syntheticPdf();
  const c=buildPublishCandidate(readyExcerpt(),{pdf}).candidate;
  // 11. the normal deterministic candidate verifies
  assert.equal(serializeCandidate(c),serializeCandidate(buildPublishCandidate(readyExcerpt(),{pdf:syntheticPdf()}).candidate));
  assert.deepEqual(verifyPublishCandidate(JSON.parse(serializeCandidate(c))),[]);
  const copy=()=>JSON.parse(serializeCandidate(c));
  // 7. a stale draftRevision: the draft inside changed after it was checked and previewed
  const a=copy(); a.draft.payload.excerpt.title='Boshqa sarlavha';
  assert.ok(verifyPublishCandidate(reseal(a)).includes('DRAFT_REVISION_MISMATCH'));
  const a2=copy(); a2.draftRevision='0'.repeat(64);
  assert.ok(verifyPublishCandidate(reseal(a2)).includes('DRAFT_REVISION_MISMATCH'));
  // 8. stale validation revision
  const b=copy(); b.draft.validation.revision='0'.repeat(64);
  assert.deepEqual(verifyPublishCandidate(reseal(b)),['VALIDATION_REVISION_MISMATCH']);
  // 9. stale preview revision (and a draft that was never previewed)
  const p=copy(); p.draft.preview.viewedRevision='0'.repeat(64);
  assert.deepEqual(verifyPublishCandidate(reseal(p)),['PREVIEW_REVISION_MISMATCH']);
  const p2=copy(); p2.draft.preview.viewedRevision=null;
  assert.deepEqual(verifyPublishCandidate(reseal(p2)),['PREVIEW_REVISION_MISMATCH']);
  // validation results are recomputed, not trusted
  const v=copy(); v.draft.validation.findings=[]; v.draft.validation.status='READY';
  assert.deepEqual(verifyPublishCandidate(reseal(v)),['VALIDATION_RESULT_MISMATCH']);
  // 10. derived data is recomputed from the draft
  const s1=copy(); s1.derived.sourceIntake.submittedBy='Boshqa odam';
  assert.ok(verifyPublishCandidate(reseal(s1)).includes('DERIVED_SOURCE_INTAKE_MISMATCH'));
  const s2=copy(); s2.derived.sourceIntake.document.sha256='0'.repeat(64);
  assert.ok(verifyPublishCandidate(reseal(s2)).includes('DERIVED_SOURCE_INTAKE_MISMATCH'));
  const e1=copy(); e1.derived.excerptRecord.title='Boshqa';
  assert.deepEqual(verifyPublishCandidate(reseal(e1)),['DERIVED_EXCERPT_RECORD_MISMATCH']);
  const e2=copy(); e2.derived.extra={};
  assert.deepEqual(verifyPublishCandidate(reseal(e2)),['DERIVED_SHAPE']);
  // PDF metadata: name, size and checksum must equal the draft's record
  const f1=copy(); f1.files[0].name='boshqa.pdf';
  assert.deepEqual(verifyPublishCandidate(reseal(f1)),['FILE_METADATA_MISMATCH']);
  const f2=copy(); f2.files=[];
  assert.deepEqual(verifyPublishCandidate(reseal(f2)),['FILE_COUNT']);
  // frame: gates, consumers and the apply boundary are fixed, never authored
  const g=copy(); g.humanGates.pop();
  assert.deepEqual(verifyPublishCandidate(reseal(g)),['HUMAN_GATES_MISMATCH']);
  const r=copy(); r.draft.review.state='REVIEWED';
  assert.ok(verifyPublishCandidate(reseal(r)).includes('REVIEW_PRESET'));
  // a candidate missing a part the checker reads fails closed instead of throwing
  const m=copy(); delete m.draft.validation;
  assert.deepEqual(verifyPublishCandidate(reseal(m)),['CANDIDATE_UNREADABLE']);
});

test('P2.12 closeout — lab candidate: re-analysed from the repository by studio:check; contradictions refused',()=>{
  const ctx=labCheckContext(root);
  const src=studioData(root).labSources.find(x=>x.practiceActivityId==='practice.experiment.7.10');
  const instruction=instructionFromLegacy(src.goal,src.legacy);
  let d=createDraft('LAB_INSTRUCTION',{kind:'LAB_INSTRUCTION',instruction},src.learningUnitId);
  d={...d,provenance:{...d.provenance,basis:'CANONICAL_INSTRUCTION',canonicalActivityId:src.practiceActivityId}};
  const canonical=ctx.profileFor(src.learningUnitId); assert.ok(canonical);
  d=markPreviewed(withValidation(d,labFindings(instruction,d.target,ctx.registry,canonical)),{kind:'LAB_PREVIEW_SHOWN'});
  const c=buildPublishCandidate(d,{labDerived:labDerived(instruction,ctx.registry,canonical)}).candidate;
  assert.ok(c);
  const raw=JSON.parse(serializeCandidate(c));
  assert.deepEqual(verifyPublishCandidate(raw,ctx),[]);
  // without the repository context the offline checker fails closed instead of trusting the derived lab facts
  assert.deepEqual(verifyPublishCandidate(raw),['LAB_REANALYSIS_REQUIRED']);
  const t=JSON.parse(serializeCandidate(c)); t.derived.completionScope={kind:'FULL_INSTRUCTION',uncovered:[]};
  assert.deepEqual(verifyPublishCandidate(reseal(t),ctx),['DERIVED_LAB_MISMATCH']);
  const t2=JSON.parse(serializeCandidate(c)); t2.derived.previewState='PROFILE_PREVIEW'; t2.draft.payload.instruction.steps.push('Natijani yozing.');
  assert.ok(verifyPublishCandidate(reseal(t2),ctx).includes('DRAFT_REVISION_MISMATCH'));
  const t3=JSON.parse(serializeCandidate(c)); t3.draft.validation.status='READY'; t3.draft.validation.findings=[];
  assert.deepEqual(verifyPublishCandidate(reseal(t3),ctx),['VALIDATION_RESULT_MISMATCH']);
});

test('P2.12 PDF structure proof — the page tree reachable from the catalog is walked; at least one /Page leaf',()=>{
  const S=(replace,extraObjects=[])=>inspectPdf(syntheticPdf(undefined,{replace,extraObjects}));
  const PAGE=(parent)=>`<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  const rejected=(r,reason='MALFORMED')=>{ assert.equal(r.ok,false); assert.equal(r.reason,reason); assert.equal(r.structure,null); };
  // 1. a /Kids entry that points to no object
  rejected(S({2:'<< /Type /Pages /Kids [999 0 R] /Count 1 >>'}));
  // 2. children that are neither /Page nor /Pages (with a correct /Parent, so only the type decides), or untyped
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Type /Font /Parent 2 0 R /Subtype /Type1 /BaseFont /Helvetica >>']));
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Parent 2 0 R >>']));
  rejected(S({2:'<< /Type /Pages /Kids [5 0 R] /Count 1 >>'}));
  // an inline /Type /Page inside a nested dictionary is not the node's own type
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Parent 2 0 R /Info << /Type /Page >> >>']));
  // non-reference entries in /Kids, a missing /Kids, a wrong /Parent, a non-/Pages root
  rejected(S({2:'<< /Type /Pages /Kids [3 0 R 7] /Count 1 >>'}));
  rejected(S({2:'<< /Type /Pages /Count 1 >>'}));
  rejected(S({3:PAGE(9)}));
  rejected(S({1:'<< /Type /Catalog /Pages 3 0 R >>'}));
  // 3. cycles and shared nodes
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Type /Pages /Parent 2 0 R /Kids [2 0 R] /Count 1 >>']));
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Type /Pages /Parent 2 0 R /Kids [6 0 R] /Count 1 >>']));
  rejected(S({2:'<< /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >>'}));
  // 4. nested /Pages → /Pages → /Page is walked and accepted
  const nested=S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>',3:PAGE(6)},['<< /Type /Pages /Parent 2 0 R /Kids [3 0 R] /Count 1 >>']);
  assert.equal(nested.ok,true); assert.deepEqual(nested.structure,{crossReferenceSections:1,objects:6,pageLeaves:1,pageTreeDepth:3});
  // 5. /Count > 0 with no reachable /Page leaf; /Count different from the reached leaves
  rejected(S({2:'<< /Type /Pages /Kids [] /Count 1 >>'}));
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>'},['<< /Type /Pages /Parent 2 0 R /Kids [] /Count 1 >>']));
  rejected(S({2:'<< /Type /Pages /Kids [3 0 R] /Count 2 >>'}));
  // limits: deeper than maxDepth, or more than maxNodes nodes → refused with its own reason
  const chain=[]; const depth=PAGE_TREE_LIMITS.maxDepth+2;
  for(let i=0;i<depth;i++){ const num=6+i, parent=i===0?2:num-1; chain.push(i===depth-1?`<< /Type /Pages /Parent ${parent} 0 R /Kids [3 0 R] /Count 1 >>`:`<< /Type /Pages /Parent ${parent} 0 R /Kids [${num+1} 0 R] /Count 1 >>`); }
  rejected(S({2:'<< /Type /Pages /Kids [6 0 R] /Count 1 >>',3:PAGE(6+depth-1)},chain),'PAGE_TREE_LIMIT');
  const wide=Array.from({length:PAGE_TREE_LIMITS.maxNodes},()=>'<< /Type /Page /Parent 2 0 R >>');
  rejected(S({2:`<< /Type /Pages /Kids [3 0 R ${wide.map((_,i)=>`${6+i} 0 R`).join(' ')}] /Count ${wide.length+1} >>`},wide),'PAGE_TREE_LIMIT');
  // 6. the safe synthetic PDF passes
  assert.deepEqual(inspectPdf(syntheticPdf()).structure,{crossReferenceSections:1,objects:5,pageLeaves:1,pageTreeDepth:2});
  // 8. the earlier rejections do not regress
  assert.equal(inspectPdf(syntheticPdf(undefined,{catalogExtra:'/OpenAction << /S /JavaScript /JS (x) >>'})).reason,'ACTIVE_CONTENT');
  assert.equal(inspectPdf(enc(new TextDecoder().decode(syntheticPdf()).replace('/Root 1 0 R','/Root 1 0 R /Encrypt 9 0 R'))).reason,'ENCRYPTED');
  assert.equal(inspectPdf(syntheticPdf(undefined,{extraObjects:['<< /Type /ObjStm /N 0 /First 0 /Length 0 >>\nstream\n\nendstream']})).reason,'UNSUPPORTED_STRUCTURE');
  assert.equal(inspectPdf(xrefStreamPdf()).reason,'UNSUPPORTED_STRUCTURE');
  assert.equal(inspectPdf(enc('%PDF-1.4\n%%EOF\n')).reason,'MALFORMED');
});
