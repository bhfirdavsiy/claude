import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConceptSplit,migrateConceptMerge} from '../src/runtime/progress/concept-migration.ts';

const base=(id,conceptId,score=.8)=>({id,conceptId,activityId:`practice.${id}`,activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-09-20T00:00:00.000Z',score,evidenceClass:'trainer-calculation',type:'answer',questionId:`q.${id}`,correct:true});

test('concept split moves only explicitly assigned evidence to target concepts',()=>{
  const evidence=[base('e1','concept.old'),base('e2','concept.old'),base('e3','concept.old')];
  const out=migrateConceptSplit({sourceConceptId:'concept.old',targetConceptIds:['concept.a','concept.b'],evidence,assignments:{e1:['concept.a'],e2:['concept.b']}});
  assert.deepEqual(out.map(e=>[e.id,e.conceptId]),[['e1','concept.a'],['e2','concept.b']]);
});

test('concept merge deduplicates evidence ids and rewrites target concept before mastery recompute',()=>{
  const a=base('e1','concept.a',.8); const duplicate={...a,conceptId:'concept.b'}; const b=base('e2','concept.b',.9);
  const out=migrateConceptMerge({sourceConceptIds:['concept.a','concept.b'],targetConceptId:'concept.merged',evidence:[a,duplicate,b],scoringVersion:'1'});
  assert.deepEqual(out.evidence.map(e=>e.id),['e1','e2']);
  assert.ok(out.evidence.every(e=>e.conceptId==='concept.merged'));
  assert.equal(out.mastery.conceptId,'concept.merged');
});
