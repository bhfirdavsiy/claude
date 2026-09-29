import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {buildProgressViewModel} from '../src/features/progress/model.ts';

const page={
  id:'practice.simulation.7.07.planned',type:'simulation',title:'Atom Builder',goal:'Atom yarating',accessibility:[],
  learningUnit:{id:'lu.7.07',grade:7,title:'Atom tuzilishi'},referenceConfig:{conceptId:'concept.c019',version:'1.0.0'},
  contentVersion:'2026.09.1',schemaVersion:'1.0.0',scoringVersion:'1.0.0',chemistry:{reactions:[],solutionRules:{version:'1',dissociation:[],insoluble:[]}},
};
const result={serializedState:'{"state":"C-14"}',finalState:{isotope:'C-14'},evidence:[{id:'ev.c14',conceptId:'concept.c019',activityId:page.id,activityVersion:'1.0.0',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:'2026-09-15T00:00:00.000Z',score:1,evidenceClass:'practice-observation',type:'construction',targetId:'C-14',achieved:true}]};

test('IndexedDbProgressStore can list progress records for the student progress screen',async()=>{
  const factory=createFakeIndexedDb(); const store=new IndexedDbProgressStore(factory,'list-db');
  await store.saveProgress({learningUnitId:'lu.7.01',status:'in_progress',activityStates:{},lastVisitedAt:'2026-09-15T00:00:00.000Z',contentVersion:'1',schemaVersion:'2.0.0'});
  await store.saveProgress({learningUnitId:'lu.7.02',status:'mastered',activityStates:{},lastVisitedAt:'2026-09-15T00:01:00.000Z',contentVersion:'1',schemaVersion:'2.0.0'});
  const rows=await store.listProgress();
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.learningUnitId).sort(),['lu.7.01','lu.7.02']);
});

test('BrowserProgressService persists practice state and marks achieved simulation practice complete',async()=>{
  const factory=createFakeIndexedDb(); const service=new BrowserProgressService(factory,'browser-progress',{now:()=> '2026-09-15T00:00:00.000Z'});
  const saved=await service.recordPracticeResult(page,result);
  assert.equal(saved.status,'practice_complete');
  assert.equal(saved.activityStates[page.id],result.serializedState);
  const reloaded=new BrowserProgressService(factory,'browser-progress',{now:()=> '2026-09-15T00:05:00.000Z'});
  const rows=await reloaded.listProgress();
  assert.equal(rows[0].learningUnitId,'lu.7.07');
  assert.equal(rows[0].status,'practice_complete');
});

test('progress view model uses human titles and canonical resume practice links',()=>{
  const view=buildProgressViewModel([
    {learningUnitId:'lu.7.07',status:'practice_complete',activityStates:{'practice.simulation.7.07.planned':'{}'},lastVisitedAt:'2026-09-15T00:00:00.000Z',contentVersion:'1',schemaVersion:'1'},
  ],[{id:'lu.7.07',grade:7,title:'Atom tuzilishi',learningOutcomes:[]}]);
  assert.equal(view[0].title,'Atom tuzilishi');
  assert.equal(view[0].statusLabel,'Amaliyot bajarildi');
  assert.equal(view[0].resumeHref,'/learn/lu.7.07/quiz');
  assert.doesNotMatch(view[0].title,/lu\./);
});

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('progress browser route renders saved results instead of a placeholder and practice saves through progress service',()=>{
  const bootstrap=fs.readFileSync(path.join(projectRoot,'src/app/bootstrap.ts'),'utf8');
  assert.match(bootstrap,/BrowserProgressService/);
  assert.match(bootstrap,/renderProgress/);
  assert.match(bootstrap,/recordPracticeResult/);
  assert.doesNotMatch(bootstrap,/Progress sahifasi keyingi UI paketida ulanadi/);
  const render=fs.readFileSync(path.join(projectRoot,'src/features/progress/render.ts'),'utf8');
  assert.match(render,/Natijalarim/);
  assert.match(render,/Davom etish/);
  assert.doesNotMatch(render,/\.innerHTML\s*=/);
});
