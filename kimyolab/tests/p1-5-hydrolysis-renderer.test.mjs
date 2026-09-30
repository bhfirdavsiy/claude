// P1.5 — hydrolysis-medium reference renderer: domain authority (HydrolysisModel), the trial rules
// (predict before reveal, wrong predictions as evidence, unmodeled salts fail closed), the canonical
// HydrolysisRendererModel converter, typed intents, 9.14 + 11.11 through one capability, retry = new attempt,
// the renderer family contract (atom + hydrolysis: one registry, one host, one readiness path), guards, reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {evaluateHydrolysisTrials,assertHydrolysisTarget} from '../src/domain/chemistry/hydrolysis-trial.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';
import {toHydrolysisRendererModel,HYDROLYSIS_RENDERER_MODEL_SCHEMA} from '../src/renderers/hydrolysis-medium/renderer-model.ts';
import {hydrolysisIntent,hydrolysisMediumRenderer} from '../src/renderers/hydrolysis-medium/renderer.ts';
import {atomBuilderRenderer} from '../src/renderers/atom-builder/renderer.ts';
import {HYDROLYSIS_MEDIUM_CAPABILITY,ATOM_BUILDER_CAPABILITY,RENDERER_CATALOG} from '../src/renderers/catalog.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {buildHydrolysisReport,HYDROLYSIS_REPORT,buildRegistryReport} from '../scripts/renderer-reports.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {renderPracticePage} from '../src/features/practice/host.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {installMiniDom} from './helpers/mini-dom.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const DATA=read('content-src/chemistry/hydrolysis.json');
const model=HydrolysisModel.from(DATA);
const EXP='practice.experiment.9.14', SIM='practice.simulation.11.11.planned';
const RAW_CODE=/\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;
const settle=async()=>{ for(let i=0;i<30;i++) await new Promise(r=>setTimeout(r,0)); };
const sel=(salt)=>({type:'selectSalt',payload:{salt}}), pred=(medium)=>({type:'predictMedium',payload:{medium}}), reveal={type:'addIndicator'};
const client=()=>new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});

// ------------------------------------------------------------------ domain audit

test('domain audit: the modeled salts come from content, ≥2 distinct outcomes, review stays pending',()=>{
  assert.deepEqual(model.salts(),DATA.records.map(r=>r.salt));
  assert.equal(model.salts().length,4);
  assert.ok(new Set(model.salts().map(s=>model.classify(s).medium)).size>=2,'at least two distinct media');
  assert.deepEqual(model.classify('KNO3'),{modeled:false,code:'HYDROLYSIS_NOT_MODELED'},'unmodeled salt fails closed');
  assert.ok(DATA.records.every(r=>r.reviewStatus==='pending'),'no chemistry approval by tooling');
  assert.equal(DATA.indicator.reviewStatus,'pending');
  for(const m of ['acidic','basic','neutral']) assert.equal(model.indicatorColor(m).modeled,true);
  // P1.5 closeout: a partial colour map loads (the missing medium fails closed at reveal — p1-5-closeout); a
  // structurally invalid block is rejected. The old expectation (partial map = invalid) conflated the two.
  assert.throws(()=>HydrolysisModel.from({...DATA,indicator:{...DATA.indicator,colors:{acidic:'not-a-colour'}}}),/HYDROLYSIS_INDICATOR_INVALID/);
  assert.equal(HydrolysisModel.from({...DATA,indicator:{...DATA.indicator,colors:{acidic:'red'}}}).indicatorColor('basic').modeled,false);
  assert.equal(HydrolysisModel.from({records:DATA.records}).indicatorColor('acidic').modeled,false,'no indicator content → no invented colour');
});

// ------------------------------------------------------------------ trial rules

test('trial: predict BEFORE reveal is credited; the verdict and the observation come from the domain',()=>{
  const s=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('acidic'),reveal]);
  assert.equal(s.achieved,true);
  assert.deepEqual(s.trials,[{n:1,selectedSalt:'AlCl3',predictedMedium:'acidic',actualMedium:model.classify('AlCl3').medium,indicator:'litmus',indicatorColor:model.indicatorColor('acidic').color,correct:true,predictedBeforeReveal:true}]);
});

test('trial: a prediction AFTER the reveal is recorded but never credited; a wrong prediction is a trial, not an error',()=>{
  const late=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),reveal,pred('acidic')]);
  assert.equal(late.achieved,false);
  assert.deepEqual([late.trials[0].correct,late.trials[0].predictedBeforeReveal],[true,false]);
  const wrong=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('basic'),reveal]);
  assert.deepEqual([wrong.achieved,wrong.trials[0].correct,wrong.trials[0].actualMedium],[false,false,'acidic']);
  // after a recorded trial the prediction is locked
  const locked=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('basic'),reveal,pred('acidic')]);
  assert.equal(locked.rejected,'HYDROLYSIS_PREDICTION_LOCKED'); assert.equal(locked.trials.length,1); assert.equal(locked.achieved,false);
  // P1.5 closeout: re-selecting a salt whose medium was already revealed would only copy the answer — it is
  // rejected (the old expectation "a new selection of the same salt opens a credited trial" allowed that copy)
  const again=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('basic'),reveal,sel('AlCl3'),pred('acidic'),reveal]);
  assert.deepEqual(again.trials.map(t=>t.correct),[false]); assert.equal(again.achieved,false);
  const next=evaluateHydrolysisTrials(model,'AlCl3',[sel('Na2CO3'),pred('acidic'),reveal,sel('AlCl3'),pred('acidic'),reveal]);
  assert.deepEqual(next.trials.map(t=>t.correct),[false,true]); assert.equal(next.achieved,true,'a different salt is a new trial');
  // other salts are exploration: a correct prediction on another salt does not complete the target task
  const other=evaluateHydrolysisTrials(model,'AlCl3',[sel('Na2CO3'),pred('basic'),reveal]);
  assert.deepEqual([other.trials[0].correct,other.achieved],[true,false]);
});

test('trial: unmodeled salt, no salt, invalid medium and legacy recordMedium fail closed without an observation',()=>{
  const cases=[[[sel('KNO3')],'HYDROLYSIS_NOT_MODELED'],[[sel('KNO3'),reveal],'HYDROLYSIS_NO_SALT'],[[pred('acidic')],'HYDROLYSIS_NO_SALT'],[[sel('AlCl3'),pred('sour')],'HYDROLYSIS_ACTION_INVALID'],[[sel('AlCl3'),{type:'recordMedium',payload:{medium:'acidic'}}],'HYDROLYSIS_ACTION_INVALID']];
  for(const [actions,code] of cases){
    const s=evaluateHydrolysisTrials(model,'AlCl3',actions);
    assert.equal(s.rejected,code,JSON.stringify(actions));
    assert.equal(s.trials.length,0); assert.equal(s.achieved,false);
    assert.ok(s.current.observation===null);
  }
  // revealing twice is idempotent (one trial)
  assert.equal(evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('acidic'),reveal,reveal]).trials.length,1);
  // a config whose target is unmodeled, or whose expected medium contradicts the domain, fails closed
  assert.throws(()=>assertHydrolysisTarget(model,'KNO3'),/HYDROLYSIS_NOT_MODELED/);
  assert.throws(()=>assertHydrolysisTarget(model,'AlCl3','basic'),/HYDROLYSIS_CONFIG_MISMATCH/);
});

test('evidence: a trial is answer evidence with selectedSalt/predictedMedium/actualMedium/correct; late credit is invalid',async()=>{
  const page=await client().loadPractice(EXP);
  const session=new ReferencePracticeSession(page);
  for(const a of [sel('Na2CO3'),pred('acidic'),reveal]) await session.apply(hydrolysisIntent(a,page.type));
  const r=await session.result();
  const ev=r.evidence.find(e=>e.type==='answer');
  assert.deepEqual([ev.selectedSalt,ev.predictedMedium,ev.actualMedium,ev.correct,ev.predictedBeforeReveal,ev.score],['Na2CO3','acidic','basic',false,true,0]);
  assert.doesNotThrow(()=>validateEvidence(ev));
  assert.throws(()=>validateEvidence({...ev,correct:true}),/EVIDENCE_INVALID/,'correct must match the domain');
  assert.throws(()=>validateEvidence({...ev,predictedMedium:'basic',correct:true,predictedBeforeReveal:false,score:1}),/EVIDENCE_INVALID/,'no credit after the reveal');
});

// ------------------------------------------------------------------ domain parity: 4-salt matrix

test('domain parity: every modeled salt → engine evidence = renderer observation = HydrolysisModel (no duplicated table)',async()=>{
  const page=await client().loadPractice(EXP);
  const outcomes=new Set();
  for(const salt of model.salts()){
    const domain=model.classify(salt).medium;
    for(const guess of ['acidic','basic','neutral']){
      const session=new ReferencePracticeSession(page);
      let r; for(const a of [sel(salt),pred(guess),reveal]) r=await session.apply(hydrolysisIntent(a,page.type));
      const ev=r.evidence.find(e=>e.type==='answer');
      const m=toHydrolysisRendererModel(r);
      assert.equal(ev.actualMedium,domain,salt);
      assert.equal(m.observation.medium,domain,salt);
      assert.equal(ev.correct,guess===domain,`${salt}/${guess}`);
      assert.equal(m.feedback.result,guess===domain?'correct':'incorrect');
      assert.equal(isPracticeResultComplete(page.type,r),salt===page.referenceConfig.salt&&guess===domain,`${salt}/${guess}`);
      outcomes.add(m.observation.text);
    }
  }
  assert.ok(outcomes.size>=2,'model-based: different salts give different observations');
});

test('unknown salt through a crafted intent fails closed: localized rejection, no observation, nothing completes',async()=>{
  const page=await client().loadPractice(EXP);
  const session=new ReferencePracticeSession(page);
  let r; for(const a of [sel('KNO3'),reveal]) r=await session.apply(hydrolysisIntent(a,page.type));
  const m=toHydrolysisRendererModel(r);
  assert.equal(m.observation,null);
  assert.equal(m.rejection,'Avval tuzni tanlang.');
  r=await session.apply(hydrolysisIntent(sel('KNO3'),page.type));
  assert.equal(toHydrolysisRendererModel(r).rejection,'Bu tuz modelda yo‘q, shuning uchun uni sinab bo‘lmaydi.');
  assert.equal(isPracticeResultComplete(page.type,r),false);
  assert.ok(!toHydrolysisRendererModel(r).salts.some(s=>s.id==='KNO3'),'the learner is only offered modeled salts');
});

// ------------------------------------------------------------------ renderer model + intents

test('HydrolysisRendererModel: canonical converter, serializable, localized, no raw ids or codes in text',async()=>{
  const page=await client().loadPractice(EXP);
  const session=new ReferencePracticeSession(page);
  const start=toHydrolysisRendererModel(await session.result());
  assert.equal(start.schema,HYDROLYSIS_RENDERER_MODEL_SCHEMA);
  assert.deepEqual(start.salts.map(s=>s.id),model.salts());
  assert.deepEqual(start.salts.map(s=>s.label),['AlCl₃','Na₂CO₃','NaCl','NH₄Cl']);
  assert.deepEqual(start.media.map(m=>m.label),['Kislotali','Ishqoriy','Neytral']);
  assert.deepEqual([start.step,start.canPredict,start.canReveal],['chooseSalt',false,false]);
  let r; for(const a of [sel('AlCl3'),pred('acidic')]) r=await session.apply(hydrolysisIntent(a,page.type));
  assert.deepEqual([toHydrolysisRendererModel(r).step,toHydrolysisRendererModel(r).canReveal],['reveal',true]);
  r=await session.apply(hydrolysisIntent(reveal,page.type));
  const m=toHydrolysisRendererModel(r);
  assert.equal(m.observation.text,'Indikator (lakmus) qizil tusga o‘tdi. Muhit kislotali.');
  assert.equal(m.goalReached,true); assert.equal(m.canPredict,false); assert.equal(m.canReveal,false);
  assert.deepEqual(JSON.parse(JSON.stringify(m)),m);
  const texts=[m.accessibleSummary,m.observation.text,m.feedback.text,...m.trials.map(t=>t.text),...m.salts.map(s=>s.label),...m.media.map(x=>x.label)];
  for(const t of texts){ assert.doesNotMatch(t,RAW_CODE); assert.doesNotMatch(t,/\b(acidic|basic|neutral|litmus|red|blue)\b/,'English ids never reach the learner'); }
  assert.throws(()=>toHydrolysisRendererModel({finalState:{status:'x'}}),/HYDROLYSIS_RENDERER_MODEL_INPUT_INVALID/);
});

test('typed intents: SELECT_SALT by saltId, PREDICT_MEDIUM enum, ADD_INDICATOR — in the command kind of the engine',()=>{
  assert.deepEqual(hydrolysisIntent(sel('AlCl3'),'experiment'),{kind:'experiment-action',action:{type:'selectSalt',payload:{salt:'AlCl3'}}});
  assert.deepEqual(hydrolysisIntent(pred('basic'),'simulation'),{kind:'simulation-action',action:{type:'predictMedium',payload:{medium:'basic'}}});
  assert.deepEqual(hydrolysisIntent(reveal,'experiment'),{kind:'experiment-action',action:{type:'addIndicator'}});
  assert.deepEqual([...HYDROLYSIS_MEDIUM_CAPABILITY.intents],['experiment-action','simulation-action']);
});

test('11.11 (beta3 simulation) runs the same trial through simulation-action; its readiness is unchanged',async()=>{
  const page=await client().loadPractice(SIM);
  assert.equal(page.type,'simulation');
  assert.deepEqual(page.executionPlan.rendererRequirement,{capability:'hydrolysis-medium',range:'^1.0.0'});
  assert.equal(page.readiness.content,'REVIEW_PENDING','not released by the renderer');
  const session=new ReferencePracticeSession(page);
  const target=page.referenceConfig.salt;
  let r; for(const a of [sel(target),pred(model.classify(target).medium),reveal]) r=await session.apply(hydrolysisIntent(a,page.type));
  assert.equal(isPracticeResultComplete(page.type,r),true);
  assert.equal(toHydrolysisRendererModel(r).observation.medium,model.classify(target).medium);
});

// ------------------------------------------------------------------ browser-like flow + retry

test('renderer flow (mini DOM): indicator only after a prediction, locked after reveal, wrong prediction explained, aria-live',async()=>{
  const dom=installMiniDom();
  try{
    const page=await client().loadPractice(EXP);
    const session=new ReferencePracticeSession(page);
    renderPracticePage(dom.root,page,{apply:c=>session.apply(c),current:()=>session.result()},createDefaultRendererRegistry());
    await settle();
    const q=(s)=>dom.root.querySelector(s);
    const pick=async(s)=>{ const i=q(s); i.checked=true; i.dispatch('change'); await settle(); };
    assert.equal(q('[data-action="add-indicator"]').disabled,true,'no reveal before a salt');
    assert.equal(q('[data-medium="acidic"]').disabled,true,'no prediction before a salt');
    await pick('[data-salt="AlCl3"]');
    assert.equal(q('[data-action="add-indicator"]').disabled,true,'no reveal before a prediction (predict-before-reveal)');
    await pick('[data-medium="basic"]');
    assert.equal(q('[data-action="add-indicator"]').disabled,false);
    q('[data-action="add-indicator"]').click(); await settle();
    assert.equal(q('[data-field="observation"]').textContent,'qizil (lakmus) — Kislotali');
    assert.equal(q('.kl-hydro__feedback').dataset.result,'incorrect');
    assert.match(q('.kl-hydro__feedback').textContent,/^✗ Bashoratingiz noto‘g‘ri/);
    assert.equal(q('[data-medium="acidic"]').disabled,true,'the prediction is locked after the reveal');
    const status=q('[role="status"]');
    assert.equal(status.getAttribute('aria-live'),'polite');
    assert.match(status.textContent,/Indikator \(lakmus\) qizil tusga o‘tdi\. Muhit kislotali\./);
    // P1.5 closeout: the tried salt cannot be chosen again in this attempt; another salt is a new trial
    await pick('[data-salt="NaCl"]');
    assert.equal(q('[data-salt="AlCl3"]').disabled,true,'AlCl3 was tried in this attempt');
    assert.match(q('[data-salt="AlCl3"]').parentNode.textContent,/sinab ko‘rilgan/);
    await pick('[data-medium="neutral"]'); q('[data-action="add-indicator"]').click(); await settle();
    assert.equal(q('.kl-hydro__feedback').dataset.result,'correct');
    assert.equal(q('.kl-hydro__goal-state').dataset.goal,'pending','a correct trial on another salt does not reach the goal');
    assert.equal(dom.root.querySelectorAll('li').length,2,'two trials in the history');
  }finally{ dom.restore(); }
});

test('retry opens a NEW attempt; the old attempt and its (wrong) evidence stay immutable',async()=>{
  const page=await client().loadPractice(EXP);
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'retry',{liveness:null});
  const store=new IndexedDbProgressStore(factory,'retry');
  const first=service.beginPracticeSession(page,new ReferencePracticeSession(page));
  for(const a of [sel('AlCl3'),pred('basic'),reveal]) await service.applyPracticeCommand(first,hydrolysisIntent(a,page.type));
  const snapshot=JSON.stringify(await store.listEvidence());
  const second=await service.retryPracticeSession(first,new ReferencePracticeSession(page));
  assert.notEqual(second.attemptId??second.id,first.attemptId??first.id);
  for(const a of [sel('AlCl3'),pred('acidic'),reveal]) await service.applyPracticeCommand(second,hydrolysisIntent(a,page.type));
  const attempts=await store.listAttempts();
  assert.equal(attempts.length,2,'two attempts');
  const all=await store.listEvidence();
  for(const e of JSON.parse(snapshot)) assert.deepEqual(all.find(x=>x.id===e.id),e,'old evidence unchanged');
  const wrong=all.find(e=>e.selectedSalt==='AlCl3'&&e.correct===false);
  assert.ok(wrong,'the wrong prediction is kept as evidence');
  assert.ok(all.some(e=>e.selectedSalt==='AlCl3'&&e.correct===true&&e.attemptId!==wrong.attemptId),'the correct one belongs to the new attempt');
  // the host offers the retry only through the port (the renderer never navigates or writes)
  const host=fs.readFileSync(path.join(root,'src/features/practice/host.ts'),'utf8');
  assert.match(host,/port\.retry/);
});

// ------------------------------------------------------------------ renderer family contract

test('renderer family: atom + hydrolysis — one registry, one host, one readiness path, declared intents only',async()=>{
  const registry=createDefaultRendererRegistry();
  assert.deepEqual(registry.capabilities().map(c=>c.id),RENDERER_CATALOG.map(c=>c.id));
  assert.deepEqual(RENDERER_CATALOG.map(c=>c.id),['atom-builder','hydrolysis-medium']);
  for(const [impl,cap] of [[atomBuilderRenderer,ATOM_BUILDER_CAPABILITY],[hydrolysisMediumRenderer,HYDROLYSIS_MEDIUM_CAPABILITY]]){
    assert.equal(impl.capability,cap);
    assert.equal(registry.resolve({capability:cap.id,range:'^1.0.0'}),impl);
    assert.deepEqual(Object.keys(cap.accessibility).sort(),['keyboard','nonColorCues','nonVisualAlternative','reducedMotion','screenReaderSummary']);
  }
  // one readiness path: an incompatible requirement BLOCKS either renderer's activity the same way
  for(const [id,src,capability] of [['practice.simulation.7.07.planned','reference-slices','atom-builder'],[EXP,'beta2-advanced','hydrolysis-medium']]){
    const s=structuredClone(loadSources());
    s.configs[src][id].rendererRequirement={capability,range:'^2.0.0'};
    const a=compileReadiness(s).pack.activities.find(x=>x.activityId===id);
    assert.deepEqual([a.runtime,a.reasons[0]],['BLOCKED','RENDERER_UNAVAILABLE'],id);
  }
  // the host refuses an undeclared intent kind for either renderer
  const dom=installMiniDom();
  try{
    const page=await client().loadPractice(EXP);
    let host;
    const spy={capability:HYDROLYSIS_MEDIUM_CAPABILITY,mount(_r,h){ host=h; return {update(){},destroy(){}}; }};
    const reg=new (registry.constructor)(); reg.register(spy);
    renderPracticePage(dom.root,page,{apply:async()=>({}),current:async()=>({})},reg);
    await assert.rejects(host.dispatch({kind:'trainer-answer',answer:'x'}),/RENDERER_INTENT_UNDECLARED/);
  }finally{ dom.restore(); }
});

test('guards: renderers never import content/config data; the hydrolysis package is clean',()=>{
  const rules=(src,file='src/renderers/hydrolysis-medium/renderer.ts')=>checkSource(file,src).map(v=>v.rule);
  for(const bad of [
    "import data from '../../../content-src/chemistry/hydrolysis.json' with {type:'json'};",
    "import cfg from '../../../content-src/activity-configs/beta2-advanced.json' with {type:'json'};",
    "const d=await fetch('/content/2026.09.1/chemistry/hydrolysis.json');",
    "const d=await import('../../../content-src/chemistry/hydrolysis.json');",
    "import {ContentClient} from '../../app/content-client.ts';",
    "const u=`${base}/chemistry/hydrolysis.json`;",
  ]) assert.ok(rules(bad).includes('RENDERER_IMPORTS_CONTENT_DATA'),bad);
  assert.ok(rules("import {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';").includes('CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'));
  assert.deepEqual(rules("import type {HydrolysisTrialState} from '../../domain/chemistry/hydrolysis-trial.ts'; const t='Kislotali';"),[]);
  for(const f of fs.readdirSync(path.join(root,'src/renderers'),{recursive:true}).map(String).filter(f=>f.endsWith('.ts')))
    assert.deepEqual(checkSource(`src/renderers/${f}`,fs.readFileSync(path.join(root,'src/renderers',f),'utf8')),[],f);
});

// ------------------------------------------------------------------ reports + governance

test('hydrolysis report: deterministic, PASS, model-based — and FAILS when the flow is canned',async()=>{
  const report=await buildHydrolysisReport();
  assert.deepEqual(read(HYDROLYSIS_REPORT),report,'run npm run renderer:reports');
  assert.equal(report.status,'PASS');
  assert.deepEqual(report.modeledSalts,model.salts());
  assert.ok(report.distinctOutcomes>=2);
  assert.equal(report.evidenceParity.equal,true);
  assert.equal(report.accessibility.keyboardE2E.keyboardOnly,true);
  const canned={...DATA,records:DATA.records.map(r=>({...r,medium:'acidic'}))};
  const cannedReport=await buildHydrolysisReport(root,{hydrolysisData:canned});
  assert.equal(cannedReport.status,'FAIL');
  assert.equal(cannedReport.distinctOutcomes,1);
  assert.equal(cannedReport.checks.modelBased,false);
  const registry=buildRegistryReport();
  assert.deepEqual(registry.renderers.filter(r=>r.status==='ACTIVE').map(r=>r.capability),['atom-builder','hydrolysis-medium']);
});

test('governance: no release, no approval — readiness counts unchanged, reviews pending, no sign-offs',()=>{
  const v=read('public/content/manifest.json').activeVersion;
  const readiness=read(`public/content/${v}/activity-readiness.json`);
  const count=(k)=>readiness.activities.filter(a=>a.runtime===k).length;
  assert.deepEqual([count('READY'),count('PENDING'),count('DISABLED')],[118,27,1]);
  for(const id of [EXP,SIM]) assert.equal(readiness.activities.find(a=>a.activityId===id).content,'REVIEW_PENDING');
  assert.deepEqual(read('content-src/pilot-signoffs.json').records,[],'no sign-off created by tooling');
  assert.equal(read('content-src/locales/uz-latn/chemistry-elements.json').reviewStatus,'pending');
  // global strict readiness stays off: strict enforcement only for the pilot units' primary practices
  const mappings=read('content-src/mapping-links.json');
  const pilotPrimaries=new Set(readiness.pilotLearningUnitIds.map(u=>mappings.find(m=>m.learningUnitId===u&&m.role==='primary')?.practiceActivityId));
  for(const a of readiness.activities.filter(a=>a.enforcement==='strict')) assert.ok(pilotPrimaries.has(a.activityId),a.activityId);
  assert.ok(readiness.activities.filter(a=>a.enforcement==='observe').length>100);
});
