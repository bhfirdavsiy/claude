// P2.12 — Content Studio MVP (ADR-P2-013): role-first content, the textbook-excerpt lane (synthetic PDF only), the
// lab-instruction lane over the P2.11 pipeline, the draft and the deterministic publish candidate, the learner/Studio
// boundary, uz-Latn author text without technical concepts, and the reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTENT_ROLES,mayParseInstruction} from '../src/studio/content-roles.ts';
import {attachPdf,emptyExcerpt,inspectPdf,sanitizeFileName,validateExcerpt,overallStatus,excerptRecord,MAX_EXCERPT_BYTES} from '../src/studio/pdf-excerpt.ts';
import {analyzeInstruction,instructionFromLegacy,previewProfile,stepsFromText,validateInstruction,emptyInstruction} from '../src/studio/lab-instruction.ts';
import {createDraft,draftRevision,markPreviewed,withValidation,packageBlockers} from '../src/studio/draft.ts';
import {buildPublishCandidate,serializeCandidate,verifyPublishCandidate,fromBase64} from '../src/studio/publish-candidate.ts';
import {validateSourceIntake} from '../src/authoring/source-intake.ts';
import {buildCapabilityRegistry} from '../src/domain/lab/capability-registry.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';
import {compileTopicLabProfiles} from '../scripts/lib/topic-lab-profiles.ts';
import {loadRegistry} from '../scripts/guided-dynamic-lab.ts';
import {studioData,studioModuleClosure,studioIndexHtml} from '../scripts/build-content-studio.ts';
import {studioOutputs,STUDIO_REPORTS,TECHNICAL_TERMS} from '../scripts/content-studio.ts';
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

test('PDF: real signature, end marker, no encryption; active content flagged; safe names; checksum by the machine',()=>{
  const pdf=syntheticPdf();
  const ok=inspectPdf(pdf); assert.equal(ok.ok,true); assert.equal(ok.version,'1.4'); assert.match(ok.sha256,/^[0-9a-f]{64}$/); assert.deepEqual(ok.activeContent,[]);
  assert.equal(inspectPdf(enc('<html><script>alert(1)</script></html>')).reason,'NOT_PDF');
  assert.equal(inspectPdf(new Uint8Array()).reason,'EMPTY');
  assert.equal(inspectPdf(enc(new TextDecoder().decode(pdf).replace('%%EOF',''))).reason,'TRUNCATED');
  assert.equal(inspectPdf(enc(new TextDecoder().decode(pdf).replace('/Root 1 0 R','/Root 1 0 R /Encrypt 9 0 R'))).reason,'ENCRYPTED');
  const js=inspectPdf(enc(new TextDecoder().decode(pdf).replace('/Type /Catalog','/Type /Catalog /OpenAction << /S /JavaScript /JS (x) >>')));
  assert.equal(js.ok,true); assert.ok(js.activeContent.includes('/JavaScript'));
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
  const ready=markPreviewed(withValidation(d,validateExcerpt(d.payload.excerpt,d.target)));
  assert.deepEqual(packageBlockers(ready),[]);
  // an edit after the preview needs a new preview and a new check
  assert.deepEqual(packageBlockers({...ready,payload:edited.payload}).sort(),['NOT_CHECKED','NOT_PREVIEWED']);
  assert.equal(ready.review.state,'NOT_REVIEWED');
  assert.equal(read('content-src/practice-activities.json'),before);
});

test('publish candidate: deterministic, source intake reused, human gates required, no approval; tampering detected',()=>{
  const pdf=syntheticPdf();
  const d=markPreviewed(withValidation(excerptDraft(),validateExcerpt(excerptDraft().payload.excerpt,excerptDraft().target)));
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
