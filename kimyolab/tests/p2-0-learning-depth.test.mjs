// P2.0 — learning depth & coverage baseline (measurement only) and the P1.9 closeout: ONE release authority.
// The baseline classifies what a learner can really do; runtime READY, a theory page, an item count, a domain module
// or a pending review never stand in for learning depth. Nothing here changes content.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildDepthReports,DEPTH_REPORTS,WEIGHTS} from '../scripts/learning-depth.ts';
import {classifyActivity,CAPABILITY_MODULES,level} from '../scripts/lib/learning-depth.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {compileReadiness,effectiveRelease} from '../scripts/lib/readiness-compile.ts';
import {releaseEntries} from '../scripts/lib/release.ts';
import {computeReviewHash} from '../src/runtime/governance/approvals.ts';
import {releaseBasisHash} from '../src/domain/governance/release-decision.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel,base=root)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
const digest=(dir)=>createHash('sha256').update(fs.readdirSync(path.join(root,dir),{recursive:true}).map(String).filter(f=>f.endsWith('.json')).sort().map(f=>`${f}\n${fs.readFileSync(path.join(root,dir,f),'utf8')}`).join('\n')).digest('hex');
let reports;
test.before(async()=>{ const before=digest('content-src'); reports=await buildDepthReports(root); assert.equal(digest('content-src'),before,'measuring changes no content'); });

// ------------------------------------------------------------------ release authority (P1.9 closeout)

const T='2026-09-30T10:00:00.000Z';
function sandbox(){ const t=fs.mkdtempSync(path.join(os.tmpdir(),'kl-rel-')); fs.cpSync(path.join(root,'content-src'),path.join(t,'content-src'),{recursive:true}); return t; }
function approveAll(t,id){
  const file=path.join(t,'content-src/practice-activities.json'); const acts=JSON.parse(fs.readFileSync(file,'utf8'));
  const a=acts.find(x=>x.id===id); const hash=computeReviewHash(a);
  const rec=(role)=>({status:'approved',reviewerRole:role,reviewerId:`${role}.person`,reviewedAt:T,reviewedVersion:a.version,reviewedHash:hash,notes:'fixture'});
  a.approvals={technical:rec('technical'),didactic:rec('didactic'),accessibility:rec('accessibility'),chemistry:a.approvals.chemistry==='not_applicable'?'not_applicable':rec('chemistry')};
  fs.writeFileSync(file,JSON.stringify(acts,null,2));
}
const runtimeOf=(src,id)=>compileReadiness(src).pack.activities.find(a=>a.activityId===id).runtime;

test('release authority: the register is the ONE source — APPROVED ≠ RELEASED, ELIGIBLE ≠ RELEASED, stale ≠ RELEASED',()=>{
  const t=sandbox();
  const id=releaseEntries(root).find(e=>e.runtime==='PENDING'&&e.route.ok&&e.eligibility.reasons.every(r=>r.startsWith('CONTENT_')||r==='ACCESSIBILITY_REVIEW_INCOMPLETE')).activityId;
  approveAll(t,id);
  const src=loadSources(t);
  assert.equal(compileReadiness(src).pack.activities.find(a=>a.activityId===id).content,'APPROVED');
  assert.equal(runtimeOf(src,id),'PENDING','content APPROVED is not RELEASED');
  const e=releaseEntries(t,src).find(x=>x.activityId===id);
  assert.equal(e.eligibility.status,'ELIGIBLE'); assert.equal(runtimeOf(src,id),'PENDING','machine ELIGIBLE is not RELEASED');
  const decision=(d,over={})=>({activityId:id,basisHash:e.basisHash,decision:d,reviewerId:'malika.content',role:'content-owner',decidedAt:T,...(d==='RELEASE'?{}:{comment:'fixture'}),...over});
  assert.equal(runtimeOf({...src,releaseDecisions:[decision('RELEASE')]},id),'READY','a human RELEASE on the current basis → effectively released (build time, no content mutation)');
  assert.equal(runtimeOf({...src,releaseDecisions:[decision('KEEP_PENDING')]},id),'PENDING');
  assert.equal(runtimeOf({...src,releaseDecisions:[decision('DISABLE')]},id),'DISABLED');
  assert.equal(runtimeOf({...src,releaseDecisions:[decision('RELEASE',{basisHash:'0'.repeat(64)})]},id),'PENDING','a stale decision has no effect');
  // content changes after the release → the decision is stale → no longer released
  const changed={...src,activities:src.activities.map(a=>a.id===id?{...a,goal:`${a.goal} (edited)`}:a),releaseDecisions:[decision('RELEASE')]};
  assert.equal(runtimeOf(changed,id),'PENDING');
  const a=src.activities.find(x=>x.id===id);
  assert.equal(effectiveRelease(a,null,[decision('RELEASE',{basisHash:releaseBasisHash({activityId:id,version:a.version,reviewHash:computeReviewHash(a),config:null})})]),'RELEASED');
  // production: no decision exists, nothing was released by tooling
  assert.deepEqual(read('content-src/release-decisions.json').records,[]);
});

test('grandfathered lifecycle is frozen: 118 authored “ready”; any further release goes through the register',()=>{
  // A new authored lifecycleStatus:'ready' would be a second release path. If this number must change, it is a
  // reviewed decision recorded in ADR-P2-001 — not an edit that bypasses the release register.
  assert.equal(read('content-src/practice-activities.json').filter(a=>a.lifecycleStatus==='ready').length,118);
  assert.match(fs.readFileSync(path.join(root,'docs/adr/ADR-P2-001-release-authority-and-learning-depth.md'),'utf8'),/[Yy]agona authority/);
});

// ------------------------------------------------------------------ inventory

test('inventory: 122 learning units and 146 activities — unique, none orphaned, every one classified',()=>{
  const b=reports.baseline;
  assert.equal(b.learningUnits.length,122); assert.equal(new Set(b.learningUnits.map(u=>u.learningUnitId)).size,122);
  assert.deepEqual(b.learningUnits.map(u=>u.learningUnitId).sort(),read('content-src/learning-units.json').map(u=>u.id).sort());
  assert.equal(b.activities.length,146); assert.equal(new Set(b.activities.map(a=>a.activityId)).size,146);
  for(const u of b.learningUnits){
    for(const k of ['learningUnitId','grade','topic','conceptIds','outcomeIds','theory','practiceActivities','assessmentItems','rendererRequirements','runtimeReadiness','contentReview','releaseState','masteryReachable']) assert.ok(k in u,`${u.learningUnitId}:${k}`);
    assert.ok(u.practiceActivities.some(p=>p.role==='primary'),`${u.learningUnitId}: orphan (no primary practice)`);
    assert.ok(u.theory.id,`${u.learningUnitId}: no theory`);
    for(const [k,v] of Object.entries(u.dimensions)) assert.ok(b.enums[k].includes(v),`${k}=${v}`);
  }
  for(const a of b.activities) assert.ok(b.enums.practice.includes(a.depth)&&b.enums.interaction.includes(a.interaction),a.activityId);
  const linked=new Set(read('content-src/mapping-links.json').map(m=>m.practiceActivityId));
  assert.ok(b.activities.every(a=>linked.has(a.activityId)||a.learningUnits.length===0));
});

// ------------------------------------------------------------------ classification rules

test('classification: form checks are STATIC_CHECK, procedural clicks are not GUIDED, animation without black-swan is not MODEL_BASED',()=>{
  const c=(o)=>classifyActivity({uiKind:'simulation',runtime:'generic',capability:'x',registry:false,blackSwan:false,hardening:null,modules:[],steps:0,...o});
  assert.equal(c({}).depth,'STATIC_CHECK'); assert.equal(c({}).interaction,'FORM');
  assert.equal(c({modules:['kinetics-model']}).depth,'STATIC_CHECK','a domain-model answer typed into a field is still a form check');
  assert.equal(c({uiKind:'experiment',steps:5}).depth,'STATIC_CHECK','procedural click-through without domain state');
  assert.equal(c({uiKind:'experiment',steps:5,hardening:'CHEMISTRY_BASELINED_REACTION'}).depth,'GUIDED');
  assert.equal(c({uiKind:'experiment',steps:1,hardening:'CHEMISTRY_BASELINED_REACTION'}).depth,'STATIC_CHECK','a one-step sequence is not guided');
  assert.equal(c({registry:true,blackSwan:false}).depth,'GUIDED','canned-animation guard');
  assert.equal(c({registry:true,blackSwan:true}).depth,'MODEL_BASED');
  const b=reports.baseline;
  const model=b.activities.filter(a=>a.depth==='MODEL_BASED');
  // P2.6 changed this list: 9.23, 11.18 and 11.20 became condition-prediction trials (ADR-P2-007) and pass the per-activity
  // black-swan through the real stack (reports/reference-renderer-condition-prediction.json); the rule itself is unchanged.
  assert.deepEqual(model.map(a=>a.activityId).sort(),['practice.experiment.8.1','practice.experiment.9.14','practice.simulation.11.11.planned','practice.simulation.11.18.planned','practice.simulation.11.20.planned','practice.simulation.7.07.planned','practice.simulation.9.23.planned']);
  assert.ok(model.every(a=>a.blackSwan.pass&&a.renderer.kind==='registry'));
  // runtime READY ≠ depth
  const ready=b.activities.filter(a=>a.runtimeReadiness==='READY');
  assert.ok(ready.filter(a=>a.depth==='STATIC_CHECK').length>ready.length/2);
});

test('CAN_SUCCEED through the real UI path; a crash on unexpected input is reported (not hidden)',()=>{
  const b=reports.baseline;
  const launchable=b.activities.filter(a=>a.canSucceed!=='NOT_LAUNCHABLE');
  assert.equal(launchable.length,145); assert.ok(launchable.every(a=>a.canSucceed==='CAN_SUCCEED'));
  assert.deepEqual(b.activities.filter(a=>a.canSucceed==='NOT_LAUNCHABLE').map(a=>a.activityId),['practice.simulation.10.4']);
  assert.ok(['config','engine-expected','renderer-intents'].includes(launchable[0].answerSource));
  // P2.1 changed this assertion: P2.0 recorded the 9.23 crash (THROWS MANGANESE_MEDIUM_NOT_MODELED) and asserted it was
  // reported, not fixed. P2.1 fixed it (LEARNER_INPUT_INVALID outcome, tests/p2-1-learner-interaction.test.mjs), so the
  // same probe now finds no crash and the foundation check passes; the check itself and its wiring are unchanged.
  const crash=b.activities.filter(a=>String(a.wrongInput).startsWith('THROWS'));
  assert.deepEqual(crash.map(a=>a.activityId),[]);
  const check=reports.progress.foundationProgress.checks.find(c=>c.id==='no-crash-on-wrong-input');
  assert.equal(check.pass,true,'the probe still runs; a new crash would fail this check');
  assert.deepEqual(reports.workPackages.packages.find(p=>p.id==='wp.lab-repair').facts.crashOnWrongInput,[]);
  // P2.6 changed this assertion: 9.23 is now drawn by the condition-prediction renderer, so the legacy wrong-input probe no
  // longer applies (NOT_APPLICABLE, like every registry activity). The P2.1 guarantee moved into the domain: an unmodeled
  // medium is rejected (CONDITION_NOT_MODELED) with no trial, no evidence and no crash (tests/p2-6-computed-model-interaction).
  assert.equal(b.activities.find(a=>a.activityId==='practice.simulation.9.23.planned').wrongInput,'NOT_APPLICABLE');
});

// ------------------------------------------------------------------ theory / assessment / mastery

test('theory present ≠ mastery; item count ≠ outcome coverage; mastery comes from the real rule',()=>{
  const s=reports.summary;
  assert.equal(s.theoryCoverage.present.count,122); assert.equal(s.theoryCoverage.structured.count,0);
  assert.equal(s.masteryReachable.count,0,'a theory page never makes a unit mastered');
  assert.deepEqual([s.assessmentCoverage.totalItems,s.assessmentCoverage.approvedItems,s.assessmentCoverage.learningUnitsWithItems],[5,0,1]);
  assert.equal(s.assessmentCoverage.outcomes,122); assert.equal(s.assessmentCoverage.outcomesCovered,1);
  const lu=reports.baseline.learningUnits.find(u=>u.learningUnitId==='lu.9.15');
  assert.deepEqual(lu.mastery.blockReasons,['ASSESSMENT_NOT_APPROVED']);
  assert.equal(lu.assessment.cognitiveDemand,'UNRECORDED','not guessed');
  assert.ok(reports.baseline.learningUnits.filter(u=>u.learningUnitId!=='lu.9.15').every(u=>u.mastery.blockReasons.includes('NO_ASSESSMENT')));
  const pack=compileReadiness(loadSources(root)).pack;
  for(const u of reports.baseline.learningUnits) assert.equal(u.assessment.runtimeAvailable,pack.units.find(x=>x.learningUnitId===u.learningUnitId).assessment.status==='AVAILABLE');
});

// ------------------------------------------------------------------ engines / renderers / labs / a11y / l10n

test('engines: grounded in the runtime imports; existence is not exposure; unused modules reported',()=>{
  for(const [key,{runtimeFile,modules}] of Object.entries(CAPABILITY_MODULES)){
    const src=fs.readFileSync(path.join(root,runtimeFile),'utf8');
    for(const m of modules) assert.match(src,new RegExp(`domain/chemistry/${m}\\.ts`),`${key}: ${runtimeFile} imports ${m}`);
  }
  const e=reports.baseline.engines;
  assert.deepEqual(e.filter(x=>x.status==='UNUSED').map(x=>x.module),['equation-balancer']);
  assert.ok(e.every(x=>'browserExposed' in x&&'rendererExposed' in x));
  assert.ok(e.filter(x=>x.status==='FORM_OR_SCRIPT_ONLY').every(x=>!x.rendererExposed));
  const r=reports.baseline.renderers;
  // P2.6: three activities moved from the legacy renderer to the registry (condition-prediction): 4/141 → 7/138
  assert.deepEqual([r.registryRendered,r.legacyRendered,r.rendererMissingOrUnlaunchable],[7,138,1]);
  assert.ok(r.nextCandidates.every(c=>!('priority' in c)&&!('score' in c)));
});

test('labs, accessibility and localization are measured, not assumed',()=>{
  const b=reports.baseline;
  assert.equal(b.labs.total,read('content-src/practice-activities.json').filter(a=>a.type==='experiment').length);
  assert.equal(b.labs.cannotSucceed,0); assert.equal(b.labs.external.depth.startsWith('UNKNOWN'),true);
  // P2.7 changed this assertion: accessibility is no longer "renderer contract = verified, legacy = UNKNOWN". Every
  // launchable activity (registry and legacy alike) gets its state from the re-measured browser sweep
  // (reports/accessibility-browser-evidence.json, ADR-P2-008). The rule it guards is unchanged: nothing is assumed —
  // an activity without a passing browser measurement is never VERIFIED, and a declared contract alone counts for nothing.
  const launchable=b.activities.filter(a=>a.canSucceed!=='NOT_LAUNCHABLE');
  assert.ok(launchable.every(a=>['VERIFIED','FAILED','BLOCKED'].includes(a.accessibility.state)),'every launchable activity has a measured state');
  assert.ok(launchable.filter(a=>a.accessibility.state!=='VERIFIED').every(a=>a.accessibility.keyboard!=='VERIFIED'||a.accessibility.blockedBy.length),'not verified is never reported as verified');
  assert.ok(launchable.every(a=>a.accessibility.humanReview==='NOT_REVIEWED'),'automated verification is not a human review');
  assert.equal(b.accessibility.keyboard.verified,launchable.filter(a=>a.accessibility.state==='VERIFIED').length);
  assert.deepEqual(b.localization.learningUnitTitles,{'uz-Latn':122,'uz-Cyrl':0,ru:0});
  // P2.1 changed this assertion: P2.0 measured raw-id labels (e.g. "moles" on 11.05) and typed internal tokens as a
  // gap. P2.1 replaced the labels with the learner-interaction catalog and closed domains with choices: raw-id labels
  // are now 0; the remaining typed tokens are the fields without an option set (OPTION_SET_MISSING), still > 0.
  assert.equal(b.localization.rawIdLabels.activities,0);
  assert.ok(b.localization.untranslatedAnswerTokens.activities>0,'the remaining OPTION_SET_MISSING fields stay measured');
  assert.deepEqual(b.activities.find(a=>a.activityId==='practice.calculation.11.05.planned').localization.rawIdLabels,[]);
});

// ------------------------------------------------------------------ governance vs provenance vs learning

test('provenance debt and pending review are their own categories — never counted as missing learning content',()=>{
  const g=reports.gapMap;
  const cats=new Set(g.units.flatMap(u=>u.blockingGaps.map(x=>x.category)));
  for(const c of ['PROVENANCE','GOVERNANCE','LEARNING_CONTENT']) assert.ok(cats.has(c),c);
  assert.ok(g.units.flatMap(u=>u.blockingGaps).filter(x=>x.gap==='PROVENANCE_DEBT').every(x=>x.category==='PROVENANCE'));
  assert.ok(g.units.flatMap(u=>u.blockingGaps).filter(x=>['UNREVIEWED','ASSESSMENT_NOT_APPROVED','NOT_RELEASED'].includes(x.gap)).every(x=>x.category==='GOVERNANCE'));
  const prov=reports.workPackages.packages.find(p=>p.id==='wp.provenance');
  assert.equal(prov.facts.addSourceTasks,127); assert.match(prov.facts.note,/PROVENANCE DEBT/);
  for(const u of g.units) for(const k of ['strongestLayer','weakestLayer','blockingGaps','nextTechnicalOpportunity','nextHumanDependency']) assert.ok(k in u,k);
});

// ------------------------------------------------------------------ progress + work packages

test('progress: published formulas and weights; foundation and learning product are separate; overall recomputes',()=>{
  const p=reports.progress;
  const sum=(o)=>Object.values(o).reduce((s,x)=>s+x,0);
  assert.ok(Math.abs(sum(WEIGHTS.learningProduct)-1)<1e-9&&Math.abs(sum(WEIGHTS.overall)-1)<1e-9);
  assert.deepEqual(p.learningProductProgress.weights,WEIGHTS.learningProduct);
  const lp=Object.entries(WEIGHTS.learningProduct).reduce((s,[k,w])=>s+w*p.learningProductProgress.components[k],0);
  assert.ok(Math.abs(lp-p.learningProductProgress.percent)<0.01);
  assert.ok(Math.abs(0.4*p.foundationProgress.percent+0.6*p.learningProductProgress.percent-p.overallManagementEstimate.percent)<0.01);
  assert.ok(p.foundationProgress.percent>p.learningProductProgress.percent,'platform progress is not learning progress');
  for(const k of ['foundation','learningCoverage','modelBasedInteraction','assessmentCoverage','governance','release','localization']) assert.ok(p.dimensions[k].formula,k);
  for(const k of ['whereWeStarted','whereWeAreNow','completedMilestones','currentMilestone','nextMilestones','remainingMajorWork','uzSummary']) assert.ok(k in p,k);
  const doc=fs.readFileSync(path.join(root,'docs/roadmap/PROGRESS_MODEL.md'),'utf8');
  assert.match(doc,/equal weights of 1\/6/); assert.match(doc,/0\.4 × foundationProgress \+ 0\.6 × learningProductProgress/);
  assert.equal(level('practice','MODEL_BASED'),1); assert.equal(level('theory','MINIMAL'),0.5);
});

test('work packages: facts, dependencies, machine and human work — no hidden score',()=>{
  const w=reports.workPackages;
  for(const c of ['assessment expansion','model-based renderer','engine exposure','lab repair','theory enrichment','accessibility','localization','human review','provenance']) assert.ok(w.packages.some(p=>p.category.startsWith(c)),c);
  for(const p of w.packages){
    for(const k of ['affectedLearningUnits','affectedActivities','dependencies','machineWork','humanWork','blockers']) assert.ok(k in p,`${p.id}:${k}`);
    assert.ok(!('priority' in p)&&!('score' in p)&&!('rank' in p),p.id);
  }
  const cats=w.packages.map(p=>p.category);
  assert.deepEqual(cats,[...cats].sort((a,b)=>a.localeCompare(b)),'ordered by name, not by importance');
});

test('reports are deterministic and committed',()=>{
  for(const [k,rel] of Object.entries(DEPTH_REPORTS)) assert.deepEqual(read(rel),JSON.parse(JSON.stringify(reports[{baseline:'baseline',summary:'summary',gapMap:'gapMap',progress:'progress',workPackages:'workPackages'}[k]])),`${rel}: run npm run learning:depth`);
});
