// P1.2 — C1 learner-facing mastery: a pedagogical band, never a number; honest without an assessment;
// version-safe; separate from lesson progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {buildMasteryView,MASTERY_BAND_COPY,VERSION_UPDATED_COPY} from '../src/domain/mastery/view.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {splitAssessmentBank} from '../src/domain/assessment/model.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const m=(conceptId,status,evidenceIds=['e1'],extra={})=>({conceptId,evidenceIds,confidence:0.8123,status,scoringVersion:'1',...extra});
const ev=(id,conceptId,evidenceClass,source,createdAt='2026-09-29T10:00:00.000Z')=>({id,conceptId,evidenceClass,source,createdAt});
const base={learningUnitId:'lu.x',conceptIds:['c1','c2'],attempts:{practiceCompletedOrAbandoned:2,assessment:1}};
const NUMBERS=/\d+[.,]\d+|%|confidence|0\.\d/;

test('bands: NOT_STARTED / DEVELOPING / MASTERED / NEEDS_REVIEW with text + icon + ARIA, never a number',()=>{
  const none=buildMasteryView({...base,mastery:[],countedEvidence:[],attempts:{practiceCompletedOrAbandoned:0,assessment:0},assessmentAvailability:'AVAILABLE'});
  assert.equal(none.band,'NOT_STARTED');
  const developing=buildMasteryView({...base,mastery:[m('c1','developing'),m('c2','developing')],countedEvidence:[ev('e1','c1','trainer-calculation','p1')],assessmentAvailability:'AVAILABLE'});
  assert.equal(developing.band,'DEVELOPING');
  const mastered=buildMasteryView({...base,mastery:[m('c1','mastered'),m('c2','mastered')],countedEvidence:[ev('e1','c1','trainer-calculation','p1'),ev('e2','c1','concept-assessment','a'),ev('e3','c2','practice-observation','p2')],assessmentAvailability:'AVAILABLE'});
  assert.equal(mastered.band,'MASTERED');
  const review=buildMasteryView({...base,mastery:[m('c1','needs_review'),m('c2','mastered')],countedEvidence:[ev('e1','c1','concept-assessment','a')],assessmentAvailability:'AVAILABLE'});
  assert.equal(review.band,'NEEDS_REVIEW');
  for(const view of [none,developing,mastered,review]){
    const copy=MASTERY_BAND_COPY[view.band];
    assert.deepEqual([view.label,view.icon,view.ariaLabel],[copy.label,copy.icon,copy.aria]);
    assert.ok(view.explanation.length>0,'"Nega?" always has an answer');
    const {lastActivityAt:_a,reviewDueAt:_r,...shown}=view;
    assert.doesNotMatch(JSON.stringify(shown),NUMBERS,'no false precision: no percentages, confidences or formula');
  }
  assert.deepEqual(Object.values(MASTERY_BAND_COPY).map(c=>c.label),['Boshlanmagan','Rivojlanmoqda','O‘zlashtirilgan','Qayta ko‘rib chiqish kerak']);
  assert.equal(new Set(Object.values(MASTERY_BAND_COPY).map(c=>c.icon)).size,4,'each band has its own shape');
});

test('no objective assessment (or pending) → never "mastered", and the learner is told why',()=>{
  for(const availability of ['NONE','PENDING']){
    const view=buildMasteryView({...base,mastery:[m('c1','mastered'),m('c2','mastered')],countedEvidence:[ev('e1','c1','trainer-calculation','p1'),ev('e2','c2','practice-observation','p2'),ev('e3','c2','case','p3')],assessmentAvailability:availability});
    assert.equal(view.band,'DEVELOPING',availability);
    assert.ok(view.explanation.some(l=>/test|baholash/i.test(l)),availability);
  }
});

test('version change: old evidence does not show as current mastery, and the copy never says knowledge was lost',()=>{
  const view=buildMasteryView({...base,mastery:[m('c1','not_started',[],{excludedEvidenceIds:['old1']}),m('c2','not_started',[])],countedEvidence:[],assessmentAvailability:'AVAILABLE'});
  assert.equal(view.versionUpdated,true);
  assert.ok(view.explanation.includes(VERSION_UPDATED_COPY));
  assert.doesNotMatch(JSON.stringify(view),/yo‘qol|yo'qol|o‘chirildi/i);
});

test('mastery view through the canonical orchestrator is version-safe (active context only)',async()=>{
  const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
  const approved=structuredClone(bank); for(const i of approved.items) i.review={chemistry:'approved',didactic:'approved'};
  const {prompts,keys}=splitAssessmentBank(approved);
  const factory=createFakeIndexedDb();
  const source={loadAssessmentForEvaluation:async()=>({version:prompts.version,prompts:prompts.items,keys:keys.keys})};
  const V1={contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0',curriculumVersion:'2026.09'};
  const unit=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8')).find(u=>u.id==='lu.9.15');
  const s1=new BrowserProgressService(factory,'mv',{liveness:null,assessmentContent:source});
  await s1.submitAssessment(s1.beginAssessment('lu.9.15',V1,unit.conceptIds),approved.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId})));
  const now=await s1.getMasteryView('lu.9.15',V1,unit.conceptIds,'AVAILABLE');
  assert.notEqual(now.band,'NOT_STARTED');
  assert.equal(now.evidenceSummary.assessmentAttempts,1);
  assert.equal(now.evidenceSummary.hasAssessmentEvidence,true);
  // a new content version with no compatibility declaration: the old mastery is not displayed as current
  const V2={...V1,contentVersion:'2027.01.0'};
  const later=await new BrowserProgressService(factory,'mv',{liveness:null}).getMasteryView('lu.9.15',V2,unit.conceptIds,'AVAILABLE');
  assert.equal(later.versionUpdated,true);
  assert.notEqual(later.band,'MASTERED');
  assert.ok(later.explanation.includes(VERSION_UPDATED_COPY));
});

test('lesson progress and mastery are separate fields of the progress view',()=>{
  const row={learningUnitId:'lu.7.11',status:'practice_complete',activityStates:{'cycle.guide':'{"complete":true}','cycle.reinforcement':'{"complete":true}'},lastVisitedAt:'2026-09-29T10:00:00.000Z',contentVersion:'v',schemaVersion:'2.0.0'};
  const mastery=buildMasteryView({...base,learningUnitId:'lu.7.11',mastery:[m('c1','developing')],countedEvidence:[ev('e1','c1','trainer-calculation','p1')],assessmentAvailability:'NONE'});
  const [item]=buildProgressViewModel([row],[{id:'lu.7.11',grade:7,title:'T'}],new Map([['lu.7.11',mastery]]));
  assert.equal(item.statusLabel,'Mustahkamlash bajarildi','lesson: all stages done');
  assert.equal(item.mastery.label,'Rivojlanmoqda','mastery: still developing — a finished lesson is not mastery');
  const [plain]=buildProgressViewModel([row],[{id:'lu.7.11',grade:7,title:'T'}]);
  assert.equal(plain.mastery,undefined,'non-pilot units show no mastery');
});

test('the UI never computes mastery itself (architecture guard)',()=>{
  const v=checkSource('src/features/progress/render.ts',"import {computeConceptMastery} from '../../domain/mastery/mastery.ts'; computeConceptMastery({conceptId,evidence,scoringVersion,context});");
  assert.ok(v.some(x=>x.rule==='MASTERY_COMPUTED_IN_PRESENTATION'));
  assert.deepEqual(checkSource('src/runtime/learning-orchestrator/orchestrator.ts',"computeConceptMastery({conceptId,evidence,scoringVersion,context});"),[]);
});
