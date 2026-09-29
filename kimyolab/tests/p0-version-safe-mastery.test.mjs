// P0.5 — mastery only uses evidence compatible with the explicit MasteryContext.
import test from 'node:test';
import assert from 'node:assert/strict';
import {computeConceptMastery,classifyEvidenceVersion} from '../src/domain/mastery/mastery.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {BrowserProgressService} from '../src/features/progress/service.ts';

function ev(id,{contentVersion='V1',scoringVersion='1.0.0',score=1,cls='concept-assessment',at='2026-09-01T00:00:00.000Z',correct=true}={}){
  return {id,conceptId:'concept.c1',activityId:`activity.${id}`,activityVersion:'1',contentVersion,scoringVersion,createdAt:at,score,evidenceClass:cls,type:'answer',questionId:`q.${id}`,correct};
}
const v1=[ev('a',{cls:'practice-observation'}),ev('b'),ev('c',{cls:'transfer-case'})];

test('Content V1 evidence is not added to Content V2 mastery by default',()=>{
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:v1,scoringVersion:'1.0.0',context:{contentVersion:'V2',scoringVersion:'1.0.0'}});
  assert.equal(m.status,'not_started');
  assert.deepEqual(m.evidenceIds,[]);
  assert.deepEqual(m.excludedEvidenceIds.sort(),['a','b','c']);
  assert.deepEqual(m.context,{contentVersion:'V2',scoringVersion:'1.0.0'});
});

test('V2 mastery counts only V2 evidence when histories are mixed',()=>{
  const v2=[ev('x',{contentVersion:'V2',score:0,correct:false,at:'2026-09-10T00:00:00.000Z'})];
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:[...v1,...v2],scoringVersion:'1.0.0',context:{contentVersion:'V2',scoringVersion:'1.0.0'}});
  assert.deepEqual(m.evidenceIds,['x']);
  assert.equal(m.status,'needs_review');
});

test('compatible policy reuses old evidence as-is',()=>{
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:v1,scoringVersion:'1.0.0',context:{contentVersion:'V2',scoringVersion:'1.0.0'},versionPolicy:{content:{V1:'compatible'}}});
  assert.equal(m.evidenceIds.length,3);
  assert.equal(m.status,'mastered');
});

test('recalculable policy keeps raw evidence and re-scores it with the current model',()=>{
  const old=[ev('r',{scoringVersion:'0.9.0',score:0.2,correct:true})];
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:old,scoringVersion:'1.0.0',context:{contentVersion:'V1',scoringVersion:'1.0.0'},versionPolicy:{scoring:{'0.9.0':'recalculable'}}});
  assert.deepEqual(m.recalculatedEvidenceIds,['r']);
  assert.equal(m.confidence,1,'raw correct answer is re-scored as 1 by the current model, not the stale 0.2');
});

test('incompatible and unknown versions are excluded (fail-safe)',()=>{
  assert.equal(classifyEvidenceVersion(ev('u',{contentVersion:'V0'}),{contentVersion:'V2',scoringVersion:'1.0.0'},{content:{V0:'incompatible'}}),'incompatible');
  assert.equal(classifyEvidenceVersion(ev('u',{contentVersion:'V9'}),{contentVersion:'V2',scoringVersion:'1.0.0'},{}),'incompatible');
  assert.equal(classifyEvidenceVersion({...ev('u',{contentVersion:'V2'}),curriculumVersion:'2025.09'},{contentVersion:'V2',scoringVersion:'1.0.0',curriculumVersion:'2026.09'}),'incompatible');
});

test('a mismatched scoringVersion is not silently mixed even without a content context',()=>{
  const m=computeConceptMastery({conceptId:'concept.c1',evidence:[ev('s',{scoringVersion:'1'})],scoringVersion:'1.0.0'});
  assert.equal(m.status,'not_started');
});

test('browser service recomputes cached mastery under the active pack context only',async()=>{
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'p0-mastery-ctx');
  const page=(contentVersion)=>({id:'practice.trainer.7.01',type:'trainer',learningUnit:{id:'lu.7.01',grade:7,title:'U'},activityVersion:'1',contentVersion,schemaVersion:'1.0.0',scoringVersion:'1.0.0'});
  const draft=(contentVersion,correct)=>({id:'practice.trainer.7.01.answer',conceptId:'concept.c1',activityId:'practice.trainer.7.01',activityVersion:'1',contentVersion,scoringVersion:'1.0.0',createdAt:'2026-09-01T00:00:00.000Z',score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:'q',correct});
  await service.recordPracticeAttempt(page('V1'),{evidence:[draft('V1',true)]});
  const after=await service.recordPracticeAttempt(page('V2'),{evidence:[draft('V2',false)]});
  assert.equal(after.mastery[0].evidenceIds.length,1);
  assert.equal(after.mastery[0].excludedEvidenceIds.length,1);
  assert.equal(after.mastery[0].status,'needs_review');
});
