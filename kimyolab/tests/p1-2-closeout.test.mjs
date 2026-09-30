// P1.2 closeout — semantic audit. Technical readiness (runtime) and human content approval are two separate
// dimensions; nothing an agent or a script writes can make an assessment APPROVED; production content with no
// approved assessment can never show "mastered".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveActivityReadiness,launchDecision,isReleaseReady} from '../src/domain/readiness/readiness.ts';
import {deriveItemLifecycle,assessmentItemHash} from '../src/domain/assessment/governance.ts';
import {buildMasteryView} from '../src/domain/mastery/view.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const shipped=JSON.parse(fs.readFileSync(path.join(root,'public/content',pointer.activeVersion,'activity-readiness.json'),'utf8'));
const production=()=>structuredClone(loadSources());

// A reviewer record as a PERSON would file it through assessment:review:import (fixture only — never committed).
const record=(item,role,extra={})=>({itemId:item.id,role,decision:'approved',reviewerId:role==='chemistry'?'nodira.chem':'bekzod.didactic',reviewerRole:role,reviewedAt:'2026-09-28T09:00:00.000Z',itemHash:assessmentItemHash(item),itemVersion:item.version,evidence:{packet:`review-packets/assessment-pilot/${item.id}.md`,packetSha256:'b'.repeat(64)},...(role==='didactic'?{outcomeDecision:'confirm'}:{}),...extra});
const ctxFor=(src,item)=>{const unit=src.units.find(u=>u.id===item.learningUnitId);const mapped=src.mappings.filter(m=>m.learningUnitId===item.learningUnitId).flatMap(m=>m.conceptIds??[]);return {unitOutcomeCount:unit.learningOutcomes.length,unitConceptIds:[...new Set([...unit.conceptIds,...mapped])]};};

test('runtime READY is not human APPROVED: the two dimensions are separate in the shipped pack',()=>{
  const runtimeReady=shipped.activities.filter(a=>a.runtime==='READY');
  assert.equal(runtimeReady.length,118);
  assert.equal(shipped.activities.filter(a=>a.content==='APPROVED').length,0,'no activity has been approved by people yet');
  assert.ok(runtimeReady.every(a=>a.content==='REVIEW_PENDING'&&!isReleaseReady(a)));
  assert.ok(shipped.activities.every(a=>!('status' in a)&&!('releaseReady' in a)),'no single ambiguous status word survives in the pack');
  // the same pilot activity: launchable AND awaiting review — and that is legitimate (practice evidence only)
  const pilot=shipped.activities.filter(a=>a.enforcement==='strict');
  assert.deepEqual(pilot.map(a=>[a.runtime,a.content]),pilot.map(()=>['READY','REVIEW_PENDING']));
  assert.ok(pilot.every(a=>launchDecision(a).allowed));
});

test('derivation: content comes from hash-pinned human approvals; REJECTED by a person never launches',()=>{
  const d=(reviewPending,reviewRejected=[])=>deriveActivityReadiness({id:'a',lifecycleStatus:'ready',reviewPending,reviewRejected},{ok:true},'strict');
  assert.deepEqual([d([]).runtime,d([]).content],['READY','APPROVED']);
  assert.equal(isReleaseReady(d([])),true);
  assert.deepEqual([d(['didactic']).runtime,d(['didactic']).content],['READY','REVIEW_PENDING']);
  assert.equal(launchDecision(d(['didactic'])).allowed,true,'pending review does not block practice');
  const rejected=d([],['chemistry']);
  assert.deepEqual([rejected.runtime,rejected.content],['READY','REJECTED']);
  assert.equal(launchDecision(rejected).allowed,false);
  assert.equal(launchDecision({...rejected,enforcement:'observe'}).allowed,false);
  // a stale approval (content changed after review) counts as pending, not approved
  const src=production();
  const a=structuredClone(src.activities.find(x=>x.id==='practice.trainer.7.4'));
  const approved={status:'approved',reviewerId:'x.person',reviewerRole:'technical',reviewedVersion:'0.0.0-old',reviewedHash:'0'.repeat(64),reviewedAt:'2026-09-01T00:00:00.000Z'};
  a.approvals={technical:approved,didactic:approved,accessibility:approved,chemistry:'not_applicable'};
  src.activities=src.activities.map(x=>x.id===a.id?a:x);
  const r=compileReadiness(src).pack.activities.find(x=>x.activityId===a.id);
  assert.equal(r.content,'REVIEW_PENDING','approval for another version/hash is invalidated');
});

test('production content: 0 approved assessment items → 0 units can reach MASTERED',()=>{
  const {pack}=compileReadiness(production());
  assert.equal(pack.units.filter(u=>u.assessment.status==='AVAILABLE').length,0);
  for(const unit of production().units){
    const availability=pack.units.find(u=>u.learningUnitId===unit.id).assessment.status;
    // even with every concept at domain `mastered`, the band cannot be MASTERED without an approved assessment
    const view=buildMasteryView({learningUnitId:unit.id,conceptIds:unit.conceptIds,mastery:unit.conceptIds.map(c=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})),countedEvidence:[{id:'e',conceptId:unit.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:'2026-09-29T10:00:00.000Z'}],attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:availability});
    assert.notEqual(view.band,'MASTERED',unit.id);
  }
});

test('fixture (never production): two independent current human approvals make lu.9.15 AVAILABLE and MASTERED reachable',()=>{
  const src=production();
  src.reviews=src.bank.items.flatMap(item=>[record(item,'chemistry'),record(item,'didactic')]);
  const {pack}=compileReadiness(src);
  assert.equal(pack.units.find(u=>u.learningUnitId==='lu.9.15').assessment.status,'AVAILABLE');
  const unit=src.units.find(u=>u.id==='lu.9.15');
  const view=buildMasteryView({learningUnitId:unit.id,conceptIds:unit.conceptIds,mastery:unit.conceptIds.map(c=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})),countedEvidence:[{id:'e',conceptId:unit.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:'2026-09-29T10:00:00.000Z'}],attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:'AVAILABLE'});
  assert.equal(view.band,'MASTERED');
  // and the committed register is still empty — this approval exists only inside the test
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-reviews.json'),'utf8')).records,[]);
});

test('review invalidation: editing ANY reviewed field voids both approvals',()=>{
  const src=production();
  const item=src.bank.items[0];
  const records=[record(item,'chemistry'),record(item,'didactic')];
  assert.equal(deriveItemLifecycle(item,records,ctxFor(src,item)).lifecycle,'APPROVED');
  const edits={
    prompt:i=>({...i,prompt:`${i.prompt} (tahrir)`}),
    option:i=>({...i,options:i.options.map((o,n)=>n===0?{...o,text:`${o.text}.`}:o)}),
    key:i=>({...i,correctOptionId:i.options.find(o=>o.id!==i.correctOptionId).id}),
    explanation:i=>({...i,explanation:`${i.explanation} Qo‘shimcha.`}),
    conceptIds:i=>({...i,conceptIds:[...i.conceptIds,'concept.extra']}),
    outcomeIds:i=>({...i,outcomeIds:[]}),
  };
  for(const [field,edit] of Object.entries(edits)){
    const changed=edit(structuredClone(item));
    assert.notEqual(assessmentItemHash(changed),assessmentItemHash(item),field);
    const v=deriveItemLifecycle(changed,records,ctxFor(src,changed));
    assert.equal(v.lifecycle,'REVIEW_PENDING',field);
    assert.deepEqual(v.review,{chemistry:'pending',didactic:'pending'},`${field}: old decisions no longer apply`);
  }
});

test('dual review: both roles on the current hash, by two different people, with the outcome confirmed',()=>{
  const src=production();
  const item=src.bank.items[0];
  const ctx=ctxFor(src,item);
  const life=records=>deriveItemLifecycle(item,records,ctx);
  assert.equal(life([record(item,'chemistry')]).lifecycle,'REVIEW_PENDING','one approval only');
  const stale={...record(item,'didactic'),itemHash:'c'.repeat(64)};
  assert.equal(life([record(item,'chemistry'),stale]).lifecycle,'REVIEW_PENDING','one approval on an old hash');
  const same=life([record(item,'chemistry',{reviewerId:'dilnoza.k'}),record(item,'didactic',{reviewerId:'Dilnoza.K'})]);
  assert.equal(same.lifecycle,'REVIEW_PENDING','one person cannot approve both roles');
  assert.ok(same.reasons.includes('DUAL_REVIEW_NOT_INDEPENDENT'));
  for(const outcomeDecision of ['reject','change_required']){
    const v=life([record(item,'chemistry'),record(item,'didactic',{outcomeDecision,comment:'Outcome boshqa bo‘lishi kerak.'})]);
    assert.equal(v.lifecycle,'REVIEW_PENDING',outcomeDecision);
    assert.equal(v.outcome,outcomeDecision);
    assert.ok(v.reasons.includes('OUTCOME_MAPPING_NOT_CONFIRMED'));
  }
  // a didactic record without an outcome decision, or a non-approval without a comment, is not a valid record
  const {outcomeDecision:_o,...noOutcome}=record(item,'didactic');
  assert.equal(life([record(item,'chemistry'),noOutcome]).lifecycle,'REVIEW_PENDING');
  assert.equal(life([record(item,'chemistry'),record(item,'didactic',{decision:'changes_requested'})]).review.didactic,'pending','changes_requested without a comment is rejected as a record');
  const cr=life([record(item,'chemistry'),record(item,'didactic',{decision:'changes_requested',comment:'Distraktor B juda oson.'})]);
  assert.deepEqual([cr.lifecycle,cr.review.didactic],['REVIEW_PENDING','changes_requested'],'change required never becomes APPROVED');
  assert.equal(life([record(item,'chemistry'),record(item,'didactic')]).lifecycle,'APPROVED');
});
