// P2.4 — governed theory authoring & source operations (ADR-P2-005). Source intake and its human review, the
// structured-theory dual review made operational (packets, import, apply), the option-set authoring primitives, the
// workbench that runs the same code, and honest status reporting. No test writes chemistry: theory text comes from the
// neutral P2.3 fixture; identities below are test fixtures, never repository data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {blockContentHash,blockGovernance,theoryReviewState,contentBlocks} from '../src/domain/theory/structured-theory.ts';
import {packetToEntry,packetWithEntry,entryHashes,THEORY_PACKET_SCHEMA} from '../src/authoring/authoring-packet.ts';
import {sourceGovernance,sourceEntryHash,validateSourceIntake,detectSourceDuplicates,INTAKE_CATEGORIES} from '../src/authoring/source-intake.ts';
import {validateOptionSetDraft,optionSetGovernance} from '../src/authoring/option-set-draft.ts';
import {sourceAcceptance,canonicalSourceIssues,parseSourceRegistry} from '../src/domain/governance/source-policy.ts';
import {loadGovernedSourceRegistry} from '../scripts/lib/source-registry.ts';
import {checkTheoryPacket,applyTheoryPacket,importTheoryDraft,applySourceIntake,buildTheoryAuthoringStatus,formatSourceRegistry,sourceReviewQueue,canonicalJson,THEORY_STATUS_REPORT} from '../scripts/lib/content-operations.ts';
import {collectStructuredTheory,assertCanonicalTheoryApproved} from '../scripts/lib/structured-theory.ts';
import {createContentAjv} from '../scripts/lib/content-schema.ts';
import {bundleBrowserModules} from '../scripts/lib/browser-module-bundle.ts';
import {WORKBENCH_DOMAIN_MODULES,buildContentWorkbenchModel} from '../scripts/lib/content-workbench.ts';
import {structuredFixture,FIXTURE_UNIT_ID,FIXTURE_THEORY_ID,FIXTURE_SOURCE} from './fixtures/structured-theory.fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=(rel,base=root)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
const sandbox=()=>{ const t=fs.mkdtempSync(path.join(os.tmpdir(),'kl-p24-')); for(const d of ['content-src','schemas','review-packets']) fs.cpSync(path.join(root,d),path.join(t,d),{recursive:true}); return t; };
const AT='2026-10-01T00:00:00.000Z';
const CHEM='fixture.chemistry-reviewer', DID='fixture.didactic-reviewer';
const review=(block,role,reviewerId,{hash=blockContentHash(block),decision='approved'}={})=>({reviewerId,reviewerRole:role,decision,reviewedAt:AT,reviewedHash:hash});
const approveBlock=(b)=>({...b,reviews:[review(b,'chemistry',CHEM),review(b,'didactic',DID)]});
const approveAll=(e)=>({...e,explanation:approveBlock(e.explanation),workedExamples:e.workedExamples.map(approveBlock),misconceptions:e.misconceptions.map(approveBlock),summary:approveBlock(e.summary)});
// P2.4 closeout (A1): canonical theory needs a HUMAN_ACCEPTED source, which only the governed intake can create. The
// helper runs that real path in a sandbox (intake file → human decision → applySourceIntake); repository data is untouched.
const ACCEPTED_SOURCE='src.fixture.curriculum';
function acceptFixtureSource(t,{id=ACCEPTED_SOURCE,category='CURRICULUM'}={}){
  const e={schema:'kimyolab.source-intake.v1',sourceId:id,category,title:`Fixture ${category.toLowerCase()} ${id}`,authority:'Fixture authority',year:2021,language:'uz-Latn',bibliographic:{},locator:{kind:'section'},submittedBy:'fixture.submitter',status:'ready-for-review',reviews:[]};
  const ok={...e,reviews:[{reviewerId:'fixture.source-reviewer',decision:'approved',acceptedCategory:category,reviewedAt:'2026-10-01T00:00:00.000Z',reviewedHash:sourceEntryHash(e)}]};
  fs.mkdirSync(path.join(t,'content-src/source-intake'),{recursive:true});
  fs.writeFileSync(path.join(t,`content-src/source-intake/${id}.json`),JSON.stringify(ok,null,2));
  assert.deepEqual(applySourceIntake(t,ok),{applied:true,issues:[]});
  return id;
}
const withSource=(e,id)=>({...e,explanation:{...e.explanation,sourceRefs:[id]},workedExamples:e.workedExamples.map(w=>({...w,sourceRefs:[id]})),misconceptions:e.misconceptions.map(m=>({...m,sourceRefs:[id]})),summary:{...e.summary,sourceRefs:[id]}});
const unitPacket=(base=root)=>json(`review-packets/theory-authoring/units/${FIXTURE_UNIT_ID}.json`,base);
const packetOf=(entry,base=root)=>packetWithEntry(unitPacket(base),entry);

// ------------------------------------------------------------------ source intake

const intake=(over={})=>({schema:'kimyolab.source-intake.v1',sourceId:'src.fixture.textbook',category:'TEXTBOOK',title:'Fixture textbook title',authority:'Fixture publisher',edition:'1',year:2020,language:'uz-Latn',bibliographic:{authors:['Fixture Author']},locator:{kind:'page'},submittedBy:'fixture.submitter',status:'ready-for-review',reviews:[],...over});
const sourceReview=(e,reviewerId,{decision='approved',acceptedCategory=e.category,hash=sourceEntryHash(e)}={})=>({reviewerId,decision,acceptedCategory,reviewedAt:AT,reviewedHash:hash});

test('source schema: intake entries are validated by JSON Schema and by the domain rules',()=>{
  const validate=createContentAjv(path.join(root,'schemas')).getSchema('source-intake.schema.json');
  assert.equal(validate(intake()),true,JSON.stringify(validate.errors));
  assert.equal(validate(intake({sourceId:'Bad Id'})),false);
  assert.equal(validate(intake({locator:{kind:'chapter'}})),false);
  assert.equal(validate(intake({document:{fileName:'x.pdf',sha256:'nothex'}})),false);
  assert.deepEqual(validateSourceIntake(intake()),[]);
  assert.deepEqual(validateSourceIntake(intake({title:'TODO'})).map(i=>i.code),['PLACEHOLDER_TEXT']);
  assert.deepEqual(validateSourceIntake(intake({submittedBy:''})).map(i=>i.code),['SUBMITTER_MISSING']);
  assert.deepEqual(validateSourceIntake(intake({submittedBy:'claude'})).map(i=>i.code),['AUTOMATION_SUBMITTER']);
});

test('source category: INTERNAL_PROPOSAL and unknown categories are not intake categories',()=>{
  assert.ok(!INTAKE_CATEGORIES.includes('INTERNAL_PROPOSAL'));
  for(const c of ['CURRICULUM','TEXTBOOK','OFFICIAL_STANDARD','AUTHORITATIVE_REFERENCE']) assert.ok(INTAKE_CATEGORIES.includes(c),c);
  for(const c of ['INTERNAL_PROPOSAL','BLOG','']) assert.ok(validateSourceIntake(intake({category:c})).some(i=>i.code==='CATEGORY_INVALID'),c);
});

test('source duplicates: same id (registry or intake), same document hash, same bibliographic identity',()=>{
  const registered=json('content-src/source-registry.json').sources;
  const doc={fileName:'a.pdf',sha256:'a'.repeat(64)};
  const a=intake({sourceId:'src.curriculum.9.06'});
  const b=intake({sourceId:'src.fixture.b',document:doc}), c=intake({sourceId:'src.fixture.c',document:doc,title:'Other title'});
  const d=intake({sourceId:'src.fixture.d',title:'Fixture  textbook, title'});
  const dups=detectSourceDuplicates([a,b,c,d],registered);
  assert.ok(dups.get('src.curriculum.9.06').some(x=>x.code==='DUPLICATE_ID'&&x.with==='registry:src.curriculum.9.06'));
  assert.ok(dups.get('src.fixture.c').some(x=>x.code==='DUPLICATE_DOCUMENT'&&x.with==='intake:src.fixture.b'));
  assert.ok(dups.get('src.fixture.d').some(x=>x.code==='DUPLICATE_BIBLIOGRAPHIC'),'normalized title + authority + edition + year');
});

test('source review: only a human who is not the submitter, on the current hash, accepting the claimed category, approves',()=>{
  const e=intake();
  assert.equal(sourceGovernance(e).state,'READY_FOR_REVIEW');
  assert.equal(sourceGovernance(intake({status:'draft'})).state,'DRAFT');
  assert.equal(sourceGovernance({...e,reviews:[sourceReview(e,'fixture.source-reviewer')]}).state,'APPROVED');
  for(const who of ['claude','github-actions','kimyolab-bot','ai-reviewer']) assert.notEqual(sourceGovernance({...e,reviews:[sourceReview(e,who)]}).state,'APPROVED',`machine approval rejected: ${who}`);
  assert.ok(sourceGovernance({...e,reviews:[sourceReview(e,'fixture.submitter')]}).issues.includes('SELF_REVIEW'));
  assert.notEqual(sourceGovernance({...e,reviews:[sourceReview(e,'fixture.submitter')]}).state,'APPROVED');
  const wrongCategory={...e,reviews:[sourceReview(e,'fixture.source-reviewer',{acceptedCategory:'CURRICULUM'})]};
  assert.ok(sourceGovernance(wrongCategory).issues.includes('CATEGORY_NOT_ACCEPTED')); assert.notEqual(sourceGovernance(wrongCategory).state,'APPROVED');
  const approved={...e,reviews:[sourceReview(e,'fixture.source-reviewer')]};
  assert.equal(sourceGovernance({...approved,edition:'2'}).state,'READY_FOR_REVIEW','a metadata edit makes the decision stale');
  assert.equal(sourceGovernance({...e,reviews:[sourceReview(e,'fixture.source-reviewer',{decision:'rejected'})]}).state,'REJECTED');
  assert.equal(sourceGovernance({...e,reviews:[sourceReview(e,'fixture.source-reviewer',{decision:'changes-requested'})]}).state,'CHANGES_REQUESTED');
});

test('source apply: only an APPROVED, duplicate-free entry joins the registry, with its decision record; format is stable',()=>{
  const t=sandbox();
  const before=fs.readFileSync(path.join(t,'content-src/source-registry.json'),'utf8');
  assert.equal(formatSourceRegistry(JSON.parse(before)),before,'the registry writer reproduces the reviewed layout byte for byte');
  const e=intake();
  assert.equal(applySourceIntake(t,e).applied,false,'not reviewed → not applied');
  assert.equal(applySourceIntake(t,{...e,reviews:[sourceReview(e,'claude')]}).applied,false,'machine approval → not applied');
  assert.equal(fs.readFileSync(path.join(t,'content-src/source-registry.json'),'utf8'),before);
  const dup=intake({sourceId:'src.curriculum.9.06'});
  assert.ok(applySourceIntake(t,{...dup,reviews:[sourceReview(dup,'fixture.source-reviewer')]}).issues.some(i=>i.startsWith('DUPLICATE_ID')));
  const ok={...e,reviews:[sourceReview(e,'fixture.source-reviewer')]};
  assert.deepEqual(applySourceIntake(t,ok),{applied:true,issues:[]});
  const reg=json('content-src/source-registry.json',t);
  const added=reg.sources.find(s=>s.id==='src.fixture.textbook');
  assert.deepEqual([added.category,added.classification,added.acceptedBy,added.submittedBy,added.reviewedHash],['TEXTBOOK','HUMAN_ACCEPTED','fixture.source-reviewer','fixture.submitter',sourceEntryHash(e)]);
  assert.equal(reg.sources.length,JSON.parse(before).sources.length+1);
  assert.equal(applySourceIntake(t,ok).applied,false,'applying twice is a duplicate');
});

test('source queue: repository intake is empty; no source was declared authoritative by a machine',()=>{
  assert.deepEqual(sourceReviewQueue(root),[]);
  const reg=json('content-src/source-registry.json');
  assert.equal(reg.sources.filter(s=>s.classification==='HUMAN_ACCEPTED').length,0,'P2.4 accepts no source itself');
  assert.equal(reg.sources.length,5,'registry unchanged by P2.4');
  const q=json('review-packets/source-intake/queue.json');
  assert.equal(q.counts.entries,0);
});

test('source acceptance (P2.4 closeout A1/A2): category-compatible ≠ human-accepted; only both are canonical-theory eligible',()=>{
  const {registry}=loadGovernedSourceRegistry(root);
  const cur=registry.byId.get('src.curriculum.9.06');
  assert.equal(cur.classification,'PROPOSED','no existing source was reclassified');
  assert.deepEqual(sourceAcceptance(cur),{registered:true,categoryCompatible:true,humanAccepted:false,canonicalAuthoringEligible:false},'PROPOSED CURRICULUM');
  assert.deepEqual(sourceAcceptance(registry.byId.get('src.beta1.migration')),{registered:true,categoryCompatible:false,humanAccepted:false,canonicalAuthoringEligible:false},'INTERNAL_PROPOSAL');
  assert.deepEqual(canonicalSourceIssues(['src.curriculum.9.06','src.beta1.migration','src.not.registered'],registry).map(i=>i.code),['SOURCE_NOT_HUMAN_ACCEPTED','SOURCE_CATEGORY_NOT_ACCEPTABLE','SOURCE_UNREGISTERED']);
  // a hand-written HUMAN_ACCEPTED record: an automation acceptor or missing pin facts never count
  const reg=(over)=>parseSourceRegistry({schema:'kimyolab.source-registry.v1',sources:[{id:'src.x',category:'CURRICULUM',title:'x',classification:'HUMAN_ACCEPTED',acceptedBy:'fixture.person',acceptedAt:'2026-10-01T00:00:00Z',reviewedHash:'a'.repeat(64),...over}]}).registry;
  assert.equal(sourceAcceptance(reg({}).byId.get('src.x')).humanAccepted,true,'well-formed record (still subject to the intake pin below)');
  for(const acceptedBy of ['claude','github-actions','kimyolab-bot']) assert.equal(sourceAcceptance(reg({acceptedBy}).byId.get('src.x')).humanAccepted,false,`automation may not accept: ${acceptedBy}`);
  assert.equal(sourceAcceptance(reg({reviewedHash:undefined}).byId.get('src.x')).humanAccepted,false,'unpinned');
  // through the governed path: accepted and pinned → eligible; HUMAN_ACCEPTED CURRICULUM passes the source gate
  const t=sandbox(); const id=acceptFixtureSource(t);
  const g=loadGovernedSourceRegistry(t);
  assert.deepEqual(g.pinIssues,[]); assert.equal(sourceAcceptance(g.registry.byId.get(id)).canonicalAuthoringEligible,true);
  const check=checkTheoryPacket(t,packetOf(approveAll(withSource(structuredFixture(),id)),t));
  assert.ok(!check.issues.some(i=>i.startsWith('SOURCE_')),JSON.stringify(check.issues));
  // metadata edit after approval: the intake decision is stale and the registry record is no longer pinned → not eligible
  const file=path.join(t,`content-src/source-intake/${id}.json`); const intake=json(`content-src/source-intake/${id}.json`,t);
  fs.writeFileSync(file,JSON.stringify({...intake,title:`${intake.title} (edited)`}));
  assert.equal(sourceGovernance({...intake,title:`${intake.title} (edited)`}).state,'READY_FOR_REVIEW','source decision stale');
  const after=loadGovernedSourceRegistry(t);
  assert.deepEqual(after.pinIssues,[{id,issue:'INTAKE_HASH_MISMATCH'}]);
  assert.equal(sourceAcceptance(after.registry.byId.get(id)).canonicalAuthoringEligible,false);
  assert.ok(checkTheoryPacket(t,packetOf(approveAll(withSource(structuredFixture(),id)),t)).issues.includes(`SOURCE_NOT_HUMAN_ACCEPTED:summary:${id}`));
  // a registry record hand-edited to HUMAN_ACCEPTED with no intake behind it is not accepted
  fs.rmSync(file); assert.deepEqual(loadGovernedSourceRegistry(t).pinIssues,[{id,issue:'INTAKE_MISSING'}]);
});

// ------------------------------------------------------------------ theory: dual review made operational

test('theory review: one review is not approval; different hashes are not; self-review and one person in both roles fail',()=>{
  const b=structuredFixture().summary;
  assert.equal(blockGovernance({...b,reviews:[review(b,'chemistry',CHEM)]}).state,'REVIEW_PENDING');
  const edited={...b,points:[...b.points,'Uchinchi band.']};
  assert.equal(blockGovernance({...edited,reviews:[review(b,'chemistry',CHEM),review(edited,'didactic',DID)]}).state,'STALE_REVIEW');
  assert.ok(blockGovernance({...b,reviews:[review(b,'chemistry','fixture.author')]}).issues.includes('SELF_REVIEW'));
  assert.ok(blockGovernance({...b,reviews:[review(b,'chemistry',CHEM),review(b,'didactic',CHEM)]}).issues.includes('SAME_REVIEWER_BOTH_ROLES'));
  assert.ok(blockGovernance({...b,reviews:[review(b,'chemistry','gpt-reviewer')]}).issues.includes('REVIEWER_NOT_HUMAN'));
  assert.equal(blockGovernance(approveBlock(b)).state,'APPROVED','dual review → approved');
  const approved=approveBlock(b);
  assert.equal(blockGovernance({...approved,points:['Boshqa band.']}).state,'STALE_REVIEW','content edit makes reviews stale');
  assert.equal(blockGovernance({...approved,sourceRefs:['src.legacy.9.10']}).state,'STALE_REVIEW','source edit makes reviews stale');
});

test('packet round-trip: learningUnitId, sourceRefs, content, author, reviews and hashes survive unchanged and in order',()=>{
  const entry=approveAll(structuredFixture({workedExamples:[structuredFixture().workedExamples[0],{...structuredFixture().workedExamples[0],problem:'Ikkinchi fixture masalasi.'}]}));
  const packet=packetOf(entry);
  assert.equal(packet.schema,THEORY_PACKET_SCHEMA);
  assert.equal(packet.learningUnit.id,FIXTURE_UNIT_ID);
  assert.deepEqual(packet.contentHashes,entryHashes(entry));
  const back=packetToEntry(JSON.parse(JSON.stringify(packet)));
  assert.deepEqual(back.issues,[]);
  assert.deepEqual(back.entry,entry,'slots → entry is lossless and does not reorder blocks or steps');
  assert.deepEqual(packetWithEntry(packet,back.entry),packet,'entry → packet → entry → packet is a fixed point');
  assert.equal(packet.slots.explanation.minChars,300,'slot hints are kept on the packet, never in the entry');
  // a packet edited after export no longer matches its hashes
  const tampered=JSON.parse(JSON.stringify(packet)); tampered.slots.summary.points.push('Qo‘shilgan band.');
  assert.ok(packetToEntry(tampered).issues.includes('PACKET_HASH_MISMATCH'));
  // the repository keeps all 122 P2.3 packets, slots empty, with a version slot
  const dir=path.join(root,'review-packets/theory-authoring/units');
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));
  assert.equal(files.length,122);
  for(const f of files){ const p=json(`review-packets/theory-authoring/units/${f}`); assert.equal(p.slots.version,null); assert.equal(p.slots.explanation.text,null); assert.deepEqual(p.slots.summary.points,[]); assert.equal(p.contentHashes,undefined); }
});

test('governed apply: no approval → no canonical apply; an approved packet is written deterministically',()=>{
  const t=sandbox();
  const draft=packetOf(approveAll(structuredFixture())); draft.slots.version=null;
  const noVersion=checkTheoryPacket(t,draft);
  assert.equal(noVersion.ok,false); assert.ok(noVersion.issues.includes('PACKET_VERSION_MISSING'));
  const unapproved=packetOf({...structuredFixture()});
  const r1=applyTheoryPacket(t,unapproved);
  assert.equal(r1.applied,false); assert.ok(r1.issues.some(i=>i.startsWith('NOT_APPROVED')));
  const half=packetOf({...structuredFixture(),summary:{...structuredFixture().summary,reviews:[review(structuredFixture().summary,'chemistry',CHEM)]}});
  assert.equal(applyTheoryPacket(t,half).applied,false,'one review is not enough');
  const selfReviewed=packetOf(approveAll(structuredFixture({summary:{...structuredFixture().summary,authoredBy:CHEM}})));
  assert.equal(applyTheoryPacket(t,selfReviewed).applied,false,'self-review blocks apply');
  const unregistered=approveAll(structuredFixture({summary:{...structuredFixture().summary,sourceRefs:['src.not.registered']}}));
  assert.ok(applyTheoryPacket(t,packetOf(unregistered)).issues.some(i=>i.startsWith('SOURCE_UNREGISTERED')),'an unregistered source cannot enter');
  const internal=approveAll(structuredFixture({summary:{...structuredFixture().summary,sourceRefs:['src.beta1.migration']}}));
  assert.ok(applyTheoryPacket(t,packetOf(internal)).issues.includes('SOURCE_CATEGORY_NOT_ACCEPTABLE:summary:src.beta1.migration'),'INTERNAL_PROPOSAL does not count');
  // P2.4 closeout (A1): a registered, category-compatible but merely PROPOSED source is not enough
  const proposed=checkTheoryPacket(t,packetOf(approveAll(structuredFixture())));
  assert.equal(proposed.ok,false);
  assert.deepEqual(proposed.issues,['explanation','workedExamples[0]','misconceptions[0]','summary'].map(b=>`SOURCE_NOT_HUMAN_ACCEPTED:${b}:${FIXTURE_SOURCE}`),'PROPOSED CURRICULUM → the only blocker is human acceptance');
  assert.equal(applyTheoryPacket(t,packetOf(approveAll(structuredFixture()))).applied,false);
  assert.equal(fs.existsSync(path.join(t,'content-src/theory-structured',`${FIXTURE_THEORY_ID}.json`)),false,'nothing written');
  const approved=approveAll(withSource(structuredFixture(),acceptFixtureSource(t)));
  const ok=applyTheoryPacket(t,packetOf(approved));
  assert.deepEqual(ok,{applied:true,file:`content-src/theory-structured/${FIXTURE_THEORY_ID}.json`,issues:[]});
  const bytes=fs.readFileSync(path.join(t,ok.file),'utf8');
  assert.equal(bytes,canonicalJson(approved));
  applyTheoryPacket(t,packetOf(approved));
  assert.equal(fs.readFileSync(path.join(t,ok.file),'utf8'),bytes,'apply is deterministic');
  assert.deepEqual(JSON.parse(bytes),JSON.parse(JSON.stringify(approved)),'content and provenance unchanged');
  const collected=collectStructuredTheory(t);
  assert.equal(theoryReviewState(collected[0].entry),'APPROVED');
  assert.doesNotThrow(()=>assertCanonicalTheoryApproved(collected,t));
});

test('build guard: a canonical structured entry without dual approval fails closed (hand edits cannot bypass apply)',()=>{
  const t=sandbox();
  fs.mkdirSync(path.join(t,'content-src/theory-structured'),{recursive:true});
  const src=acceptFixtureSource(t);
  fs.writeFileSync(path.join(t,'content-src/theory-structured',`${FIXTURE_THEORY_ID}.json`),JSON.stringify(withSource(structuredFixture(),src)));
  assert.throws(()=>assertCanonicalTheoryApproved(collectStructuredTheory(t),t),/CANONICAL_THEORY_NOT_APPROVED[\s\S]*NOT_APPROVED:REVIEW_PENDING/);
  // an approved entry edited by hand afterwards is stale → also refused
  const edited=approveAll(withSource(structuredFixture(),src)); edited.summary.points=['Qo‘lda o‘zgartirilgan band.'];
  fs.writeFileSync(path.join(t,'content-src/theory-structured',`${FIXTURE_THEORY_ID}.json`),JSON.stringify(edited));
  assert.throws(()=>assertCanonicalTheoryApproved(collectStructuredTheory(t),t),/STALE_REVIEW/);
  // fully dual-approved but citing a merely PROPOSED source (written by hand, bypassing apply) → refused
  fs.writeFileSync(path.join(t,'content-src/theory-structured',`${FIXTURE_THEORY_ID}.json`),JSON.stringify(approveAll(structuredFixture())));
  assert.throws(()=>assertCanonicalTheoryApproved(collectStructuredTheory(t),t),/SOURCE_NOT_HUMAN_ACCEPTED:summary:src\.curriculum\.9\.06/);
});

test('theory import: a workbench packet becomes a NON-canonical working draft; status reports it, progress does not move',()=>{
  const t=sandbox();
  const src=acceptFixtureSource(t);
  const fx=(over)=>withSource(structuredFixture(over),src);
  // a draft citing only the PROPOSED legacy source is source-blocked, not "ready"
  importTheoryDraft(t,packetOf({...structuredFixture(),version:'1.0.0'}));
  assert.equal(buildTheoryAuthoringStatus(t).totals.missingSource,1,'PROPOSED source → missingSource');
  const draft=packetOf({...fx(),version:'1.0.0'});
  const r=importTheoryDraft(t,draft);
  assert.deepEqual([r.imported,r.file],[true,`authoring-drafts/theory/${FIXTURE_UNIT_ID}.json`]);
  assert.equal(fs.existsSync(path.join(t,'content-src/theory-structured',`${FIXTURE_THEORY_ID}.json`)),false,'import is never canonical');
  const s=buildTheoryAuthoringStatus(t);
  assert.equal(s.workingDrafts,1); assert.equal(s.totals.readyForReview,1); assert.equal(s.totals.notStarted,121);
  const unitRow=s.units.find(u=>u.learningUnitId===FIXTURE_UNIT_ID);
  assert.deepEqual([unitRow.origin,unitRow.state,unitRow.missingChemistry,unitRow.missingDidactic],['draft','readyForReview',true,true]);
  assert.equal(s.blocked.inAuthoringByChemistryReview,1); assert.equal(s.blocked.unitsInAuthoring,1); assert.equal(s.blocked.unitsNotYetInAuthoring,121);
  assert.equal(s.sources.canonicalTheoryEligibleSources,1); assert.equal(s.blocked.canonicalApplyImpossibleForAllUnits,false);
  // chemistry-reviewed only
  const chemOnly=fx(); for(const {block} of contentBlocks(chemOnly)) block.reviews=[review(block,'chemistry',CHEM)];
  importTheoryDraft(t,packetOf({...chemOnly,version:'1.0.0'}));
  assert.equal(buildTheoryAuthoringStatus(t).totals.chemistryReviewed,1);
  // unsourced draft
  const unsourced=fx(); unsourced.summary.sourceRefs=[];
  importTheoryDraft(t,packetOf({...unsourced,version:'1.0.0'}));
  const s2=buildTheoryAuthoringStatus(t); assert.equal(s2.totals.missingSource,1); assert.equal(s2.blocked.inAuthoringBySources,1);
  assert.equal(importTheoryDraft(t,{schema:'nope'}).imported,false);
});

test('theory authoring status: current, facts only, 122 units not started, no priority score, separate from progress',()=>{
  const s=json(THEORY_STATUS_REPORT);
  assert.deepEqual(JSON.parse(JSON.stringify(buildTheoryAuthoringStatus(root))),s,'run npm run theory:authoring');
  assert.deepEqual(s.totals,{units:122,notStarted:122,draft:0,readyForReview:0,chemistryReviewed:0,didacticReviewed:0,approved:0,changesRequested:0,missingSource:0,staleReview:0});
  assert.deepEqual([s.canonicalEntries,s.workingDrafts],[0,0]);
  // P2.4 closeout (A4): source readiness is reported as four separate facts; nothing is eligible before a human acts
  assert.deepEqual([s.sources.registeredSources,s.sources.categoryCompatibleSources,s.sources.humanAcceptedSources,s.sources.canonicalTheoryEligibleSources],[5,1,0,0]);
  assert.deepEqual(s.sources.eligibleSourceIds,[]);
  const {semantics:_b,...blocked}=s.blocked;
  assert.deepEqual(blocked,{unitsNotYetInAuthoring:122,unitsInAuthoring:0,canonicalApplyImpossibleForAllUnits:true,inAuthoringBySources:0,inAuthoringByAuthoring:0,inAuthoringByChemistryReview:0,inAuthoringByDidacticReview:0},'0 in-authoring source blockers only because 122 units have not entered authoring');
  const keys=(v)=>v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>[k,...keys(x)]):[];
  assert.ok(!keys(s).some(k=>/priority|score|rank/i.test(k)),'no priority score field');
  // P2.6 changed the value (11.688 → 12.189): the P2.6 model conversions moved the model-based component; the theory
  // authoring infrastructure still contributes nothing — the theory components are unchanged (0 structured units).
  assert.equal(json('reports/project-progress.json').learningProductProgress.percent,12.189,'infrastructure does not move learning-product progress');
});

// ------------------------------------------------------------------ option sets

test('option sets: human-authored options only; target must be present; the shared dual review governs the draft',()=>{
  const q=json('review-packets/option-set-authoring/queue.json');
  assert.deepEqual([q.counts.activities,q.counts.fields],[23,32]);
  const a=q.activities[0], f={activityId:a.activityId,field:a.fields[0].field,canonicalTarget:a.fields[0].canonicalTarget};
  const empty={schema:'kimyolab.option-set-draft.v1',activityId:f.activityId,field:f.field,options:[],sourceRefs:[],authoredBy:null,status:'draft',reviews:[]};
  assert.deepEqual(validateOptionSetDraft(empty,f).sort(),['AUTHOR_MISSING','OPTIONS_TOO_FEW','SOURCE_MISSING','TARGET_NOT_IN_OPTIONS'].sort(),'nothing is generated: an empty draft stays empty and invalid');
  const draft={...empty,options:[{value:f.canonicalTarget,label:'Fixture yorlig‘i'},{value:'fixture-other',label:'Fixture boshqa',rationale:'fixture rationale'}],sourceRefs:[FIXTURE_SOURCE],authoredBy:'fixture.author',status:'ready-for-review'};
  assert.deepEqual(validateOptionSetDraft(draft,f),[]);
  assert.deepEqual(validateOptionSetDraft({...draft,options:[draft.options[0],{value:'x',label:'y'}]},f),['RATIONALE_MISSING']);
  assert.deepEqual(validateOptionSetDraft({...draft,authoredBy:'copilot'},f),['AUTOMATION_AUTHOR']);
  const h=optionSetGovernance(draft).hash;
  const r=(id,role)=>({reviewerId:id,reviewerRole:role,decision:'approved',reviewedAt:AT,reviewedHash:h});
  assert.equal(optionSetGovernance({...draft,reviews:[r(CHEM,'chemistry')]}).state,'REVIEW_PENDING');
  assert.equal(optionSetGovernance({...draft,reviews:[r(CHEM,'chemistry'),r(DID,'didactic')]}).state,'APPROVED');
  assert.equal(optionSetGovernance({...draft,options:[...draft.options,{value:'z',label:'z',rationale:'r'}],reviews:[r(CHEM,'chemistry'),r(DID,'didactic')]}).state,'STALE_REVIEW');
  assert.ok(optionSetGovernance({...draft,reviews:[r('fixture.author','chemistry')]}).issues.includes('SELF_REVIEW'));
});

// ------------------------------------------------------------------ workbench: same code, nothing prefilled, offline

test('workbench runs the governed domain code itself: hashes and states are identical in the page and in the apply',()=>{
  const code=bundleBrowserModules(WORKBENCH_DOMAIN_MODULES,'KL_GOV');
  const ctx={TextEncoder}; ctx.globalThis=ctx; vm.runInNewContext(code,ctx);
  const G=ctx.KL_GOV;
  const e=approveAll(structuredFixture());
  for(const {block} of contentBlocks(e)) assert.equal(G.blockContentHash(block),blockContentHash(block));
  assert.equal(G.theoryReviewState(e),'APPROVED');
  assert.deepEqual({...G.entryHashes(e)},entryHashes(e));
  assert.equal(G.sourceEntryHash(intake()),sourceEntryHash(intake()));
  assert.equal(G.isAutomationIdentity('claude'),true);
  assert.throws(()=>bundleBrowserModules([path.join(root,'scripts/lib/content-operations.ts')],'X'),/BROWSER_BUNDLE_NODE_DEPENDENCY/,'node code cannot be embedded');
});

test('workbench page: three governed tabs, offline, text-only, no prefilled content, identity or decision',()=>{
  const html=fs.readFileSync(path.join(root,'review-packets/reviewer-workspace.html'),'utf8');
  for(const tab of ['theory','sources','optionsets']) assert.match(html,new RegExp(`role="tab" id="tabbtn-${tab}" aria-controls="tab-${tab}"`));
  assert.match(html,/Content-Security-Policy[^>]+connect-src 'none'/);
  assert.match(html,/<input id="ctAuthor" autocomplete="off">/,'author identity starts empty');
  assert.doesNotMatch(html,/id="ctAuthor"[^>]*value=/);
  const client=fs.readFileSync(path.join(root,'scripts/lib/content-workbench-client.ts'),'utf8');
  assert.doesNotMatch(client,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|eval\(/,'text only, no network');
  const m=buildContentWorkbenchModel(root);
  assert.equal(m.packets.length,122);
  assert.ok(m.packets.every(p=>p.slots.explanation.text===null&&p.slots.explanation.authoredBy===null&&p.slots.explanation.reviews.length===0),'no content, author or review is prefilled');
  assert.equal(m.optionFields.length,32);
  const report=json('reports/reviewer-workspace.json');
  assert.deepEqual([report.contentWorkbench.prefilledContent,report.contentWorkbench.prefilledIdentity,report.contentWorkbench.repositoryWrites],[false,false,false]);
});

test('authoring code stays out of the learner runtime and every learner build',()=>{
  const learnerJs=fs.readdirSync(path.join(root,'public/app-preview'),{recursive:true}).map(String);
  assert.ok(!learnerJs.some(f=>f.split(/[\\/]/)[0]==='authoring'),'src/authoring is not a learner source root');
  for(const name of ['source-intake','authoring-packet','option-set-draft','content-workbench','content-operations','browser-module-bundle']) assert.ok(!learnerJs.some(f=>f.includes(name)),`${name} is not in the learner bundle`);
  for(const dir of ['public','dist-rc']){
    const files=fs.readdirSync(path.join(root,dir),{recursive:true}).map(String);
    assert.ok(!files.some(f=>/source-intake|theory-authoring|option-set-authoring|reviewer-workspace|authoring-drafts/.test(f)),dir);
  }
});

test('canonical applies are refused in CI / agent environments (a person runs them)',()=>{
  const t=sandbox();
  const file=path.join(t,'p.json'); fs.writeFileSync(file,JSON.stringify(packetOf(approveAll(structuredFixture()))));
  for(const cmd of ['theory:apply','source:apply']){
    const r=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','scripts/content-operations.ts',cmd,file],{cwd:root,encoding:'utf8',env:{...process.env,CI:'true'}});
    assert.equal(r.status,1,cmd); assert.match(r.stderr,/REFUSED_IN_AUTOMATION/,cmd);
  }
  const check=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','scripts/content-operations.ts','theory:check',file],{cwd:root,encoding:'utf8',env:{...process.env,CI:'true'}});
  // the dry check (no write) runs anywhere; against the repository registry this packet's PROPOSED source is the blocker
  assert.equal(check.status,1); assert.match(check.stdout,/SOURCE_NOT_HUMAN_ACCEPTED:summary:src\.curriculum\.9\.06/); assert.doesNotMatch(check.stdout,/REFUSED_IN_AUTOMATION/);
});
