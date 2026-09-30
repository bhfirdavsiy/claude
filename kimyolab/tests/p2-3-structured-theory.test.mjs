// P2.3 — structured theory system (ADR-P2-004). The contract, its fail-closed build, the fail-closed browser view,
// backward compatibility with MINIMAL theory, provenance preservation, and honest measurement. No test here writes
// chemistry: the fixture text describes itself only (tests/fixtures/structured-theory.fixture.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateStructuredTheory,classifyTheoryDepth,reviewableContent,PLACEHOLDER} from '../src/domain/theory/structured-theory.ts';
import {collectStructuredTheory,structuredTheoryPack,loadSourceRegistry,STRUCTURED_THEORY_DIR} from '../scripts/lib/structured-theory.ts';
import {structuredTheoryView} from '../src/features/theory/view.ts';
import {buildLearningHubModel} from '../src/features/learning-hub/model.ts';
import {createContentAjv} from '../scripts/lib/content-schema.ts';
import {buildTheoryAuthoring} from '../scripts/theory-authoring.ts';
import {structuredFixture,FIXTURE_THEORY_ID,FIXTURE_UNIT_ID,FIXTURE_SOURCE} from './fixtures/structured-theory.fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const registry=loadSourceRegistry(root);
const codes=(t)=>validateStructuredTheory(t,registry).issues.map(i=>i.code);
const legacy=json('content-src/theory-activities.json').find(t=>t.id===FIXTURE_THEORY_ID);

// ------------------------------------------------------------------ contract

test('schema: the fixture satisfies the JSON Schema and the contract → STRUCTURED',()=>{
  const ajv=createContentAjv(path.join(root,'schemas'));
  const validate=ajv.getSchema('structured-theory.schema.json');
  assert.equal(validate(structuredFixture()),true,JSON.stringify(validate.errors));
  assert.deepEqual(codes(structuredFixture()),[]);
  assert.equal(classifyTheoryDepth(legacy,structuredFixture(),registry).depth,'STRUCTURED');
  // the schema itself rejects extra fields and an approved block without a review
  assert.equal(validate({...structuredFixture(),extra:1}),false);
  assert.equal(validate(structuredFixture({summary:{...structuredFixture().summary,reviewStatus:'approved'}})),false);
});

test('backward compatibility: legacy theory alone is MINIMAL; no theory is NONE',()=>{
  assert.equal(classifyTheoryDepth(legacy,undefined,registry).depth,'MINIMAL');
  assert.equal(classifyTheoryDepth(undefined,undefined,registry).depth,'NONE');
  // the legacy blocks' own types never promote a unit (block-type heuristics are gone)
  const dressed={...legacy,explanationBlocks:[{type:'example',text:'x'},{type:'misconception',text:'y'},{type:'concept-summary',text:'z'.repeat(400)}]};
  assert.equal(classifyTheoryDepth(dressed,undefined,registry).depth,'MINIMAL');
});

test('incomplete structured theory is MINIMAL, with the missing block named',()=>{
  const f=structuredFixture();
  const cases=[
    [{explanation:{...f.explanation,text:'a'.repeat(299)}},'EXPLANATION_TOO_SHORT'],
    [{workedExamples:[]},'WORKED_EXAMPLE_MISSING'],
    [{misconceptions:[]},'MISCONCEPTION_MISSING'],
    [{summary:{...f.summary,points:[]}},'SUMMARY_MISSING'],
    [{workedExamples:[{...f.workedExamples[0],solutionSteps:[]}]},'SCHEMA'],
  ];
  for(const [o,code] of cases){
    const t=structuredFixture(o);
    assert.ok(codes(t).includes(code),`${code}: ${codes(t)}`);
    assert.equal(classifyTheoryDepth(legacy,t,registry).depth,'MINIMAL',code);
  }
});

test('placeholders, templates and empty slots never count as STRUCTURED',()=>{
  const f=structuredFixture();
  for(const text of ['TODO: yozish kerak','[muallif yozadi]','…','lorem ipsum dolor','{{explanation}}','TBD']){
    assert.ok(PLACEHOLDER.test(text),text);
    const t=structuredFixture({summary:{...f.summary,points:[text]}});
    assert.ok(codes(t).includes('PLACEHOLDER_TEXT'),text);
    assert.equal(classifyTheoryDepth(legacy,t,registry).depth,'MINIMAL',text);
  }
  // an authoring packet's empty slots are not an entry
  const packet=json('review-packets/theory-authoring/units/lu.9.06.json');
  assert.equal(classifyTheoryDepth(legacy,{schema:'kimyolab.structured-theory.v1',theoryId:FIXTURE_THEORY_ID,learningUnitId:FIXTURE_UNIT_ID,version:'x',...packet.slots},registry).depth,'MINIMAL');
});

test('unsourced or badly sourced content is never complete',()=>{
  const f=structuredFixture();
  const noSource=structuredFixture({explanation:{...f.explanation,sourceRefs:[]}});
  assert.ok(codes(noSource).includes('SOURCE_MISSING')); assert.equal(classifyTheoryDepth(legacy,noSource,registry).depth,'MINIMAL');
  const unregistered=structuredFixture({summary:{...f.summary,sourceRefs:['src.invented.textbook']}});
  assert.ok(codes(unregistered).includes('SOURCE_UNREGISTERED')); assert.equal(classifyTheoryDepth(legacy,unregistered,registry).depth,'MINIMAL');
  const internal=structuredFixture({summary:{...f.summary,sourceRefs:['src.beta1.migration']}});
  assert.ok(codes(internal).includes('SOURCE_NOT_ACCEPTABLE')); assert.equal(classifyTheoryDepth(legacy,internal,registry).depth,'MINIMAL');
});

test('no machine authorship, no approval without a person’s hash-pinned review',()=>{
  const f=structuredFixture();
  for(const who of ['claude','agent.p2-3','kimyolab-bot','system']) assert.ok(codes(structuredFixture({explanation:{...f.explanation,authoredBy:who}})).includes('AUTOMATION_AUTHOR'),who);
  assert.ok(codes(structuredFixture({summary:{...f.summary,reviewStatus:'approved'}})).includes('APPROVAL_WITHOUT_REVIEW'));
  assert.ok(codes(structuredFixture({summary:{...f.summary,reviewStatus:'approved',review:{reviewerId:'claude',reviewerRole:'chemistry',reviewedAt:'2026-10-01T00:00:00Z',reviewedHash:'a'.repeat(64)}}})).includes('APPROVAL_WITHOUT_REVIEW'),'an automation reviewer is not a review');
});

// ------------------------------------------------------------------ build: fail closed

function withEntries(entries){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kl-theory-'));
  for(const [name,value] of Object.entries(entries)) fs.writeFileSync(path.join(dir,name),typeof value==='string'?value:JSON.stringify(value));
  return dir;
}
test('build: malformed entries fail the build; incomplete ones stay out of the learner pack; complete ones ship with provenance',()=>{
  const f=structuredFixture();
  assert.throws(()=>collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture({summary:{...f.summary,points:['TODO']}})})),/STRUCTURED_THEORY_INVALID[\s\S]*PLACEHOLDER_TEXT/);
  assert.throws(()=>collectStructuredTheory(root,withEntries({'theory.9.06.json':'{not json'})),/STRUCTURED_THEORY_INVALID[\s\S]*JSON/);
  assert.throws(()=>collectStructuredTheory(root,withEntries({'theory.7.12.json':structuredFixture({theoryId:'theory.7.12'})})),/UNIT_MISMATCH/);
  assert.throws(()=>collectStructuredTheory(root,withEntries({'other.json':structuredFixture()})),/FILE_NAME_MUST_BE_THEORY_ID/);
  const staleApproval={...f.summary,reviewStatus:'approved',review:{reviewerId:'dilnoza.karimova',reviewerRole:'didactic',reviewedAt:'2026-10-01T00:00:00Z',reviewedHash:'b'.repeat(64)}};
  assert.throws(()=>collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture({summary:staleApproval})})),/REVIEW_HASH_STALE/);
  const pinned={...staleApproval,review:{...staleApproval.review,reviewedHash:crypto.createHash('sha256').update(reviewableContent(staleApproval)).digest('hex')}};
  assert.equal(collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture({summary:pinned})})).length,1,'a correctly pinned approval is accepted');
  // incomplete: the schema is the STRUCTURED contract, so a draft missing a block is rejected by the build
  // (drafts live in the authoring packets, not in content-src)
  assert.throws(()=>collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture({misconceptions:[]})})),/STRUCTURED_THEORY_INVALID[\s\S]*misconceptions/);
  // well-formed but citing a source that is not registered/acceptable: collected for the audit, never shipped
  const unsourced=collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture({summary:{...f.summary,sourceRefs:['src.beta1.migration']}})}));
  assert.equal(unsourced[0].sourced,false);
  assert.deepEqual(structuredTheoryPack(root,unsourced).entries,[]);
  // complete: shipped verbatim, with the titles of the cited sources
  const ok=collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture()}));
  const pack=structuredTheoryPack(root,ok);
  assert.deepEqual(pack.entries,[structuredFixture()],'text and provenance are preserved exactly');
  assert.deepEqual(pack.sources.map(s=>s.id),[FIXTURE_SOURCE]);
});

test('repository: no authored structured theory yet; the shipped pack is empty',()=>{
  const dir=path.join(root,STRUCTURED_THEORY_DIR);
  const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')):[];
  assert.deepEqual(files,[],'P2.3 authors no theory');
  const pointer=json('public/content/manifest.json');
  const shipped=json(`public/content/${pointer.activeVersion}/theory-structured.json`);
  assert.deepEqual(shipped,{schema:'kimyolab.structured-theory-pack.v1',entries:[],sources:[]});
});

// ------------------------------------------------------------------ browser view: fail closed, provenance kept

test('view: renders authored text verbatim with source titles; a tampered pack entry falls back to MINIMAL',()=>{
  const pack=structuredTheoryPack(root,collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture()})));
  const view=structuredTheoryView(pack,FIXTURE_THEORY_ID);
  const f=structuredFixture();
  assert.equal(view.explanation.text,f.explanation.text);
  assert.deepEqual(view.workedExamples[0].solutionSteps,f.workedExamples[0].solutionSteps);
  assert.equal(view.misconceptions[0].correction,f.misconceptions[0].correction);
  assert.deepEqual(view.summary.points,f.summary.points);
  const title=registry.byId.get(FIXTURE_SOURCE).title;
  assert.deepEqual(view.explanation.sources,[title]); assert.deepEqual(view.sourceList,[{id:FIXTURE_SOURCE,title}]);
  assert.equal(view.reviewState,'REVIEW_PENDING','not approved → the learner sees a review note');
  const tampered={...pack,entries:[{...pack.entries[0],misconceptions:[]}]};
  assert.equal(structuredTheoryView(tampered,FIXTURE_THEORY_ID),undefined);
  assert.equal(structuredTheoryView({...pack,sources:[]},FIXTURE_THEORY_ID),undefined,'sources must be resolvable');
  assert.equal(structuredTheoryView(undefined,FIXTURE_THEORY_ID),undefined,'older packs without the file');
});

test('hub model: MINIMAL units keep their legacy blocks; a structured entry adds the structured view',()=>{
  const data={units:json('content-src/learning-units.json'),theories:json('content-src/theory-activities.json'),practices:json('content-src/practice-activities.json'),mappings:json('content-src/mapping-links.json'),concepts:json('content-src/concepts.json')};
  const before=buildLearningHubModel(FIXTURE_UNIT_ID,data);
  assert.equal(before.theory.structured,undefined);
  assert.deepEqual(before.theory.blocks,legacy.explanationBlocks.map(b=>({type:b.type,text:b.text})));
  const pack=structuredTheoryPack(root,collectStructuredTheory(root,withEntries({[`${FIXTURE_THEORY_ID}.json`]:structuredFixture()})));
  const after=buildLearningHubModel(FIXTURE_UNIT_ID,{...data,structuredTheory:pack});
  assert.ok(after.theory.structured); assert.deepEqual(after.theory.blocks,before.theory.blocks,'legacy blocks stay available');
  assert.equal(buildLearningHubModel('lu.7.12',{...data,structuredTheory:pack}).theory.structured,undefined,'only the unit it belongs to');
});

// ------------------------------------------------------------------ measurement and authoring queue

test('theory audit: current, honest (122 MINIMAL, 0 STRUCTURED), no marketing numbers',()=>{
  const committed=json('reports/theory-depth-audit.json');
  assert.deepEqual(committed,JSON.parse(JSON.stringify(buildTheoryAuthoring(root).audit)),'run node scripts/theory-authoring.ts');
  assert.deepEqual(committed.totals,{units:122,MINIMAL:122,STRUCTURED:0,NONE:0,structuredEntriesAuthored:0});
  assert.deepEqual(committed.missingBlocks,{explanation:122,workedExample:122,misconception:122,summary:122});
  assert.deepEqual(committed.humanReview.structuredEntries,{APPROVED:0,REVIEW_PENDING:0,DRAFT:0,CHANGES_REQUESTED:0});
  const depth=json('reports/learning-depth-baseline.json');
  assert.equal(depth.learningUnits.filter(u=>u.dimensions.theory==='STRUCTURED').length,0);
  assert.equal(depth.learningUnits.filter(u=>u.dimensions.theory==='MINIMAL').length,122);
});

test('authoring packets: 122 units, facts and EMPTY slots only, no priority score',()=>{
  const q=json('review-packets/theory-authoring/queue.json');
  assert.equal(q.counts.units,122); assert.equal(q.units.length,122);
  assert.deepEqual(q.units.map(u=>u.learningUnitId),[...q.units.map(u=>u.learningUnitId)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),'ordered by id');
  for(const u of q.units) for(const k of Object.keys(u)) assert.ok(!/priority|score|rank/i.test(k),k);
  const files=fs.readdirSync(path.join(root,'review-packets/theory-authoring/units'));
  assert.equal(files.length,122);
  for(const f of files){
    const p=json(`review-packets/theory-authoring/units/${f}`);
    assert.equal(p.slots.explanation.text,null); assert.deepEqual(p.slots.explanation.sourceRefs,[]);
    assert.equal(p.slots.workedExamples[0].problem,null); assert.equal(p.slots.misconceptions[0].statement,null); assert.deepEqual(p.slots.summary.points,[]);
    for(const k of ['learningUnit','learningOutcomes','concepts','currentTheory','currentProvenance','sourceRequirements','reviewChecklist']) assert.ok(p[k],`${f}:${k}`);
  }
});
