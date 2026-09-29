// P1.1 — C3 assessment integrity: AssessmentPrompt vs AssessmentKey, canonical evaluator, pack separation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitAssessmentBank,validatePromptPack,validateKeyPack,itemReadiness,toPromptView,ASSESSMENT_PROMPT_PACK_PATH,ASSESSMENT_KEY_PACK_PATH} from '../src/domain/assessment/model.ts';
import {evaluateAssessment,evaluationToEvidenceDrafts} from '../src/domain/assessment/evaluator.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
const pointer=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const pack=path.join(root,'public/content',pointer.activeVersion);
const approvedBank=()=>{const b=structuredClone(bank);for(const i of b.items)i.review={chemistry:'approved',didactic:'approved'};return b;};
const KEY_FIELDS=/correctOptionId|scoringRule|explanation/;

test('split: the prompt layer carries no answer-key field; the key layer carries every key',()=>{
  const {prompts,keys}=splitAssessmentBank(bank);
  assert.equal(prompts.items.length,bank.items.length);
  assert.doesNotMatch(JSON.stringify(prompts),KEY_FIELDS);
  for(const item of bank.items){
    const key=keys.keys.find(k=>k.itemId===item.id);
    assert.equal(key.correctOptionId,item.correctOptionId);
    assert.deepEqual(key.scoringRule,{kind:'exact-option',correctScore:1,incorrectScore:0});
  }
  assert.equal(validatePromptPack(prompts),prompts);
  assert.equal(validateKeyPack(keys),keys);
});

test('a prompt pack that leaks a key field is rejected (fail closed)',()=>{
  const {prompts}=splitAssessmentBank(bank);
  const leaked=structuredClone(prompts); leaked.items[0].correctOptionId='A';
  assert.throws(()=>validatePromptPack(leaked),/ASSESSMENT_PROMPT_LEAKS_FIELD/);
  const optionLeak=structuredClone(prompts); optionLeak.items[0].options[0].correct=true;
  assert.throws(()=>validatePromptPack(optionLeak),/ASSESSMENT_PROMPT_LEAKS_FIELD/);
});

test('the built content pack ships prompts and keys as separate files and no longer ships the authored bank',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(pack,'manifest.json'),'utf8'));
  const files=manifest.files.map(f=>f.path);
  assert.ok(files.includes(ASSESSMENT_PROMPT_PACK_PATH));
  assert.ok(files.includes(ASSESSMENT_KEY_PACK_PATH));
  assert.ok(!files.includes('assessment-items.json'),'the authored bank (with keys) is not a pack asset');
  const promptFile=fs.readFileSync(path.join(pack,ASSESSMENT_PROMPT_PACK_PATH),'utf8');
  assert.doesNotMatch(promptFile,KEY_FIELDS);
  validatePromptPack(JSON.parse(promptFile));
  validateKeyPack(JSON.parse(fs.readFileSync(path.join(pack,ASSESSMENT_KEY_PACK_PATH),'utf8')));
});

test('the learner-facing projection is built from prompts only',()=>{
  const {prompts}=splitAssessmentBank(bank);
  const view=toPromptView(prompts.items[0]);
  assert.deepEqual(Object.keys(view).sort(),['id','options','stem']);
  assert.doesNotMatch(JSON.stringify(view),KEY_FIELDS);
});

test('item readiness: approval, concept mapping and a scorable key are all required',()=>{
  const {prompts,keys}=splitAssessmentBank(approvedBank());
  const [p]=prompts.items; const k=keys.keys.find(x=>x.itemId===p.id);
  assert.deepEqual(itemReadiness(p,k),{ready:true});
  assert.deepEqual(itemReadiness({...p,review:{chemistry:'pending',didactic:'approved'}},k).reasons,['REVIEW_PENDING']);
  assert.deepEqual(itemReadiness({...p,conceptIds:[]},k).reasons,['CONCEPT_MAPPING_MISSING']);
  assert.deepEqual(itemReadiness(p,undefined).reasons,['KEY_MISSING']);
  assert.deepEqual(itemReadiness(p,{...k,correctOptionId:'Z'}).reasons,['KEY_OPTION_UNKNOWN']);
});

// ------------------------------------------------------------------ canonical evaluator

const lu='lu.9.15';
function submission(responses){return {assessmentId:`assessment.${lu}`,learningUnitId:lu,assessmentVersion:bank.version,responses};}
function allCorrect(){return bank.items.map(i=>({itemId:i.id,selectedOptionId:i.correctOptionId}));}

test('evaluator: correct and incorrect answers are both scored; the UI never decides correctness',()=>{
  const {prompts,keys}=splitAssessmentBank(approvedBank());
  const responses=allCorrect(); responses[1]={itemId:responses[1].itemId,selectedOptionId:bank.items[1].options.find(o=>o.id!==bank.items[1].correctOptionId).id};
  const r=evaluateAssessment({prompts:prompts.items,keys:keys.keys,submission:submission(responses)});
  assert.equal(r.objectiveItems,5);
  assert.equal(r.correctItems,4);
  assert.deepEqual(r.items.map(i=>i.correct),[true,false,true,true,true]);
  assert.deepEqual(r.items.map(i=>i.score),[1,0,1,1,1]);
});

test('evaluator fails closed: missing, duplicate, unknown item, invalid option, missing key',()=>{
  const {prompts,keys}=splitAssessmentBank(approvedBank());
  const run=(responses,k=keys.keys)=>()=>evaluateAssessment({prompts:prompts.items,keys:k,submission:submission(responses)});
  assert.throws(run(allCorrect().slice(1)),/ASSESSMENT_RESPONSE_MISSING/);
  assert.throws(run([...allCorrect(),allCorrect()[0]]),/ASSESSMENT_RESPONSE_DUPLICATE/);
  assert.throws(run([...allCorrect(),{itemId:'q.9.15.99',selectedOptionId:'A'}]),/ASSESSMENT_RESPONSE_UNKNOWN_ITEM/);
  assert.throws(run(allCorrect().map((r,i)=>i?r:{...r,selectedOptionId:'Z'})),/ASSESSMENT_RESPONSE_INVALID_OPTION/);
  assert.throws(run(allCorrect(),keys.keys.slice(1)),/ASSESSMENT_KEY_MISSING/);
  assert.throws(()=>evaluateAssessment({prompts:[],keys:keys.keys,submission:submission([])}),/ASSESSMENT_NO_ITEMS/);
});

test('evidence drafts: one objective concept-assessment answer per item × concept with full provenance',()=>{
  const {prompts,keys}=splitAssessmentBank(approvedBank());
  const responses=allCorrect(); responses[0]={...responses[0],selectedOptionId:'B'};
  const evaluation=evaluateAssessment({prompts:prompts.items,keys:keys.keys,submission:submission(responses)});
  const drafts=evaluationToEvidenceDrafts(evaluation,{contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:'2026-09-29T10:00:00.000Z'});
  const expected=bank.items.reduce((n,i)=>n+i.conceptIds.length,0);
  assert.equal(drafts.length,expected);
  for(const d of drafts){
    validateEvidence(d);
    assert.equal(d.evidenceClass,'concept-assessment');
    assert.equal(d.activityId,`assessment.${lu}`);
    assert.equal(d.activityVersion,bank.version);
    assert.ok(d.questionId&&d.response&&d.itemVersion&&d.conceptId&&d.createdAt&&d.contentVersion&&d.scoringVersion);
  }
  const wrong=drafts.filter(d=>d.questionId===bank.items[0].id);
  assert.ok(wrong.length>0&&wrong.every(d=>d.correct===false&&d.score===0&&d.response==='B'),'incorrect answers are evidence too');
  assert.equal(new Set(drafts.map(d=>d.id)).size,drafts.length,'independent items/concepts never share an identity');
});
