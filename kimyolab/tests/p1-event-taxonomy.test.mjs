// P1.0 — baseline C5: reflection/reinforcement is not an assessment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {createProgress,reduceProgress} from '../src/runtime/progress/reducer.ts';

const versions={contentVersion:'2026.09.1',schemaVersion:'1.0.0'};
const reflection={mode:'reflection',conceptReflection:'a',practiceReflection:'b',connectionReflection:'c',confidence:'partial'};

test('REINFORCEMENT_COMPLETED records completion without claiming an assessment',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p1-c5',{now:()=>'2026-09-29T10:00:00.000Z'});
  const saved=await service.recordReinforcement('lu.9.15',versions,reflection);
  assert.notEqual(saved.status,'assessment_complete','a reflection is not a scored assessment');
  assert.equal(saved.status,'in_progress');
  assert.equal(JSON.parse(saved.activityStates['cycle.reinforcement']).confidence,'partial');
  const snap=await service.getCycleSnapshot('lu.9.15');
  assert.equal(snap.reinforcementComplete,true);
  assert.equal(snap.practiceComplete,false,'reflection alone must not mark practice as done');
});

test('learner-visible wording is unchanged: a completed reflection still reads as "Mustahkamlash bajarildi"',async()=>{
  const service=new BrowserProgressService(createFakeIndexedDb(),'p1-c5-label',{now:()=>'2026-09-29T10:00:00.000Z'});
  await service.recordReinforcement('lu.9.15',versions,reflection);
  const [row]=buildProgressViewModel(await service.listProgress(),[{id:'lu.9.15',grade:9,title:'Elektroliz'}]);
  assert.equal(row.statusLabel,'Mustahkamlash bajarildi');
  assert.equal(row.resumeHref,'/learn/lu.9.15/quiz');
});

test('only an evaluated objective assessment produces assessment_complete',()=>{
  const at='2026-09-29T10:00:00.000Z';
  let p=createProgress('lu.7.01','V','1.0.0',at);
  p=reduceProgress(p,{type:'REINFORCEMENT_COMPLETED',payload:{mode:'reflection'},at});
  p=reduceProgress(p,{type:'MASTERY_UPDATED',masteryStatus:'developing',at});
  p=reduceProgress(p,{type:'MASTERY_UPDATED',masteryStatus:'mastered',at});
  assert.equal(p.status,'in_progress','mastery updates never create an assessed unit');
  p=reduceProgress(p,{type:'ASSESSMENT_SUBMITTED',attemptId:'a',at});
  assert.equal(p.status,'in_progress','submitted is not evaluated');
  p=reduceProgress(p,{type:'ASSESSMENT_EVALUATED',attemptId:'a',objectiveItems:0,score:1,at});
  assert.equal(p.status,'in_progress','zero objective items fail closed');
  p=reduceProgress(p,{type:'ASSESSMENT_EVALUATED',attemptId:'a',objectiveItems:3,score:1,at});
  assert.equal(p.status,'assessment_complete');
});

test('renamed/unknown events fail closed instead of yielding undefined state',()=>{
  const p=createProgress('lu.7.01','V','1.0.0','2026-09-29T10:00:00.000Z');
  assert.throws(()=>reduceProgress(p,{type:'ASSESSMENT_COMPLETE',at:'2026-09-29T10:00:00.000Z'}),/PROGRESS_EVENT_UNKNOWN/);
});
