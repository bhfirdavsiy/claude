import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAppRoute} from '../src/app/routes.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('LearningUnit has explicit Guide → Practice → Mustahkamlash routes',()=>{
  assert.deepEqual(parseAppRoute('/learn/lu.9.15/guide'),{name:'learning-guide',learningUnitId:'lu.9.15'});
  assert.deepEqual(parseAppRoute('/learn/lu.9.15/practice'),{name:'learning-practice',learningUnitId:'lu.9.15'});
  assert.deepEqual(parseAppRoute('/learn/lu.9.15/quiz'),{name:'learning-quiz',learningUnitId:'lu.9.15'});
  assert.deepEqual(parseAppRoute('/learn/lu.9.15'),{name:'learning-unit',learningUnitId:'lu.9.15'});
});

test('learning cycle UI exposes the three linked stages and no student-facing assessment jargon',()=>{
  const render=fs.readFileSync(path.join(root,'src/features/learning-hub/render.ts'),'utf8');
  assert.match(render,/Nazariya/);
  assert.match(render,/Amaliyot/);
  assert.match(render,/Mustahkamlash/);
  assert.match(render,/\/guide/);
  assert.match(render,/\/practice/);
  assert.match(render,/\/quiz/);
  assert.doesNotMatch(render,/assessment/i);
});

test('guide and reinforcement completion persist independently while reinforcement does not auto-award mastery',async()=>{
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'cycle-db',{now:()=> '2026-09-29T04:00:00.000Z'});
  const versions={contentVersion:'2026.09.1',schemaVersion:'1.0.0'};
  await service.markGuideComplete('lu.9.15',versions);
  let snap=await service.getCycleSnapshot('lu.9.15');
  assert.equal(snap.guideComplete,true);
  assert.equal(snap.practiceComplete,false);
  assert.equal(snap.reinforcementComplete,false);
  const saved=await service.recordReinforcement('lu.9.15',versions,{conceptReflection:'Elektrolizni tushuntirdim',practiceReflection:'Elektrodlarda o‘zgarish kuzatildi',connectionReflection:'Nazariya va kuzatuv bog‘landi',confidence:'partial'});
  // P1.0 (baseline C5): this line used to assert status 'assessment_complete'. That encoded the bug —
  // a reflection is not a scored assessment. The real invariants of this test (reinforcement persists,
  // it does not award mastery) are kept; the corrected status contract is in tests/p1-event-taxonomy.test.mjs.
  assert.notEqual(saved.status,'assessment_complete');
  assert.notEqual(saved.status,'mastered');
  snap=await service.getCycleSnapshot('lu.9.15');
  assert.equal(snap.reinforcementComplete,true);
});

test('progress resume follows the learning cycle instead of synthetic activity-state keys',()=>{
  const unit={id:'lu.9.15',grade:9,title:'Elektroliz'};
  const guide=buildProgressViewModel([{learningUnitId:unit.id,status:'in_progress',activityStates:{'cycle.guide':'{"complete":true}'},lastVisitedAt:'2026-09-29T00:00:00.000Z',contentVersion:'1',schemaVersion:'1'}],[unit])[0];
  assert.equal(guide.resumeHref,'/learn/lu.9.15/practice');
  const practice=buildProgressViewModel([{learningUnitId:unit.id,status:'practice_complete',activityStates:{'practice.simulation.9.15':'{}'},lastVisitedAt:'2026-09-29T00:01:00.000Z',contentVersion:'1',schemaVersion:'1'}],[unit])[0];
  assert.equal(practice.resumeHref,'/learn/lu.9.15/quiz');
});

test('practice completion offers a direct transition into reinforcement',()=>{
  const render=fs.readFileSync(path.join(root,'src/features/practice/render.ts'),'utf8');
  const model=fs.readFileSync(path.join(root,'src/features/practice/ui-model.ts'),'utf8');
  assert.match(render,/Mustahkamlashga o‘tish/);
  assert.match(model,/\/practice`/);
});

test('learning-cycle contract is runtime-packaged and part of didactic review surface',()=>{
  const contract=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-cycle.json'),'utf8'));
  assert.deepEqual(contract.navigation.primarySequence,['guide','practice','reinforcement']);
  assert.equal(contract.masteryPolicy.reinforcementCompletionAwardsMastery,false);
  assert.equal(contract.objectiveQuestionBank.requiresDidacticApproval,true);
  const pack=fs.readFileSync(path.join(root,'scripts/build-content-pack.ts'),'utf8');
  const signoff=fs.readFileSync(path.join(root,'scripts/stable-signoff-targets.ts'),'utf8');
  assert.match(pack,/learning-cycle\.json/);
  assert.match(signoff,/content-src\/learning-cycle\.json/);
});
