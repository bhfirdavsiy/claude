// P1.3 — pilot sign-off: machine checks vs human decisions, the pilot gate, pending-activity triage, the
// renderer foundation report, the completion fix of the beta runtimes and the new architecture guard rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {derivePilotStatus,pilotGate,pilotBasis} from '../src/domain/pilot/acceptance.ts';
import {evaluatePilot,signoffState,MATRIX_FILE} from '../scripts/pilot-status.ts';
import {buildPendingTriage,TRIAGE_FILE} from '../scripts/pending-triage.ts';
import {buildRendererReadiness,RENDERER_REPORT_FILE} from '../scripts/renderer-foundation-readiness.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {assessmentItemHash} from '../src/domain/assessment/governance.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {buildMasteryView} from '../src/domain/mastery/view.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const committed=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const sources=()=>structuredClone(loadSources());
const c=(id,dimension,kind,verdict)=>({id,dimension,kind,verdict,detail:id});
const person=(item,role,extra={})=>({itemId:item.id,role,decision:'approved',reviewerId:role==='chemistry'?'nodira.chem':'bekzod.didactic',reviewerRole:role,reviewedAt:'2026-09-28T09:00:00.000Z',itemHash:assessmentItemHash(item),itemVersion:item.version,evidence:{packet:`review-packets/assessment-pilot/${item.id}.md`,packetSha256:'b'.repeat(64)},...(role==='didactic'?{outcomeDecision:'confirm'}:{}),...extra});
const row=(matrix,lu)=>matrix.rows.find(r=>r.learningUnitId===lu);
const check=(r,id)=>r.checks.find(x=>x.id===id);

// ------------------------------------------------------------------ the pure acceptance model

test('acceptance model: machine PASS never yields PILOT_READY without a current human sign-off',()=>{
  const machine=[c('technical.route','technical','machine','PASS'),c('mastery.eligible','mastery','machine','PASS')];
  const human=[c('content.activity-review','content','human','PENDING')];
  assert.equal(derivePilotStatus([...machine,...human],'NONE').status,'CONTENT_REVIEW_PENDING');
  assert.equal(derivePilotStatus([...machine,...human],'NONE').technical,'TECHNICAL_PASS','technical readiness is reported separately');
  const approved=[c('content.activity-review','content','human','PASS')];
  assert.equal(derivePilotStatus([...machine,...approved],'NONE').status,'SIGNOFF_PENDING','all checks PASS is still not READY');
  assert.equal(derivePilotStatus([...machine,...approved],'REJECTED').status,'CONTENT_REVIEW_PENDING');
  assert.equal(derivePilotStatus([...machine,...approved],'STALE').status,'PILOT_BLOCKED','a sign-off on an old basis is a failure, not a pass');
  assert.equal(derivePilotStatus([...machine,...approved],'CURRENT').status,'PILOT_READY');
  assert.equal(derivePilotStatus([...machine,c('technical.practice-headless','technical','machine','FAIL'),...approved],'CURRENT').status,'PILOT_BLOCKED');
  assert.throws(()=>derivePilotStatus([c('technical.route','technical','machine','PENDING')],'NONE'),/PILOT_MACHINE_CHECK_PENDING/,'a machine check cannot be "pending"');
  assert.equal(pilotGate(['PILOT_READY','CONTENT_REVIEW_PENDING']),'PENDING');
  assert.equal(pilotGate(['PILOT_READY','PILOT_BLOCKED']),'FAIL');
  assert.equal(pilotGate(['PILOT_READY','PILOT_READY']),'PASS');
  assert.equal(pilotBasis('lu',[c('b','ux','machine','PASS'),c('a','ux','machine','PASS')]),pilotBasis('lu',[c('a','ux','machine','PASS'),c('b','ux','machine','PASS')]),'basis is order independent');
});

test('sign-off records: a person, the current basis, a reason for a rejection — automation never counts',()=>{
  const basis='a'.repeat(64);
  const rec=(extra={})=>({learningUnitId:'lu.7.11',reviewerId:'malika.pilot',role:'pilot-owner',decision:'signed_off',signedAt:'2026-09-28T09:00:00.000Z',basisHash:basis,...extra});
  assert.equal(signoffState([],'lu.7.11',basis),'NONE');
  assert.equal(signoffState([rec()],'lu.7.11',basis),'CURRENT');
  assert.equal(signoffState([rec()],'lu.7.11','b'.repeat(64)),'STALE');
  assert.equal(signoffState([rec({reviewerId:'claude-agent'})],'lu.7.11',basis),'INVALID');
  assert.equal(signoffState([rec({decision:'rejected'})],'lu.7.11',basis),'INVALID','a rejection needs a comment');
  assert.equal(signoffState([rec({decision:'rejected',comment:'Hali erta.'})],'lu.7.11',basis),'REJECTED');
  assert.deepEqual(committed('content-src/pilot-signoffs.json').records,[],'nobody has signed off a pilot; the agent signed off nothing');
});

// ------------------------------------------------------------------ the real pilot on production content

test('production pilot: technically valid, human review pending → gate PENDING (not a CI failure)',async()=>{
  const matrix=await evaluatePilot();
  assert.deepEqual(matrix.pilotLearningUnitIds,['lu.9.15','lu.7.11','lu.7.12','lu.7.07']);
  assert.equal(matrix.gate,'PENDING');
  for(const r of matrix.rows){
    assert.equal(r.technical,'TECHNICAL_PASS',r.learningUnitId);
    assert.equal(r.finalPilotStatus,'CONTENT_REVIEW_PENDING',r.learningUnitId);
    assert.deepEqual(r.blockers,[],r.learningUnitId);
    assert.equal(check(r,'content.activity-review').verdict,'PENDING','technical READY is not human APPROVED');
    assert.ok(r.checks.filter(x=>x.kind==='machine').every(x=>x.verdict==='PASS'||x.verdict==='NOT_APPLICABLE'),r.learningUnitId);
  }
  const golden=row(matrix,'lu.9.15');
  assert.equal(golden.goldenSlice,'assessment');
  assert.equal(check(golden,'assessment.dual-review').verdict,'PENDING');
  assert.match(check(golden,'assessment.dual-review').detail,/^0\/5 items APPROVED/);
  assert.equal(check(golden,'assessment.outcome-review').verdict,'PENDING','the proposed outcome mapping is not final');
  assert.match(check(golden,'mastery.no-false-mastery').detail,/MASTERED unreachable/);
  for(const lu of ['lu.7.11','lu.7.12','lu.7.07']) assert.equal(check(row(matrix,lu),'assessment.availability').verdict,'NOT_APPLICABLE','no objective assessment is invented for these pilots');
});

test('pilot matrix is deterministic and the committed report is current',async()=>{
  const a=await evaluatePilot();const b=await evaluatePilot();
  assert.deepEqual(a,b);
  assert.doesNotMatch(JSON.stringify(a),/generatedAt|"20\d\d-\d\d-\d\dT/,'no timestamps');
  assert.deepEqual(committed(MATRIX_FILE),a,'run npm run pilot:status');
});

test('dual review at pilot level: one approval / stale approvals / two current approvals',async()=>{
  const src=sources();
  const items=src.bank.items;
  // one role only → still pending
  src.reviews=items.map(i=>person(i,'chemistry'));
  assert.equal(check(row(await evaluatePilot({sources:src}),'lu.9.15'),'assessment.dual-review').verdict,'PENDING');
  // two independent current approvals → assessment dimension passes (the unit still awaits activity review)
  src.reviews=items.flatMap(i=>[person(i,'chemistry'),person(i,'didactic')]);
  const approved=row(await evaluatePilot({sources:src}),'lu.9.15');
  assert.equal(check(approved,'assessment.dual-review').verdict,'PASS');
  assert.equal(check(approved,'assessment.outcome-review').verdict,'PASS');
  assert.equal(approved.dimensions.assessment,'PASS');
  assert.equal(approved.finalPilotStatus,'CONTENT_REVIEW_PENDING');
  // the item changes after review → approvals invalid, and the stale records FAIL the gate
  const edited=sources();
  edited.reviews=items.flatMap(i=>[person(i,'chemistry'),person(i,'didactic')]);
  edited.bank.items[0].prompt=`${edited.bank.items[0].prompt} (tahrir)`;
  const matrix=await evaluatePilot({sources:edited});
  const stale=row(matrix,'lu.9.15');
  assert.equal(check(stale,'assessment.stale-reviews').verdict,'FAIL');
  assert.match(check(stale,'assessment.dual-review').detail,/^4\/5/);
  assert.equal(stale.finalPilotStatus,'PILOT_BLOCKED');
  assert.equal(matrix.gate,'FAIL');
});

test('machine failures FAIL the gate: invalid route, bad outcome mapping, a sign-off on an old basis',async()=>{
  const noRoute=sources();
  noRoute.configs['reference-slices']={...noRoute.configs['reference-slices']};
  delete noRoute.configs['reference-slices']['practice.calculation.7.5'];
  const m1=await evaluatePilot({sources:noRoute});
  assert.equal(check(row(m1,'lu.7.12'),'technical.route').verdict,'FAIL');
  assert.equal(m1.gate,'FAIL');
  const badOutcome=sources(); badOutcome.bank.items[0].outcomeIds=['lu.9.15#o9'];
  const m2=await evaluatePilot({sources:badOutcome});
  assert.equal(check(row(m2,'lu.9.15'),'assessment.item-integrity').verdict,'FAIL');
  assert.equal(m2.gate,'FAIL');
  const staleSignoff=[{learningUnitId:'lu.7.11',reviewerId:'malika.pilot',role:'pilot-owner',decision:'signed_off',signedAt:'2026-09-28T09:00:00.000Z',basisHash:'0'.repeat(64)}];
  const m3=await evaluatePilot({signoffs:staleSignoff});
  assert.equal(row(m3,'lu.7.11').finalPilotStatus,'PILOT_BLOCKED');
  assert.equal(m3.gate,'FAIL');
});

// ------------------------------------------------------------------ 27 pending activities

test('pending triage covers exactly the runtime-PENDING activities, from facts only, and changes nothing',()=>{
  const before=createHash('sha256').update(['practice-activities.json','activity-overrides.json','assessment-reviews.json','pilot-signoffs.json'].map(f=>fs.readFileSync(path.join(root,'content-src',f),'utf8')).join('\n')).digest('hex');
  const src=sources();
  const pending=compileReadiness(src).pack.activities.filter(a=>a.runtime==='PENDING').map(a=>a.activityId).sort();
  const triage=buildPendingTriage(src);
  assert.equal(triage.total,27);
  assert.deepEqual(triage.rows.map(r=>r.activityId),pending);
  assert.equal(triage.learningUnitsAffected,33);
  for(const r of triage.rows){
    assert.ok(r.whyPending.length>0,r.activityId);
    assert.equal(r.releaseDecision,'NONE_RECORDED');
    assert.equal(r.lifecycle,'planned','no automatic promotion');
    assert.ok(r.recommendedNextAction.some(x=>/never automatic/.test(x)));
  }
  assert.deepEqual([...triage.notObserved].sort(),['CHEMISTRY_GROUNDING_PARTIAL','CONFIG_INCOMPLETE','ENGINE_CAPABILITY_MISSING','INTENTIONALLY_DEFERRED'],'reasons that are not in the data are not claimed');
  assert.equal(triage.globalStrictEnforcement.enabled,false);
  assert.deepEqual(committed(TRIAGE_FILE),triage,'run npm run pending:triage');
  const after=createHash('sha256').update(['practice-activities.json','activity-overrides.json','assessment-reviews.json','pilot-signoffs.json'].map(f=>fs.readFileSync(path.join(root,'content-src',f),'utf8')).join('\n')).digest('hex');
  assert.equal(after,before,'triage/pilot tooling never writes content or decisions');
  assert.equal(committed('reports/readiness-enforcement-impact.json').globalStrictEnforcement.enabled,false,'global strict readiness is still OFF');
});

// ------------------------------------------------------------------ renderer foundation (analysis only)

// P1.4 update: the P1.3 invariants "start gate closed" and "no renderer code" held only until the contract
// decision. The contract was approved for P1.4 implementation, so the gate is open and only the approved reference
// renderers exist (atom-builder; since P1.5 also hydrolysis-medium); the honesty check (electrolysis canned) still holds.
test('renderer foundation report: facts from code, black-swan honesty, only the approved reference renderers are implemented',async()=>{
  const report=await buildRendererReadiness();
  assert.deepEqual(committed(RENDERER_REPORT_FILE),report,'run npm run renderer:readiness');
  assert.equal(report.startGate.rendererContractApproved,true);
  assert.equal(report.startGate.canStartImplementation,true);
  // P1.5: hydrolysis-medium is the second approved reference renderer. The old invariant ("only atom-builder")
  // described the P1.4 scope; ionic precipitation and electrolysis are still NOT implemented.
  // P1.6: ionic-precipitation is the third approved reference renderer (electrolysis is still NOT implemented)
  assert.deepEqual(report.rows.filter(r=>r.implemented).map(r=>r.candidate),['atom-builder','ionic-precipitation','hydrolysis-medium'],'no other renderer was implemented');
  const by=Object.fromEntries(report.rows.map(r=>[r.candidate,r]));
  assert.deepEqual(report.rows.filter(r=>r.rank).sort((a,b)=>a.rank-b.rank).map(r=>r.candidate),['atom-builder','ionic-precipitation','hydrolysis-medium']);
  assert.equal(by['atom-builder'].learnerUiPath.verdict,'CAN_SUCCEED');
  // P1.5: the 9.14 blocker is fixed — the hydrolysis renderer sends the chosen salt and the prediction to the model
  // (the old CANNOT_SUCCEED expectation documented the bug; tests/p1-5-hydrolysis-regression.test.mjs reproduces it).
  assert.equal(by['hydrolysis-medium'].learnerUiPath.verdict,'CAN_SUCCEED','the renderer passes the salt/medium to the model');
  assert.equal(by.electrolysis.modelData[0].records,1);
  assert.ok(by.electrolysis.blockers.some(b=>/canned animation/.test(b)),'a one-record model must not be called a simulation');
  assert.deepEqual(fs.readdirSync(path.join(root,'src/renderers')).filter(f=>fs.statSync(path.join(root,'src/renderers',f)).isDirectory()).sort(),['atom-builder','hydrolysis-medium','ionic-precipitation'],'no electrolysis renderer exists');
});

// ------------------------------------------------------------------ completion fix (found by pilot:status)

test('beta runtimes report completion: the golden-slice electrolysis and other beta2/beta3 activities can complete',async()=>{
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const runUi=async(id,answer)=>{
    const model=await client.loadPractice(id);const session=new ReferencePracticeSession(model);const ui=buildPracticeUiModel(model);
    let result;
    if(ui.kind==='experiment') for(const x of ui.controls) result=await session.apply({kind:'experiment-action',action:{type:x.action}});
    else result=await answer(session,model);
    return isPracticeResultComplete(model.type,result);
  };
  assert.equal(await runUi('practice.experiment.9.10'),true,'beta2-advanced electrolysis (lu.9.15)');
  assert.equal(await runUi('practice.experiment.10.3'),true,'beta2-organic experiment');
  assert.equal(await runUi('practice.experiment.11.2'),true,'beta3-advanced electrolysis');
  // trainers/calculations: a wrong answer is not complete, the model's own answer is
  const viaExpected=async(id,kind)=>{
    const model=await client.loadPractice(id);const session=new ReferencePracticeSession(model);
    const wrong=kind==='trainer'?await session.apply({kind:'trainer-answer',answer:'xyz'}):await session.apply({kind:'calculation-response',response:{stepId:'x',value:-1,unit:'x'}});
    assert.equal(isPracticeResultComplete(model.type,wrong),false,id);
    const expected=kind==='trainer'?JSON.parse(wrong.serializedState).expected:wrong.expected;
    const right=kind==='trainer'?await session.apply({kind:'trainer-answer',answer:expected}):await session.apply({kind:'calculation-response',response:{stepId:expected.stepId,value:expected.value,unit:expected.unit}});
    return isPracticeResultComplete(model.type,right);
  };
  assert.equal(await viaExpected('practice.trainer.10.03.planned','trainer'),true,'beta2-organic trainer');
  assert.equal(await viaExpected('practice.calculation.11.08.planned','calculation'),true,'beta3-advanced calculation');
});

// ------------------------------------------------------------------ copy + architecture guard

test('the lesson line never borrows mastery words where the mastery indicator is shown',()=>{
  const rowP={learningUnitId:'lu.9.15',status:'mastered',activityStates:{},lastVisitedAt:'2026-09-29T10:00:00.000Z',contentVersion:'v',schemaVersion:'2.0.0'};
  const view=buildMasteryView({learningUnitId:'lu.9.15',conceptIds:['c1'],mastery:[],countedEvidence:[],attempts:{practiceCompletedOrAbandoned:0,assessment:0},assessmentAvailability:'PENDING'});
  const [pilot]=buildProgressViewModel([rowP],[{id:'lu.9.15',grade:9,title:'T'}],new Map([['lu.9.15',view]]));
  assert.equal(pilot.statusLabel,'Test topshirildi');
  assert.doesNotMatch(pilot.statusLabel,/O‘zlashtiril|Takrorlash/);
});

test('architecture guard (P1.3): tooling never writes human approvals, the bank never claims APPROVED, presentation never derives readiness or picks a renderer by activity id',()=>{
  const rules=(file,src)=>checkSource(file,src).map(v=>v.rule);
  assert.ok(rules('scripts/pilot-status.ts',"fs.writeFileSync(path.join(root,'content-src/assessment-reviews.json'),'{}');").includes('HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  assert.ok(rules('scripts/x.ts',"fs.appendFileSync(SIGNOFF_FILE,'x');").includes('HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  assert.ok(rules('scripts/x.ts',"const f=`content-src/pilot-signoffs.json`;fs.writeFileSync(`${root}/content-src/pilot-signoffs.json`,'x');").includes('HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  assert.deepEqual(rules('scripts/assessment-review/lib.ts',"fs.writeFileSync(path.join(root,REGISTER_FILE),'x');"),[],'the importer is the one legitimate writer');
  assert.ok(rules('src/app/x.ts',"const r='assessment-reviews.json';").includes('HUMAN_APPROVAL_WRITTEN_BY_TOOLING'),'runtime code never touches review registers');
  assert.ok(rules('scripts/x.ts',"item.lifecycle='APPROVED';").includes('BANK_LEVEL_APPROVAL'));
  assert.ok(rules('scripts/x.ts',"const item={id:'q',lifecycle:'APPROVED'};").includes('BANK_LEVEL_APPROVAL'));
  assert.deepEqual(rules('src/domain/assessment/governance.ts',"return {lifecycle:reasons.length?'REVIEW_PENDING':'APPROVED'};"),[],'derivation is allowed');
  assert.ok(rules('src/features/learning-hub/model.ts',"import {deriveActivityReadiness} from '../../domain/readiness/readiness.ts';").includes('READINESS_DERIVED_IN_PRESENTATION'));
  assert.ok(rules('src/features/practice/render.ts',"import {effectiveApprovalState as e} from '../../runtime/governance/approvals.ts';").includes('READINESS_DERIVED_IN_PRESENTATION'));
  assert.deepEqual(rules('src/features/learning-hub/model.ts',"import {launchDecision,type LearningActivityReadiness} from '../../domain/readiness/readiness.ts';"),[],'reading the pack decision is fine');
  assert.ok(rules('src/features/practice/render.ts',"switch(page.id){case 'practice.simulation.7.07.planned': drawAtom(); break;}").includes('RENDERER_SELECTED_BY_ACTIVITY_ID'));
  assert.ok(rules('src/features/practice/render.ts',"if(model.activityId==='practice.experiment.9.10') drawElectrolysis();").includes('RENDERER_SELECTED_BY_ACTIVITY_ID'));
  assert.deepEqual(rules('src/features/practice/render.ts',"if(model.kind==='experiment') drawExperiment(); if(page.id===current) x();"),[],'selection by kind/capability is the contract');
});
