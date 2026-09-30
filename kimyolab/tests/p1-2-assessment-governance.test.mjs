// P1.2 — assessment governance: APPROVED only through human review records; tooling prepares and imports,
// never decides. Correct answers live only in reviewer packets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deriveItemLifecycle,assessmentItemHash,validateReviewRecord} from '../src/domain/assessment/governance.ts';
import {buildPackets,validateRegister,importRegister,TEMPLATE_FILE,REGISTER_FILE} from '../scripts/assessment-review/lib.ts';
import {createContentAjv,schemaIssues} from '../scripts/lib/content-schema.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const bank=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-items.json'),'utf8'));
const unit=JSON.parse(fs.readFileSync(path.join(root,'content-src/learning-units.json'),'utf8')).find(u=>u.id==='lu.9.15');
const ctx={unitOutcomeCount:unit.learningOutcomes.length,unitConceptIds:unit.conceptIds};

function sandbox(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kl-review-'));
  fs.mkdirSync(path.join(dir,'content-src'),{recursive:true});
  // (P1.3: packets now print concept names, so the sandbox also needs concepts.json)
  for(const f of ['assessment-items.json','learning-units.json','assessment-reviews.json','concepts.json']) fs.copyFileSync(path.join(root,'content-src',f),path.join(dir,'content-src',f));
  return dir;
}
const human=(row,extra={})=>({...row,decision:'approved',reviewerId:'dilnoza.karimova',reviewedAt:'2026-09-28T09:00:00.000Z',...extra});

test('lifecycle: pending by default; APPROVED needs chemistry+didactic human records on the CURRENT content',()=>{
  const item=bank.items[0];
  assert.equal(deriveItemLifecycle(item,[],ctx).lifecycle,'REVIEW_PENDING');
  const hash=assessmentItemHash(item);
  // P1.2 closeout: a didactic record must carry the reviewer's outcome-mapping decision (the mapping was only an
  // agent proposal), so the helper adds `outcomeDecision:'confirm'` for that role. Previously a didactic approval
  // silently confirmed the proposed outcome — that was the wrong invariant (see p1-2-closeout.test.mjs).
  const rec=(role,extra={})=>({itemId:item.id,role,decision:'approved',reviewerId:`reviewer.${role}`,reviewerRole:role,reviewedAt:'2026-09-30T09:00:00.000Z',itemHash:hash,itemVersion:item.version,evidence:{packet:'p.md',packetSha256:'a'.repeat(64)},...(role==='didactic'?{outcomeDecision:'confirm'}:{}),...extra});
  assert.equal(deriveItemLifecycle(item,[rec('chemistry')],ctx).lifecycle,'REVIEW_PENDING','one role is not enough');
  assert.equal(deriveItemLifecycle(item,[rec('chemistry'),rec('didactic')],ctx).lifecycle,'APPROVED');
  // editing the item invalidates the approval (hash)
  assert.equal(deriveItemLifecycle({...item,prompt:item.prompt+' ?'},[rec('chemistry'),rec('didactic')],ctx).lifecycle,'REVIEW_PENDING');
  // automation identities never count
  assert.equal(deriveItemLifecycle(item,[rec('chemistry',{reviewerId:'claude-agent'}),rec('didactic')],ctx).lifecycle,'REVIEW_PENDING');
  assert.ok(validateReviewRecord(rec('chemistry',{reviewerId:'ci-bot'})).some(i=>i.startsWith('REVIEW_REVIEWER_NOT_HUMAN')));
  // approval also requires valid outcome/concept mapping, key and explanation
  assert.ok(deriveItemLifecycle({...item,outcomeIds:[]},[rec('chemistry'),rec('didactic')],ctx).reasons.includes('OUTCOME_MAPPING_MISSING'));
  assert.ok(deriveItemLifecycle({...item,outcomeIds:['lu.9.15#o9']},[rec('chemistry'),rec('didactic')],ctx).reasons.includes('OUTCOME_MAPPING_INVALID'));
  assert.ok(deriveItemLifecycle({...item,conceptIds:['concept.c001']},[rec('chemistry'),rec('didactic')],ctx).reasons.includes('CONCEPT_MAPPING_INVALID'));
  // a later "changes_requested" supersedes an earlier approval
  // (P1.2 closeout: a non-approval must now carry a comment to be a valid record — the importer and the
  // learning:readiness gate both reject a comment-less one — so the superseding record states its reason.)
  assert.equal(deriveItemLifecycle(item,[rec('chemistry'),rec('didactic'),rec('didactic',{decision:'changes_requested',comment:'Izohni aniqlashtiring.',reviewedAt:'2026-10-01T09:00:00.000Z'})],ctx).lifecycle,'REVIEW_PENDING');
  assert.equal(deriveItemLifecycle({...item,lifecycle:'RETIRED'},[],ctx).lifecycle,'RETIRED');
});

test('the bank cannot author APPROVED (schema) and every pilot item is outcome-mapped to its unit outcome',()=>{
  const ajv=createContentAjv(path.join(root,'schemas'));
  const approved=structuredClone(bank); approved.items[0].lifecycle='APPROVED';
  assert.ok(schemaIssues(ajv,'assessment-bank.schema.json',approved,'assessment-items.json','$').length>0);
  for(const item of bank.items){
    assert.deepEqual(item.outcomeIds,['lu.9.15#o1']);
    assert.equal(deriveItemLifecycle(item,[],ctx).lifecycle,'REVIEW_PENDING','still awaiting human review');
  }
});

test('review packets: every field for the reviewer, correct answer only there — never in the learner pack',()=>{
  const dir=sandbox();
  const out=buildPackets(dir);
  assert.deepEqual(out,{packets:5,rows:10});
  const packet=fs.readFileSync(path.join(dir,'review-packets/assessment-pilot/q.9.15.01.md'),'utf8');
  // P1.3 §21: the packet is a one-page decision view; "Kimyoviy to‘g‘rilik" became "Kimyoviy aniqlik" and the
  // didactic goal, difficulty, distractor quality and the decision/comment table were added.
  for(const field of ['itemId','LearningUnit','grade','Savol','Variantlar','To‘g‘ri javob','Izoh','Konseptlar','Taklif qilingan outcome','Cognitive demand','misconception','Kimyoviy aniqlik','Didaktik maqsad','Qiyinchilik','Chalg‘ituvchi variantlar sifati','Reviewer decision','Reviewer comment','outcomeDecision','Til va didaktika','Qaror','itemHash','approval emas']) assert.ok(packet.includes(field),field);
  assert.ok(packet.includes(`**To‘g‘ri javob:** ${bank.items[0].correctOptionId}`));
  const learnerPrompts=fs.readFileSync(path.join(root,'public/content',JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8')).activeVersion,'assessment/prompts.json'),'utf8');
  assert.doesNotMatch(learnerPrompts,/To‘g‘ri javob|correctOptionId|reviewer/);
  // reviewer packets live outside the deployable surface (public/ is what dist and standalone are built from)
  assert.equal(fs.existsSync(path.join(root,'public/review-packets')),false);
  const template=JSON.parse(fs.readFileSync(path.join(dir,TEMPLATE_FILE),'utf8'));
  assert.ok(template.records.every(r=>r.decision===null&&r.reviewerId===null&&r.reviewedAt===null),'the template decides nothing');
});

test('import requires identity, decision, timestamp and evidence; automation, stale or tampered rows are rejected',()=>{
  const dir=sandbox(); buildPackets(dir);
  const template=JSON.parse(fs.readFileSync(path.join(dir,TEMPLATE_FILE),'utf8'));
  const [first,second]=template.records;
  assert.deepEqual(validateRegister(dir,template),{rows:[],issues:[]},'an untouched template imports nothing');
  const bad=(row)=>validateRegister(dir,{...template,records:[row]}).issues;
  assert.ok(bad(human(first,{reviewerId:'claude'})).some(i=>i.startsWith('REVIEW_REVIEWER_NOT_HUMAN')));
  assert.ok(bad(human(first,{reviewerId:''})).some(i=>i.startsWith('REVIEW_REVIEWER_REQUIRED')));
  assert.ok(bad(human(first,{reviewedAt:'yesterday'})).some(i=>i.startsWith('REVIEW_TIMESTAMP_INVALID')));
  assert.ok(bad(human(first,{evidence:{packet:first.evidence.packet,packetSha256:'0'.repeat(64)}})).some(i=>i.startsWith('REVIEW_PACKET_CHANGED')));
  assert.ok(bad(human(first,{itemHash:'f'.repeat(64)})).some(i=>i.startsWith('REVIEW_ITEM_HASH_STALE')));
  assert.ok(bad(human(first,{reviewerRole:'didactic'})).some(i=>i.startsWith('REVIEW_ROLE_MISMATCH')));
  assert.ok(bad(human(first,{decision:'rejected'})).some(i=>i.startsWith('REVIEW_COMMENT_REQUIRED')));
  assert.throws(()=>importRegister(dir,{...template,records:[human(first,{reviewerId:'gpt-4'})]}),/ASSESSMENT_REVIEW_IMPORT_REJECTED/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,REGISTER_FILE),'utf8')).records,[],'a rejected import writes nothing');
  // a valid human decision is appended; re-import is idempotent; nothing existing is rewritten
  const ok={...template,records:[human(first),human(second,{reviewerId:'aziz.rahimov',outcomeDecision:'confirm'})]};   // two different people; didactic confirms the outcome
  assert.deepEqual(importRegister(dir,ok),{imported:2,skippedUnreviewed:0});
  assert.deepEqual(importRegister(dir,ok),{imported:0,skippedUnreviewed:0});
  const records=JSON.parse(fs.readFileSync(path.join(dir,REGISTER_FILE),'utf8')).records;
  assert.equal(records.length,2);
  const item=JSON.parse(fs.readFileSync(path.join(dir,'content-src/assessment-items.json'),'utf8')).items.find(i=>i.id===first.itemId);
  assert.equal(deriveItemLifecycle(item,records,ctx).lifecycle,'APPROVED','both roles approved by people → APPROVED');
});

test('the committed review register holds no approvals: the agent approved nothing',()=>{
  const register=JSON.parse(fs.readFileSync(path.join(root,'content-src/assessment-reviews.json'),'utf8'));
  assert.deepEqual(register.records,[]);
});
