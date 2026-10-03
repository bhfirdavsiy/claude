// P2.9 — learner feedback semantics: the taxonomy, the engine reason for a blocked step, real practice sessions
// (empty / non-target / target / retry / completion; ordered and order-free experiments), the ICU-independent option
// order, the audit report + human packets, and the invariants (no verdict invented, no order imposed, no evidence or
// scoring change, no progress from an intermediate state).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {feedbackState,FEEDBACK_CATEGORIES,STEP_DEPENDENCY_UNMET} from '../src/runtime/shared/learner-input.ts';
import {ExperimentEngine} from '../src/engines/experiment/engine.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {buildChoices,codepointOrder,createLabeler} from '../src/features/practice/form-question.ts';
import {createLocalizer,parseInteractionCatalog,REQUIRED_UI_KEYS} from '../src/features/localization/element-names.ts';
import {KINETICS_EFFECTS} from '../src/domain/chemistry/kinetics-model.ts';
import {feedbackOutputs,AUDIT_SCOPE} from '../scripts/learner-feedback-semantics.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const client=()=>new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
async function session(id){ const page=await client().loadPractice(id); return {page,s:new ReferencePracticeSession(page)}; }
const sim=(field,value)=>({kind:'simulation-action',action:{field,value}});
const act=(type)=>({kind:'experiment-action',action:{type}});

test('taxonomy: six categories, derived only from the existing engine result shapes',()=>{
  assert.deepEqual([...FEEDBACK_CATEGORIES],['CORRECT','INCORRECT','VALID_INTERMEDIATE','UNSUPPORTED_INPUT','PROCEDURE_BLOCKED','SYSTEM_ERROR']);
  assert.deepEqual(feedbackState({evidence:[],finalState:{a:1}}),{category:'VALID_INTERMEDIATE',complete:false});
  assert.deepEqual(feedbackState({evidence:[{score:1,achieved:true}],finalState:{status:'complete'}}),{category:'CORRECT',complete:true});
  assert.deepEqual(feedbackState({evidence:[{score:1}]}),{category:'CORRECT',complete:false});
  assert.deepEqual(feedbackState({evidence:[{score:0,achieved:false}]}),{category:'INCORRECT',complete:false});
  assert.deepEqual(feedbackState({attempts:[{status:'rejected'}]}),{category:'INCORRECT',complete:false});
  assert.deepEqual(feedbackState({outcomes:[{status:'invalid',code:'LEARNER_INPUT_INVALID'}]}),{category:'UNSUPPORTED_INPUT',complete:false});
  assert.deepEqual(feedbackState({outcomes:[{status:'invalid',code:'ELECTROLYSIS_NOT_MODELED'}]}),{category:'UNSUPPORTED_INPUT',complete:false,notModeled:true});
  assert.deepEqual(feedbackState({outcomes:[{status:'invalid',code:'INVALID_ACTION',reason:STEP_DEPENDENCY_UNMET}]}),{category:'PROCEDURE_BLOCKED',complete:false});
  assert.deepEqual(feedbackState(undefined),{category:'VALID_INTERMEDIATE',complete:false});
});

test('experiment engine: a step with an open dependency is rejected as before (same status/code, no state change) and says why',()=>{
  const steps=['a','b','c'].map((id,i,all)=>({id,dependencies:i?[all[i-1]]:[],mode:'required',allowedActions:[id],completionRule:{actionType:id}}));
  const engine=new ExperimentEngine({id:'s',version:'1.0.0',steps},()=>({status:'accepted'}));
  const early=engine.dispatch({type:'c'});
  assert.deepEqual(early,{status:'invalid',code:'INVALID_ACTION',feedbackKey:'experiment.invalid-action',reason:'STEP_DEPENDENCY_UNMET'});
  assert.deepEqual(engine.getState().completedStepIds,[]);
  // an action no step allows is still a plain INVALID_ACTION (no reason): it is not a procedure order question
  assert.deepEqual(engine.dispatch({type:'zzz'}),{status:'invalid',code:'INVALID_ACTION',feedbackKey:'experiment.invalid-action'});
  for(const t of ['a','b','c']) assert.equal(engine.dispatch({type:t}).status,'accepted');
  assert.equal(engine.getState().status,'complete');
  // re-doing a finished step is not "blocked" either
  assert.equal(engine.dispatch({type:'a'}).reason,undefined);
});

test('generic target-only simulation 7.02: non-target = VALID_INTERMEDIATE (no evidence, no progress), target completes, retry works',async()=>{
  const {s}=await session('practice.simulation.7.02.planned');
  let r=await s.apply(sim('property','mass'));
  assert.equal(feedbackState(r).category,'VALID_INTERMEDIATE'); assert.equal(r.evidence.length,0); assert.equal(isPracticeResultComplete('simulation',r),false);
  r=await s.apply(sim('classification','chemical'));
  assert.equal(feedbackState(r).category,'VALID_INTERMEDIATE','a non-target pair is never announced as wrong: the config declares no incorrect state');
  // retry in the same attempt: the target state completes
  await s.apply(sim('property','density')); r=await s.apply(sim('classification','physical'));
  assert.deepEqual(feedbackState(r),{category:'CORRECT',complete:false});
  assert.equal(isPracticeResultComplete('simulation',r),true);
  // evidence semantics unchanged: same id, target and score as before P2.9
  assert.deepEqual(r.evidence.map(e=>[e.id,e.targetId,e.score,e.achieved]),[['practice.simulation.7.02.planned.construction.water-density-physical','water-density-physical',1,true]]);
});

test('11.16 (closed kinetics domain): a wrong option is INCORRECT with score 0, the modeled one CORRECT — the engine was right all along',async()=>{
  const {s}=await session('practice.simulation.11.16.planned');
  let r=await s.apply(sim('effect','no-change'));
  assert.equal(feedbackState(r).category,'INCORRECT'); assert.equal(r.evidence[0].score,0);
  r=await s.apply(sim('effect','increase'));
  assert.equal(feedbackState(r).category,'CORRECT'); assert.equal(r.evidence[0].score,1);
});

test('ordered experiment (beta1 7.6, declared dependencies): valid order, early step PROCEDURE_BLOCKED, retry after rejection, completion',async()=>{
  const {s}=await session('practice.experiment.7.6');
  let r=await s.apply(act('step.2'));
  assert.equal(feedbackState(r).category,'PROCEDURE_BLOCKED'); assert.equal(r.evidence.length,0);
  r=await s.apply(act('step.1')); assert.notEqual(feedbackState(r).category,'PROCEDURE_BLOCKED');
  r=await s.apply(act('step.2')); assert.notEqual(feedbackState(r).category,'PROCEDURE_BLOCKED');   // the retry after the rejection
  r=await s.apply(act('step.3'));
  assert.equal(r.finalState.status,'complete'); assert.equal(isPracticeResultComplete('experiment',r),true);
});

test('order-free experiments (the 6 audited): any order is accepted and completes; nothing is blocked (no order imposed from array position)',async()=>{
  for(const id of AUDIT_SCOPE.STEP_ORDER_NOT_ENFORCED_BY_ENGINE){
    const {page,s}=await session(id);
    const actions=page.executionPlan.runtime==='beta2-advanced'?['connectCurrent','observeCathode','observeAnode']:page.referenceConfig.requiredActions;
    let r;
    for(const a of [...actions].reverse()){ r=await s.apply(act(a)); if(a!==actions[0]) assert.equal(feedbackState(r).category,'VALID_INTERMEDIATE',`${id}:${a}`); }
    assert.equal(feedbackState(r).category,'CORRECT',id); assert.equal(isPracticeResultComplete('experiment',r),true,id);
  }
});

test('option order: code points of the NFC lower-cased label — the same in every runtime (Node and Chromium disagreed with localeCompare)',()=>{
  assert.equal(codepointOrder('Ortadi','O‘zgarmaydi'),-1);
  assert.equal(codepointOrder('a','A'),0);
  const labels=createLabeler(createLocalizer({interaction:parseInteractionCatalog(JSON.parse(read('content-src/locales/uz-latn/learner-interaction.json')))}));
  const choices=buildChoices({domain:'kinetics-effect',values:[...KINETICS_EFFECTS],valueType:'text',source:'test'},labels);
  assert.deepEqual(choices.map(c=>c.value),['decrease','increase','no-change']);
  assert.deepEqual(choices.map(c=>c.label),['Kamayadi','Ortadi','O‘zgarmaydi']);
});

test('catalog: the taxonomy and validation texts are required keys and carry no verdict where none exists',()=>{
  const labels=JSON.parse(read('content-src/locales/uz-latn/learner-interaction.json')).labels;
  for(const k of ['ui.intermediate','ui.procedure-blocked','ui.sim-target-only','ui.quiz-unanswered','ui.reflection-incomplete']){ assert.ok(REQUIRED_UI_KEYS.includes(k),k); assert.ok(labels[k],k); }
  assert.doesNotMatch(labels['ui.intermediate'],/to‘g‘ri|noto‘g‘ri|✓|✗/i);
  assert.doesNotMatch(labels['ui.procedure-blocked'],/noto‘g‘ri|✗/i);
  assert.match(labels['ui.quiz-unanswered'],/\{list\}/); assert.match(labels['ui.reflection-incomplete'],/\{list\}.*\{min\}/);
});

test('quiz + reflection: the page validates (novalidate, role=alert, aria-invalid, focus) — no browser popup decides',()=>{
  const src=read('src/features/learning-hub/render.ts');
  assert.match(src,/kl-reinforcement-form',attrs:\{novalidate:''\}/);
  assert.match(src,/role:'alert'/);
  const model=read('src/features/learning-hub/model.ts');
  assert.match(model,/ui\.quiz-unanswered/); assert.match(model,/ui\.reflection-incomplete/);
  assert.match(src,/validationText\(model,'quizUnanswered'/); assert.match(src,/validationText\(model,'reflectionIncomplete'/);
  assert.match(src,/setAttribute\('aria-invalid','true'\)/);
});

test('audit report + packets are current, complete and pre-select nothing',()=>{
  const committed=JSON.parse(read('reports/feedback-semantics-expansion.json'));
  const out=feedbackOutputs(committed.bundleDelta);
  for(const [rel,text] of Object.entries(out)) assert.equal(read(rel),text,`stale: ${rel} (npm run feedback:semantics)`);
  const packets=fs.readdirSync(path.join(root,'review-packets/feedback-semantics')).filter(f=>f!=='README.md');
  assert.equal(packets.length,Object.keys(out).length-3,'no orphan packet');
  const report=JSON.parse(out['reports/learner-feedback-semantics.json']);
  assert.equal(report.activities.length,35);
  assert.deepEqual(report.activities.map(a=>a.activityId),[...AUDIT_SCOPE.ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE,...AUDIT_SCOPE.STEP_ORDER_NOT_ENFORCED_BY_ENGINE]);
  assert.deepEqual({c:report.summary.SEMANTICS_CLEAR,t:report.summary.TECHNICAL_FIX_ELIGIBLE,h:report.summary.HUMAN_DECISION_REQUIRED,k:report.summary.CONTENT_REQUIRED},{c:1,t:0,h:34,k:0});
  assert.ok(report.activities.every(a=>a.evidenceSemanticsChanged===false&&a.scoringChanged===false));
  assert.ok(report.activities.filter(a=>a.activityType==='simulation'&&a.state!=='SEMANTICS_CLEAR').every(a=>a.canonicalIncorrect.defined===false));
  assert.ok(report.activities.filter(a=>a.activityType==='experiment').every(a=>a.orderDeclared===false));
  for(const f of packets){
    const text=read(`review-packets/feedback-semantics/${f}`);
    assert.doesNotMatch(text,/\[x\]/i,`${f}: an option is pre-selected`);
    assert.equal((text.match(/- \[ \] \*\*[ABC]\./g)??[]).length,3,f);
  }
});

test('invariants: config versions untouched, no UI module writes mastery',()=>{
  for(const id of [...AUDIT_SCOPE.ENGINE_GIVES_NO_VERDICT_FOR_NON_TARGET_STATE,...AUDIT_SCOPE.STEP_ORDER_NOT_ENFORCED_BY_ENGINE]){
    const row=JSON.parse(read('reports/learner-feedback-semantics.json')).activities.find(a=>a.activityId===id);
    assert.equal(row.configVersion,'1.0.0',id);
  }
  for(const f of ['src/features/practice/render.ts','src/features/learning-hub/render.ts','src/runtime/shared/learner-input.ts']) assert.doesNotMatch(read(f),/saveMastery|putMastery|writeMastery|mastery\.put/,f);
});

// ---- P2.9 content revision: semantic contentVersion vs deploy/cache contentRevision (ADR-P2-010 §7) ----
// contentRevision = the pack's FULL canonical aggregate checksum (64 lowercase hex). Cases A–H of the closeout review.
import os from 'node:os';
import crypto from 'node:crypto';
import {applyRevisionLayout,revisionLayoutProblems,immutableUrlCollisions,contentRevisionOf} from '../scripts/lib/content-revision.ts';
import {packLocation,CONTENT_REVISION_LENGTH} from '../src/runtime/compatibility/release-pointer.ts';
import {promoteRelease,rollbackRelease,readCurrentRelease} from '../scripts/release-registry.ts';
import {spawnSync} from 'node:child_process';

const tmpdir=(p)=>fs.mkdtempSync(path.join(os.tmpdir(),p));
function sourcePackCopy(){ const dir=tmpdir('kl-rev-'); fs.cpSync(path.join(root,'public/content'),dir,{recursive:true}); return dir; }
const readPointer=(dir)=>JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const writePointer=(dir,p)=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(p));
/** change one byte of one pack file in a SOURCE-layout copy and reseal its manifest + pointer (an honest rebuild) */
function changeOneByte(dir){
  const pointer=readPointer(dir), vDir=path.join(dir,pointer.activeVersion), mf=path.join(vDir,'manifest.json');
  const m=JSON.parse(fs.readFileSync(mf,'utf8')); const entry=m.files.find(f=>f.path==='concepts.json'); const file=path.join(vDir,'concepts.json');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8')+'\n');
  const bytes=fs.readFileSync(file); entry.size=bytes.length; entry.checksum=crypto.createHash('sha256').update(bytes).digest('hex');
  m.checksum=crypto.createHash('sha256').update(m.files.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n')).digest('hex');
  fs.writeFileSync(mf,JSON.stringify(m)); writePointer(dir,{...pointer,checksum:m.checksum});
}
const fetchFrom=(base)=>async(url)=>{ const rel=url.replace(/^\/content\//,''); const f=path.join(base,...rel.split('/')); if(!fs.existsSync(f)) return {ok:false,status:404}; const b=fs.readFileSync(f); return {ok:true,status:200,json:async()=>JSON.parse(b.toString('utf8')),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}; };
const load=(dir)=>new ContentClient({fetchImpl:fetchFrom(dir),baseUrl:'/content'}).loadPractice('practice.simulation.7.02.planned');

test('content revision = the FULL 64-hex canonical pack checksum; contentVersion and the semantic records stay',()=>{
  assert.equal(CONTENT_REVISION_LENGTH,64);
  const dir=sourcePackCopy();
  try{
    const source=readPointer(dir);
    const {contentVersion,contentRevision}=applyRevisionLayout(dir);
    assert.match(contentRevision,/^[a-f0-9]{64}$/);
    assert.equal(contentRevision,source.checksum,'the revision IS the canonical pack checksum (no truncation, no second hash)');
    const m=JSON.parse(fs.readFileSync(path.join(dir,contentVersion,contentRevision,'manifest.json'),'utf8'));
    assert.equal(crypto.createHash('sha256').update(m.files.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n')).digest('hex'),contentRevision,'… recomputed from the file list');
    assert.equal(contentVersion,source.activeVersion,'the SEMANTIC version is unchanged');
    assert.deepEqual(readPointer(dir),{activeVersion:contentVersion,activeRevision:contentRevision,checksum:source.checksum,manifest:`${contentVersion}/${contentRevision}/manifest.json`});
    assert.deepEqual(revisionLayoutProblems(dir),[]);
    // activity versions, review targets and approval registers are byte-identical to main (the P2.8 merge abdb379)
    for(const f of ['content-src/practice-activities.json','content-src/theory-activities.json','content-src/manifest.yaml','review-packets/beta1-approval-register.json','review-packets/beta2-approval-register.json','review-packets/beta3-approval-register.json']){
      const base=spawnSync('git',['show',`abdb379de6fd3f2b89f346b074d9616f02ac7c3d:kimyolab/${f}`],{cwd:root,encoding:'utf8',maxBuffer:1<<28});
      if(base.status===0) assert.equal(read(f),base.stdout,`${f} unchanged`);
    }
  }finally{ fs.rmSync(dir,{recursive:true,force:true}); }
});

test('A: identical pack bytes → the same full revision; B: one changed byte, same contentVersion → a different full revision',()=>{
  const a=sourcePackCopy(), b=sourcePackCopy(), c=sourcePackCopy();
  try{
    const ra=applyRevisionLayout(a), rb=applyRevisionLayout(b);
    assert.equal(rb.contentRevision,ra.contentRevision,'A: same bytes, same revision');
    changeOneByte(c); const rc=applyRevisionLayout(c);
    assert.equal(rc.contentVersion,ra.contentVersion,'B: same semantic version');
    assert.notEqual(rc.contentRevision,ra.contentRevision,'B: different revision');
    assert.match(rc.contentRevision,/^[a-f0-9]{64}$/);
    assert.deepEqual(immutableUrlCollisions(a,c),[],'different revisions share no immutable URL');
  }finally{ for(const d of [a,b,c]) fs.rmSync(d,{recursive:true,force:true}); }
});

test('C/D: a truncated 16-hex revision and a forged 64-hex revision are rejected (client, preflight layout, pointer parser); nothing is normalized',async()=>{
  const forge=(revision)=>{ const d=sourcePackCopy(); const {contentVersion,contentRevision}=applyRevisionLayout(d); fs.renameSync(path.join(d,contentVersion,contentRevision),path.join(d,contentVersion,revision)); writePointer(d,{...readPointer(d),activeRevision:revision,manifest:`${contentVersion}/${revision}/manifest.json`}); return {d,contentVersion,contentRevision}; };
  // C: the old 16-hex prefix of the real checksum
  const real=readPointer(path.join(root,'public/content')).checksum;
  const c=forge(real.slice(0,16));
  try{
    assert.equal(packLocation(readPointer(c.d)),null,'a 16-hex revision is not a pack location');
    await assert.rejects(load(c.d),(e)=>e.code==='CONTENT_MANIFEST_INVALID');
    assert.match(revisionLayoutProblems(c.d).join(' '),/POINTER_REVISION_MISSING|POINTER_NOT_REVISION_QUALIFIED/);
  }finally{ fs.rmSync(c.d,{recursive:true,force:true}); }
  // D: well-formed 64 hex that is not the pack checksum
  const d=forge('f'.repeat(64));
  try{
    assert.ok(packLocation(readPointer(d.d)),'syntactically a location');
    await assert.rejects(load(d.d),(e)=>e.code==='CONTENT_INTEGRITY_ERROR');
    assert.match(revisionLayoutProblems(d.d).join(' '),/REVISION_NOT_DERIVED_FROM_PACK/);
    assert.match(revisionLayoutProblems(d.d).join(' '),/POINTER_REVISION_NOT_CHECKSUM/);
  }finally{ fs.rmSync(d.d,{recursive:true,force:true}); }
  // upper case / padded values are not normalized into a valid revision
  for(const bad of [real.toUpperCase(),` ${real}`,real.slice(0,63)]) assert.equal(packLocation({activeVersion:'2026.09.1',activeRevision:bad,manifest:`2026.09.1/${bad}/manifest.json`}),null,JSON.stringify(bad));
  assert.throws(()=>contentRevisionOf(real.slice(0,16)),/CONTENT_CHECKSUM_INVALID/);
  assert.equal(contentRevisionOf(real),real);
});

test('fail closed: edited byte, stray file, manifest checksum, un-revisioned copy, source-layout pointer in a deployment',()=>{
  const mk=()=>{ const d=sourcePackCopy(); const r=applyRevisionLayout(d); return {d,...r,pack:path.join(d,r.contentVersion,r.contentRevision)}; };
  const cases=[
    ['edited byte',({pack})=>{ const f=path.join(pack,'concepts.json'); fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/"/,' "')); },/FILE_CHECKSUM_MISMATCH:concepts\.json/],
    ['stray immutable file',({pack})=>fs.writeFileSync(path.join(pack,'extra.json'),'{}'),/UNLISTED_FILE:extra\.json/],
    ['manifest checksum differs',({pack})=>{ const f=path.join(pack,'manifest.json'); const m=JSON.parse(fs.readFileSync(f,'utf8')); fs.writeFileSync(f,JSON.stringify({...m,checksum:'0'.repeat(64)})); },/PACK_CHECKSUM_MISMATCH/],
    ['un-revisioned copy beside the revision',({d,contentVersion})=>fs.writeFileSync(path.join(d,contentVersion,'concepts.json'),'[]'),/OUTSIDE_REVISION:/],
    ['source-layout pointer',({d,contentVersion})=>{ const p=readPointer(d); writePointer(d,{activeVersion:p.activeVersion,checksum:p.checksum,manifest:`${contentVersion}/manifest.json`}); },/POINTER_NOT_REVISION_QUALIFIED|POINTER_REVISION_MISSING/],
  ];
  for(const [name,mutate,expected] of cases){
    const ctx=mk();
    try{ mutate(ctx); assert.match(revisionLayoutProblems(ctx.d).join(' '),expected,name); }
    finally{ fs.rmSync(ctx.d,{recursive:true,force:true}); }
  }
});

test('E/F: upgrade selects the new pack atomically; rollback returns to the previous artefact; no immutable URL changes bytes',async()=>{
  const artifact=(changed)=>{ const dir=tmpdir('kl-rel-'); const content=path.join(dir,'content'); fs.cpSync(path.join(root,'public/content'),content,{recursive:true}); if(changed) changeOneByte(content); const r=applyRevisionLayout(content); fs.writeFileSync(path.join(dir,'release-manifest.json'),JSON.stringify({releaseId:changed?'current':'previous',contentRevision:r.contentRevision})); return {dir,content,...r}; };
  const prev=artifact(false), cur=artifact(true), registry=tmpdir('kl-registry-');
  try{
    promoteRelease(registry,'previous',prev.dir); promoteRelease(registry,'current',cur.dir);
    const active=()=>path.join(registry,'releases',readCurrentRelease(registry).activeRelease,'content');
    // E: the active release's pointer names exactly its own revision, and the client loads that pack
    assert.equal(readCurrentRelease(registry).activeRelease,'current');
    assert.equal(readPointer(active()).activeRevision,cur.contentRevision);
    assert.equal((await load(active())).contentVersion,cur.contentVersion);
    // F: rollback switches the whole artefact (pointer + pack) back
    rollbackRelease(registry);
    assert.equal(readCurrentRelease(registry).activeRelease,'previous');
    assert.equal(readPointer(active()).activeRevision,prev.contentRevision);
    assert.equal((await load(active())).contentVersion,prev.contentVersion);
    assert.notEqual(prev.contentRevision,cur.contentRevision);
    assert.deepEqual(immutableUrlCollisions(path.join(registry,'releases','previous','content'),path.join(registry,'releases','current','content')),[]);
    // a forged release reusing the previous revision directory with the new bytes is caught
    fs.renameSync(path.join(cur.content,cur.contentVersion,cur.contentRevision),path.join(cur.content,cur.contentVersion,prev.contentRevision));
    assert.deepEqual(immutableUrlCollisions(prev.content,cur.content),[`${prev.contentVersion}/${prev.contentRevision}/concepts.json`]);
  }finally{ for(const d of [prev.dir,cur.dir,registry]) fs.rmSync(d,{recursive:true,force:true}); }
});
