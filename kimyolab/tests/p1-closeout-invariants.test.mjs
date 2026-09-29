// P1.0 closeout — kill-critic invariants (docs/reviews/p1.0-kill-critic.md). Each test pins a semantic
// contract of the canonical runtime, not an implementation detail.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {LearningOrchestrator} from '../src/runtime/learning-orchestrator/orchestrator.ts';
import {displayStatus,isAssessmentComplete,isReinforcementComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {createWebLocksLiveness} from '../src/features/progress/liveness.ts';
// P1.1: the drafts-based entry point is now `submitAssessmentEvidence` (headless adapter); `submitAssessment`
// is the canonical responses → evaluator path. Same invariants, renamed call.

const V={contentVersion:'2026.09.1',contentSchemaVersion:'1.0.0',scoringVersion:'1.0.0',curriculumVersion:'2026.09'};
let tick=0; const clock=()=>new Date(Date.UTC(2026,8,29,10,0,tick++)).toISOString();
const draft=(id,conceptId,{score=1,correct=true,cls='trainer-calculation',contentVersion=V.contentVersion,value}={})=>({id,conceptId,activityId:'practice.trainer.demo',activityVersion:'1',contentVersion,scoringVersion:V.scoringVersion,createdAt:clock(),score,evidenceClass:cls,type:'answer',questionId:'q.same',correct,...(value!==undefined?{value}:{})});
function setup(name,options={}){const store=new IndexedDbProgressStore(createFakeIndexedDb(),name);return {store,o:new LearningOrchestrator(store,{now:clock,...options})};}
const begin=(o,extra={})=>o.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions:V,conceptIds:['concept.c1'],...extra});
const objective=(id,conceptId,opts={})=>draft(id,conceptId,{cls:'concept-assessment',...opts});

// ------------------------------------------------------------------ §2/§3 assessment_complete semantics

test('reinforcement/reflection never yields assessment_complete; an evaluated objective assessment does',async()=>{
  const {o}=setup('co-assess');
  await o.completeTheory('lu.demo',V);
  const s=begin(o); await o.applyPracticeResult(s,{evidence:[draft('ev.p','concept.c1')],finalState:{status:'complete'}});
  const afterReflection=await o.submitReinforcement('lu.demo',V,{mode:'reflection'});
  assert.equal(afterReflection.status,'practice_complete');
  assert.equal(isAssessmentComplete(afterReflection),false);
  const assessed=await o.submitAssessmentEvidence({learningUnitId:'lu.demo',versions:V,assessmentVersion:'1',conceptIds:['concept.c1'],drafts:[objective('ev.q1','concept.c1')]});
  assert.equal(isAssessmentComplete(assessed.progress),true);
  assert.ok(['assessment_complete','mastered','needs_review'].includes(assessed.progress.status));
});

test('status, stage, display status and attempt status are distinct things',()=>{
  const at='2026-09-29T10:00:00.000Z';
  // A pre-P1.0 record: reflection was stored as assessment_complete, no evaluated assessment exists.
  const legacy={learningUnitId:'lu.demo',status:'assessment_complete',lastVisitedAt:at,contentVersion:'V',schemaVersion:'2.0.0',
    activityStates:{'cycle.guide':'{"complete":true}','cycle.reinforcement':JSON.stringify({complete:true,mode:'reflection'})}};
  assert.equal(isAssessmentComplete(legacy),false,'legacy reflection is not an assessment');
  assert.equal(isReinforcementComplete(legacy),true);
  assert.equal(displayStatus(legacy),'reinforcement_complete');
  const [row]=buildProgressViewModel([legacy],[{id:'lu.demo',grade:7,title:'Demo'}]);
  assert.equal(row.statusLabel,'Mustahkamlash bajarildi','learner-visible wording for legacy reflection is unchanged');
});

// ------------------------------------------------------------------ §4 zero-evidence attempt (Variant B)

test('zero-evidence page visit leaves NO attempt (no phantom attempt); one evidence leaves one abandoned attempt',async()=>{
  const {o,store}=setup('co-zero');
  await o.leavePractice(begin(o));
  assert.deepEqual(await store.listAttempts(),[],'open + leave without any learner interaction = no attempt');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1',{score:0,correct:false})]});
  await o.leavePractice(s);
  const attempts=await store.listAttempts();
  assert.equal(attempts.length,1,'a meaningful (evidence-bearing) attempt is never lost');
  assert.equal(attempts[0].status,'abandoned');
  assert.equal((await store.listEvidence()).length,1,'abandoned attempt evidence stays in history');
});

// ------------------------------------------------------------------ §6 terminal invariant

test('complete() then abandon() — the second terminal transition is rejected',async()=>{
  const {o,store}=setup('co-term-1');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1')],finalState:{status:'complete'}});
  await assert.rejects(o.abandonPractice(s),/ATTEMPT_ALREADY_FINISHED/);
  await assert.rejects(store.finishAttempt(s.attemptId,'abandoned','2026-09-29T11:00:00.000Z'),/ATTEMPT_ALREADY_FINISHED/);
  assert.equal((await store.loadAttempt(s.attemptId)).status,'completed');
  // leaving a completed page is not a transition at all
  await o.leavePractice(s);
  assert.equal((await store.loadAttempt(s.attemptId)).status,'completed');
});

test('abandon() then complete() — the second terminal transition is rejected',async()=>{
  const {o,store}=setup('co-term-2');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1',{score:0,correct:false})]});
  await o.abandonPractice(s);
  await assert.rejects(o.completePractice(s),/PRACTICE_SESSION_CLOSED/);
  await assert.rejects(o.applyPracticeResult(s,{evidence:[draft('ev.2','concept.c1')]}),/PRACTICE_SESSION_CLOSED/);
  await assert.rejects(store.finishAttempt(s.attemptId,'completed','2026-09-29T11:00:00.000Z'),/ATTEMPT_ALREADY_FINISHED/);
  assert.equal((await store.loadAttempt(s.attemptId)).status,'abandoned');
});

// ------------------------------------------------------------------ §7 dedupe does not merge independent evidence

test('dedupe keeps pedagogically independent evidence apart even when score/answer are identical',async()=>{
  const {o,store}=setup('co-dedupe');
  const s=begin(o);
  // step A and step B: same score, same answer value, same question text — different source identity
  await o.applyPracticeResult(s,{evidence:[draft('step.A','concept.c1',{value:42}),draft('step.B','concept.c1',{value:42})]});
  assert.equal((await store.listEvidence()).length,2);
  // exact cumulative re-emission (only createdAt differs) is not new evidence
  await o.applyPracticeResult(s,{evidence:[draft('step.A','concept.c1',{value:42}),draft('step.B','concept.c1',{value:42})]});
  assert.equal((await store.listEvidence()).length,2);
  // same source, changed content (a new answer) IS new evidence
  await o.applyPracticeResult(s,{evidence:[draft('step.A','concept.c1',{value:43,score:0,correct:false})]});
  const all=await store.listEvidence();
  assert.equal(all.length,3);
  assert.deepEqual(all.map(e=>e.sourceEvidenceId).sort(),['step.A','step.A','step.B']);
});

// ------------------------------------------------------------------ §8 mastery cache reconstruction

test('mastery cache deleted → recompute equals the canonical value; incompatible-version evidence never leaks in',async()=>{
  const {o,store}=setup('co-cache');
  const s=begin(o);
  await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1'),draft('ev.2','concept.c1',{score:0.5,correct:false})]});
  const [canonical]=await o.recomputeMastery(['concept.c1'],V);
  await store.resetStore('mastery');
  assert.equal(await store.loadMastery('concept.c1'),undefined,'cache destroyed');
  const [rebuilt]=await o.recomputeMastery(['concept.c1'],V);
  assert.deepEqual(rebuilt,canonical);
  // evidence from an older, undeclared content version is added to history
  const old=o.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions:{...V,contentVersion:'2025.01.0'},conceptIds:['concept.c1']});
  await o.applyPracticeResult(old,{evidence:[draft('ev.old','concept.c1',{contentVersion:'2025.01.0',score:0,correct:false})]});
  const [after]=await o.recomputeMastery(['concept.c1'],V);
  assert.deepEqual(after.evidenceIds.sort(),canonical.evidenceIds.sort(),'old-version evidence is not counted');
  assert.equal(after.confidence,canonical.confidence);
  assert.equal(after.status,canonical.status);
  assert.equal(after.excludedEvidenceIds.length,1,'it is kept in history and reported as excluded');
});

// ------------------------------------------------------------------ §9 monotonicity is scoped to one compatibility context

async function masteredUnder(o,versions){
  const s=o.beginPractice({learningUnitId:'lu.demo',activityId:'practice.trainer.demo',activityVersion:'1',practiceType:'trainer',versions,conceptIds:['concept.c1']});
  await o.applyPracticeResult(s,{evidence:[draft('ev.p','concept.c1',{contentVersion:versions.contentVersion})],finalState:{status:'complete'}});
  const drafts=[1,2,3,4].map(i=>objective(`ev.q${i}`,'concept.c1',{contentVersion:versions.contentVersion}));
  return o.submitAssessmentEvidence({learningUnitId:'lu.demo',versions,assessmentVersion:'1',conceptIds:['concept.c1'],drafts});
}

test('a new, undeclared content version does NOT carry an old achievement forever',async()=>{
  const {o}=setup('co-version');
  const first=await masteredUnder(o,V);
  const achieved=first.progress.status;
  assert.ok(['assessment_complete','mastered'].includes(achieved));
  // retry/failure inside the same context: no regression
  const retry=begin(o); await o.applyPracticeResult(retry,{evidence:[draft('ev.fail','concept.c1',{score:0,correct:false})]});
  assert.equal((await o.openUnit('lu.demo',V)).status,achieved);
  // new content version, no compatibility declared → achievement re-based, old one archived for audit
  const V2={...V,contentVersion:'2027.01.0'};
  const reopened=await o.openUnit('lu.demo',V2);
  assert.equal(reopened.status,'in_progress');
  assert.equal(reopened.contentVersion,'2027.01.0');
  const archiveKey=Object.keys(reopened.activityStates).find(k=>k.startsWith('cycle.archive.2026.09.1@'));
  assert.ok(archiveKey,'old achievement is archived, not deleted');
  assert.equal(JSON.parse(reopened.activityStates[archiveKey]).status,achieved);
  assert.equal(isAssessmentComplete(reopened),false);
});

test('a declared compatible content version keeps the achievement (same compatibility context)',async()=>{
  const {o}=setup('co-version-compatible',{versionPolicy:{content:{'2026.09.1':'compatible'}}});
  const first=await masteredUnder(o,V);
  const reopened=await o.openUnit('lu.demo',{...V,contentVersion:'2026.09.2'});
  assert.equal(reopened.status,first.progress.status);
  assert.equal(isAssessmentComplete(reopened),true);
});

// ------------------------------------------------------------------ §5 unload reliability: recovery on next boot

test('boot recovery abandons in_progress attempts no live page owns, and leaves live ones alone',async()=>{
  const factory=createFakeIndexedDb();
  const live=new Set();
  const liveness={claim:(id)=>live.add(id),release:(id)=>live.delete(id),liveAttemptIds:async()=>new Set(live)};
  // page lifetime 1 (e.g. refreshed / tab closed): an attempt with evidence was never left explicitly
  const store=new IndexedDbProgressStore(factory,'co-recover');
  const dead=new LearningOrchestrator(store,{now:clock,liveness});
  const lost=begin(dead); await dead.applyPracticeResult(lost,{evidence:[draft('ev.1','concept.c1',{score:0,correct:false})]});
  live.delete(lost.attemptId); // the platform released the dead page's lock
  // another tab that is still open
  const otherTab=new LearningOrchestrator(store,{now:clock,liveness});
  const open=begin(otherTab); await otherTab.applyPracticeResult(open,{evidence:[draft('ev.2','concept.c1',{score:0,correct:false})]});
  // next boot
  const booted=new LearningOrchestrator(store,{now:clock,liveness});
  const recovered=await booted.recoverOrphanedAttempts();
  assert.deepEqual(recovered.map(a=>a.id),[lost.attemptId]);
  assert.equal((await store.loadAttempt(lost.attemptId)).status,'abandoned');
  assert.equal((await store.loadAttempt(open.attemptId)).status,'in_progress','another live tab keeps its attempt');
  assert.deepEqual(await booted.recoverOrphanedAttempts(),[],'recovery is idempotent');
});

test('without an observable liveness signal only stale attempts are recovered (no false abandon of other tabs)',async()=>{
  const {o,store}=setup('co-recover-stale');
  const s=begin(o); await o.applyPracticeResult(s,{evidence:[draft('ev.1','concept.c1',{score:0,correct:false})]});
  const booted=new LearningOrchestrator(store,{now:clock});
  assert.deepEqual(await booted.recoverOrphanedAttempts(),[]);
  const later=new LearningOrchestrator(store,{now:()=>'2026-10-01T10:00:00.000Z'});
  assert.deepEqual((await later.recoverOrphanedAttempts()).map(a=>a.id),[s.attemptId]);
});

test('Web Locks liveness: a claimed attempt is live until released; unsupported platforms return no port',async()=>{
  assert.equal(createWebLocksLiveness(undefined),undefined);
  const held=new Map();
  const locks={
    request:(name,_o,cb)=>{held.set(name,true);return Promise.resolve(cb()).then(()=>held.delete(name));},
    query:async()=>({held:[...held.keys()].map(name=>({name})),pending:[]}),
  };
  const port=createWebLocksLiveness(locks);
  port.claim('a1');
  assert.deepEqual([...await port.liveAttemptIds()],['a1']);
  port.release('a1');
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual([...await port.liveAttemptIds()],[]);
});
