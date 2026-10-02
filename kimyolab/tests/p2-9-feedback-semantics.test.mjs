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
