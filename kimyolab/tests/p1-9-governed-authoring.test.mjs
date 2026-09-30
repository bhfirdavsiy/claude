// P1.9 — governed authoring and release decisions. Three independent states: a REVIEW decision (human), the
// AUTHORING state (derived tasks; content changes only through a person's explicit apply) and a RELEASE decision
// (human, hash-pinned). Round trips run on fixture copies; production registers stay empty and nothing is fabricated.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildWorkbenchModel,validateDecisionFile,importDecisionFile,DECISIONS_SCHEMA} from '../scripts/lib/review-workbench.ts';
import {deriveAuthoringTasks,draftFor,previewDraft,applyDraft,safeContentPath,authoringStatus,ALLOWED_FILES} from '../scripts/lib/authoring.ts';
import {releaseEntries,validateReleaseDecisions} from '../scripts/lib/release.ts';
import {GOVERNANCE_REPORTS,releaseDecisionStatus,humanActionQueue,goldenSliceGraph} from '../scripts/lib/governance-reports.ts';
import {buildKbReports} from '../scripts/lib/chemistry-kb.ts';
import {authoringTaskId,deriveTaskStatus,dedupeTasks} from '../src/domain/governance/authoring-task.ts';
import {releaseEligibility,releaseStateOf} from '../src/domain/governance/release-decision.ts';
import {parseSourceRegistry,provenanceOf,ACCEPTABLE} from '../src/domain/governance/source-policy.ts';
import {computeReviewHash} from '../src/runtime/governance/approvals.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel,base=root)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
const write=(base,rel,v)=>fs.writeFileSync(path.join(base,rel),JSON.stringify(v,null,2));
const sandbox=()=>{ const t=fs.mkdtempSync(path.join(os.tmpdir(),'kl-author-')); for(const d of ['content-src','reports','review-packets']) fs.cpSync(path.join(root,d),path.join(t,d),{recursive:true}); return t; };
const digest=(base,files)=>createHash('sha256').update(files.map(f=>fs.readFileSync(path.join(base,f),'utf8')).join('\n')).digest('hex');
const T1='2026-09-30T10:00:00.000Z', T2='2026-09-30T11:00:00.000Z', T3='2026-09-30T12:00:00.000Z';
const env=(...decisions)=>({schema:DECISIONS_SCHEMA,exportedAt:T1,decisions});
const chem=(m,id,over={})=>({surface:'chemistry',assertionId:id,assertionHash:m.chemistry.find(a=>a.id===id).currentHash,decision:'approve',reviewerId:'dilnoza.karimova',reviewerRole:'chemistry',reviewedAt:T1,...over});
const REGISTERS=['content-src/chemistry-reviews.json','content-src/chemistry-candidate-reviews.json','content-src/assessment-reviews.json','content-src/pilot-signoffs.json','content-src/release-decisions.json'];

// ------------------------------------------------------------------ the three states stay independent

test('AuthoringTask model: deterministic id per (surface,target,action,basis); no duplicates; status derived from facts',()=>{
  const id=authoringTaskId('chemistry','hydrolysis:NaCl','correct','a'.repeat(64));
  assert.equal(id,authoringTaskId('chemistry','hydrolysis:NaCl','correct','a'.repeat(64)));
  assert.notEqual(id,authoringTaskId('chemistry','hydrolysis:NaCl','correct','b'.repeat(64)),'a new basis is a new task');
  const t={id,sourceDecisionId:'x',surface:'chemistry',targetId:'hydrolysis:NaCl',action:'correct',status:'OPEN',basisHash:'a'.repeat(64),currentHash:'a'.repeat(64),affectedFiles:[],affectedActivities:[],reviewerDecision:'change_required',priority:'B',context:{}};
  assert.equal(dedupeTasks([t,{...t,sourceDecisionId:'y'}]).length,1);
  const s=(o)=>deriveTaskStatus({basisHash:'h',currentHash:'h',supersededOnBasis:false,decisionOnCurrent:null,draftExists:false,...o});
  assert.deepEqual([s({}),s({draftExists:true}),s({currentHash:'h2'}),s({currentHash:'h2',decisionOnCurrent:'closes'}),s({currentHash:'h2',decisionOnCurrent:'reopens'}),s({supersededOnBasis:true})],
    ['OPEN','IN_PROGRESS','READY_FOR_REVIEW','CLOSED','SUPERSEDED','SUPERSEDED']);
  for(const task of deriveAuthoringTasks(root)) for(const k of ['id','sourceDecisionId','surface','targetId','action','status','basisHash','affectedFiles','affectedActivities']) assert.ok(k in task,k);
});

test('CHANGE_REQUIRED → task → draft → preview (no change) → human apply → hash changes → old reviews STALE → new review closes it',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const id='hydrolysis:NaCl';
  // an approval, then a second reviewer sends it back
  // (two reviewers, two decision files — one file may not say two things about one assertion)
  assert.deepEqual(importDecisionFile(t,env(chem(m,id))).issues,[]);
  assert.deepEqual(importDecisionFile(t,env(chem(m,id,{reviewerId:'aziz.rahimov',reviewedAt:T2,decision:'change_required',comment:'Tushuntirish maktab darajasida aniqroq bo‘lsin.'}))).issues,[]);
  const task=deriveAuthoringTasks(t).find(x=>x.targetId===id&&x.action==='correct');
  assert.ok(task); assert.equal(task.status,'OPEN'); assert.match(task.reviewerComment,/aniqroq/);
  assert.equal(deriveAuthoringTasks(t).filter(x=>x.targetId===id&&x.action==='correct').length,1,'one decision → one task');
  const before=digest(t,['content-src/chemistry/hydrolysis.json']);
  const draft=draftFor(t,task);
  assert.deepEqual(draft.set,{medium:null,explanation:null},'placeholders only — tooling picks no chemistry value');
  assert.equal(draft.status,'DRAFT'); assert.equal(draft.canonical,false);
  assert.ok(previewDraft(t,draft).issues.includes('DRAFT_INCOMPLETE:medium'));
  const filled={...draft,author:'nodira.author',set:{explanation:'NaCl kuchli kislota va kuchli asosdan hosil bo‘lgan tuz: gidrolizga uchramaydi, eritma neytral.'}};
  const p=previewDraft(t,filled);
  assert.deepEqual(p.issues,[]); assert.equal(p.patch.changes[0].field,'explanation');
  assert.equal(digest(t,['content-src/chemistry/hydrolysis.json']),before,'preview changes nothing');
  const out=applyDraft(t,filled);
  assert.equal(out.applied,true); assert.deepEqual(out.changes,['explanation']);
  const after=buildWorkbenchModel(t).chemistry.find(a=>a.id===id);
  assert.notEqual(after.currentHash,m.chemistry.find(a=>a.id===id).currentHash,'hash changed');
  assert.equal(after.reviewStatus,'stale','the approval AND the change request are about the old text');
  assert.equal(deriveAuthoringTasks(t).find(x=>x.id===task.id).status,'READY_FOR_REVIEW','a new human review is required');
  assert.ok(validateDecisionFile(t,env(chem(m,id,{reviewedAt:T3}))).categories.stale.length,'the old hash cannot be approved again');
  assert.ok(previewDraft(t,filled).issues.some(i=>i.startsWith('DRAFT_TASK_NOT_OPEN')),'a draft cannot be applied twice');
  // a new review of the new text closes the task
  const m2=buildWorkbenchModel(t);
  assert.deepEqual(importDecisionFile(t,env(chem(m2,id,{reviewedAt:T3}))).issues,[]);
  assert.equal(deriveAuthoringTasks(t).find(x=>x.id===task.id).status,'CLOSED');
  assert.equal(buildWorkbenchModel(t).chemistry.find(a=>a.id===id).reviewStatus,'approved');
});

test('MAPPING_REVIEW_REQUIRED → map-concept tasks with context and a placeholder; no concept is chosen and the item is unchanged',()=>{
  const tasks=deriveAuthoringTasks(root).filter(x=>x.action==='map-concept');
  assert.deepEqual(tasks.map(x=>x.targetId).sort(),['q.9.15.01','q.9.15.02','q.9.15.04']);
  for(const x of tasks){
    for(const k of ['questionStem','currentConcepts','currentOutcomes']) assert.ok(k in x.context,k);
    assert.match(String(x.context.recommendedAction),/PLACEHOLDER/);
    assert.equal(x.reviewerDecision,null,'no reviewer decision yet');
    const d=draftFor(root,x);
    assert.deepEqual(d.set,{conceptIds:null});
    assert.deepEqual(d.current.conceptIds,read('content-src/assessment-items.json').items.find(i=>i.id===x.targetId).conceptIds);
  }
  // a didactic reviewer confirming the mapping as is closes the task (fixture)
  const t=sandbox(); const m=buildWorkbenchModel(t); const a=m.assessment.find(i=>i.itemId==='q.9.15.01');
  assert.deepEqual(importDecisionFile(t,env({surface:'assessment',itemId:a.itemId,role:'didactic',decision:'approved',reviewerId:'aziz.rahimov',reviewerRole:'didactic',reviewedAt:T1,itemHash:a.itemHash,itemVersion:a.itemVersion,evidence:a.evidence,outcomeDecision:'confirm'})).issues,[]);
  assert.equal(deriveAuthoringTasks(t).find(x=>x.action==='map-concept'&&x.targetId==='q.9.15.01').status,'CLOSED');
});

test('candidate accept_for_authoring → DRAFT with PROPOSED fields; never canonical, never applied automatically',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const kinds=['reaction-candidate','no-reaction-candidate'].map(k=>m.candidates.find(c=>c.candidate?.kind===k));
  assert.deepEqual(importDecisionFile(t,env(...kinds.map(c=>({surface:'chemistry-candidate',candidateId:c.candidateId,candidateHash:c.candidateHash,decision:'accept_for_authoring',reviewerId:'dilnoza.karimova',reviewerRole:'chemistry',reviewedAt:T1})))).issues,[]);
  const before=digest(t,['content-src/chemistry/reactions.json']);
  for(const c of kinds){
    const task=deriveAuthoringTasks(t).find(x=>x.action==='author-candidate'&&x.targetId===c.candidateId);
    assert.equal(task.status,'OPEN');
    const d=draftFor(t,task);
    assert.equal(d.canonical,false); assert.match(d.context.notice,/NOT CANONICAL/);
    for(const f of ['proposedProducts','proposedConditions','proposedObservation','sourceRefs']) assert.equal(d.context[f].status,'PROPOSED',f);
    assert.equal(d.context.reviewRequired,true);
    const out=applyDraft(t,{...d,author:'nodira.author'});
    assert.equal(out.applied,false); assert.match(out.issues.join(),/CANDIDATE_DRAFT_NOT_APPLICABLE/);
  }
  assert.equal(digest(t,['content-src/chemistry/reactions.json']),before,'no reaction / no-reaction record added');
  assert.deepEqual(buildKbReports(t).inventory.counts.explicitNoReactionRecords,0);
});

// ------------------------------------------------------------------ source provenance (never weakened)

test('source policy: registered categories; INTERNAL_PROPOSAL never counts; APPROVED_WITHOUT_SOURCE still FAILs',()=>{
  const {registry,issues}=parseSourceRegistry(read('content-src/source-registry.json'));
  assert.deepEqual(issues,[]);
  assert.equal(registry.byId.get('src.curriculum.9.06').category,'CURRICULUM');
  assert.equal(registry.byId.get('src.beta1.migration').category,'INTERNAL_PROPOSAL');
  assert.ok(!ACCEPTABLE.chemistry.includes('INTERNAL_PROPOSAL')&&!ACCEPTABLE['display-translation'].includes('INTERNAL_PROPOSAL'));
  assert.ok(!ACCEPTABLE.chemistry.includes('LOCALIZATION_GLOSSARY'),'a glossary is not chemistry truth');
  assert.equal(provenanceOf(['src.curriculum.9.06'],registry,'chemistry').acceptable,true);
  assert.equal(provenanceOf(['src.beta1.migration'],registry,'chemistry').acceptable,false);
  const t=sandbox(); const m=buildWorkbenchModel(t);
  // approvals are imported (a reviewer said yes) — but the gate refuses to count them
  assert.deepEqual(importDecisionFile(t,env(chem(m,'element-name:H'),chem(m,'reaction:rxn.agno3-nacl'),chem(m,'hydrolysis:AlCl3'))).issues,[]);
  const gate=buildKbReports(t).gate;
  assert.equal(gate.status,'FAIL');
  assert.ok(gate.fail.includes('APPROVED_WITHOUT_SOURCE:element-name:H'),'unchanged from P1.7');
  assert.ok(gate.fail.includes('APPROVED_WITHOUT_ACCEPTABLE_SOURCE:reaction:rxn.agno3-nacl'));
  assert.ok(!gate.fail.some(f=>f.includes('hydrolysis:AlCl3')),'curriculum-backed approval counts');
  // an unregistered source is invalid content
  const h=read('content-src/chemistry/hydrolysis.json',t); h.records[0].sourceRefs=['src.made-up']; write(t,'content-src/chemistry/hydrolysis.json',h);
  assert.ok(buildKbReports(t).gate.fail.some(f=>f.startsWith('SOURCE_UNREGISTERED:')));
});

test('names: display translation with its own provenance; add-source through a human-applied draft makes the name approvable',()=>{
  const prov=read('content-src/locales/uz-latn/name-provenance.json');
  assert.equal(prov.entries.length,30);
  assert.ok(prov.entries.every(e=>['nameKey','locale','displayName','sourceRef','reviewStatus'].every(k=>k in e)&&e.sourceRef===null&&e.reviewStatus==='pending'));
  const t=sandbox();
  // a person registers a glossary (in a reviewed PR) — then the author cites it through the add-source task
  const reg=read('content-src/source-registry.json',t); reg.sources.push({id:'src.glossary.uz-chem',category:'LOCALIZATION_GLOSSARY',title:'Fixture glossary'}); write(t,'content-src/source-registry.json',reg);
  const task=deriveAuthoringTasks(t).find(x=>x.action==='add-source'&&x.targetId==='element-name:H');
  const d=draftFor(t,task);
  assert.equal(d.file,'content-src/locales/uz-latn/name-provenance.json');
  assert.ok(previewDraft(t,{...d,author:'nodira.author',set:{sourceRef:'src.not-registered'}}).issues.includes('DRAFT_SOURCE_UNREGISTERED:src.not-registered'));
  assert.equal(applyDraft(t,{...d,author:'nodira.author',set:{sourceRef:'src.glossary.uz-chem'}}).applied,true);
  assert.ok(!deriveAuthoringTasks(t).some(x=>x.action==='add-source'&&x.targetId==='element-name:H'),'provenance now acceptable');
  const m=buildWorkbenchModel(t);
  assert.deepEqual(importDecisionFile(t,env(chem(m,'element-name:H'))).issues,[]);
  assert.ok(!buildKbReports(t).gate.fail.some(f=>f.includes('element-name:H')),'the approval counts now');
  // the catalog and the provenance must agree
  const cat=read('content-src/locales/uz-latn/chemistry-elements.json',t); cat.names.He='Gelliy'; write(t,'content-src/locales/uz-latn/chemistry-elements.json',cat);
  assert.ok(buildKbReports(t).gate.fail.includes('NAME_PROVENANCE_MISMATCH:element-name:He'));
});

// ------------------------------------------------------------------ release decisions

const makeEligible=(t,activityId)=>{
  const acts=read('content-src/practice-activities.json',t);
  const a=acts.find(x=>x.id===activityId);
  const hash=computeReviewHash(a);
  const rec=(role)=>({status:'approved',reviewerRole:role,reviewerId:`${role}.person`,reviewedAt:T1,reviewedVersion:a.version,reviewedHash:hash,notes:'fixture'});
  a.approvals={technical:rec('technical'),didactic:rec('didactic'),accessibility:rec('accessibility'),chemistry:a.approvals.chemistry==='not_applicable'?'not_applicable':rec('chemistry')};
  write(t,'content-src/practice-activities.json',acts);
};
const release=(e,over={})=>({surface:'release',activityId:e.activityId,basisHash:e.basisHash,decision:'RELEASE',reviewerId:'malika.content',role:'content-owner',decidedAt:T1,...over});

test('release: 27 pending activities in the packet; machine eligibility is not a release; nothing is eligible today',()=>{
  const entries=releaseEntries(root);
  const pending=entries.filter(e=>e.runtime==='PENDING');
  assert.equal(pending.length,27);
  const packet=read('review-packets/release-decisions/packet.json');
  assert.equal(packet.count,27);
  for(const a of packet.activities) for(const k of ['activityId','learningUnits','runtimeReadiness','contentReviewStatus','accessibility','route','engine','dependencies','currentLifecycle','basisHash','eligibility','releaseRecommendation']) assert.ok(k in a,`${a.activityId}:${k}`);
  assert.ok(packet.activities.every(a=>a.releaseRecommendation.decision===null),'tooling recommends nothing');
  assert.ok(entries.every(e=>e.eligibility.status==='NOT_ELIGIBLE'&&e.releaseState==='DECISION_MISSING'));
  assert.deepEqual(releaseEligibility({routeOk:true,runtime:'PENDING',runtimeReasons:['ACTIVITY_NOT_RELEASED'],rendererRequired:false,rendererAvailable:true,content:'APPROVED',accessibilityApproved:true,staleChemistryAssertions:[]}),{status:'ELIGIBLE',reasons:[]});
  assert.equal(releaseEligibility({routeOk:true,runtime:'READY',runtimeReasons:[],rendererRequired:true,rendererAvailable:false,content:'APPROVED',accessibilityApproved:false,staleChemistryAssertions:['x']}).reasons.join(),'RENDERER_UNAVAILABLE,ACCESSIBILITY_REVIEW_INCOMPLETE,CHEMISTRY_ASSERTION_STALE:x');
});

test('release round trip: eligible + no decision → still pending; human RELEASE on the basis → RELEASED; content change → STALE',()=>{
  const t=sandbox();
  const id=releaseEntries(t).find(e=>e.runtime==='PENDING'&&e.route.ok&&e.eligibility.reasons.every(r=>r.startsWith('CONTENT_')||r==='ACCESSIBILITY_REVIEW_INCOMPLETE')).activityId;
  // a NOT_ELIGIBLE activity cannot be released
  const notYet=releaseEntries(t).find(e=>e.activityId===id);
  assert.ok(validateReleaseDecisions(t,[release(notYet)].map(({surface,...r})=>r)).some(i=>i.startsWith('RELEASE_NOT_ELIGIBLE')));
  makeEligible(t,id);
  const e=releaseEntries(t).find(x=>x.activityId===id);
  assert.equal(e.eligibility.status,'ELIGIBLE'); assert.equal(e.releaseState,'DECISION_MISSING','machine eligibility alone releases nothing');
  const packBefore=JSON.stringify(compileReadiness(loadSources(t)).pack.activities.find(a=>a.activityId===id));
  // identity, role, comment, extra fields
  const cats=(over)=>validateDecisionFile(t,env(release(e,over))).categories;
  assert.ok(cats({reviewerId:'claude'}).invalidIdentity.length);
  assert.ok(cats({role:'chemistry'}).invalidIdentity.length);
  assert.ok(cats({decision:'KEEP_PENDING'}).missingComment.length);
  assert.ok(cats({lifecycleStatus:'ready'}).tampering.length);
  assert.deepEqual(importDecisionFile(t,env(release(e))).imported.release,1);
  assert.equal(releaseEntries(t).find(x=>x.activityId===id).releaseState,'RELEASED');
  assert.equal(JSON.stringify(compileReadiness(loadSources(t)).pack.activities.find(a=>a.activityId===id)),packBefore,'the decision is recorded; it does not rewrite lifecycle or runtime by itself');
  // content changes → the release decision is stale and a re-release on the old basis is refused
  const acts=read('content-src/practice-activities.json',t); acts.find(x=>x.id===id).goal+=' (edited)'; write(t,'content-src/practice-activities.json',acts);
  assert.equal(releaseEntries(t).find(x=>x.activityId===id).releaseState,'STALE');
  assert.ok(validateDecisionFile(t,env(release(e,{decidedAt:T2}))).categories.stale.length);
  assert.equal(releaseStateOf('a','b'.repeat(64),[]).state,'DECISION_MISSING');
});

test('pilot: release decision and pilot sign-off are separate gates; neither is implied by the other',()=>{
  const s=read(GOVERNANCE_REPORTS.release);
  assert.equal(s.pilot.length,4);
  for(const p of s.pilot) for(const k of ['technicalReady','contentApproved','releaseDecision','pilotSignoff']) assert.ok(k in p,k);
  const g=read(GOVERNANCE_REPORTS.goldenGraph);
  const upstream=(id)=>g.edges.filter(e=>e.to===id).flatMap(e=>[e.from,...upstream(e.from)]);
  assert.ok(upstream('pilot-ready').includes('pilot-owner-signoff'));
  assert.ok(!upstream('pilot-ready').includes('release-decision'),'a release decision does not stand in for the pilot sign-off');
  assert.ok(!upstream('release-decision').includes('pilot-owner-signoff'));
  assert.ok(validateDecisionFile(root,env({surface:'release',activityId:'practice.experiment.9.10',basisHash:'0'.repeat(64),decision:'RELEASE',reviewerId:'pilot.owner',role:'pilot-owner',decidedAt:T1})).categories.invalidIdentity.length,'a pilot owner is not a content owner');
});

// ------------------------------------------------------------------ security

test('authoring security: traversal, unknown / code / register / workflow paths, forbidden fields, extra fields, automation',()=>{
  for(const bad of ['../package.json','content-src/../package.json','/etc/passwd','C:/x.json','content-src\\chemistry\\reactions.json','package.json','.github/workflows/verify.yml','scripts/review.ts','src/domain/assessment/governance.ts','content-src/pilot-signoffs.json','content-src/chemistry-reviews.json','content-src/release-decisions.json','content-src/source-registry.json','content-src/chemistry/new.json','content-src/./chemistry/reactions.json'])
    assert.equal(safeContentPath(root,bad).ok,false,bad);
  assert.ok(ALLOWED_FILES.every(f=>f.startsWith('content-src/')&&!/reviews|signoffs|release-decisions|source-registry/.test(f)));
  const t=sandbox(); const m=buildWorkbenchModel(t);
  assert.deepEqual(importDecisionFile(t,env(chem(m,'hydrolysis:NaCl',{decision:'change_required',comment:'Aniqroq.'}))).issues,[]);
  const task=deriveAuthoringTasks(t).find(x=>x.targetId==='hydrolysis:NaCl'&&x.action==='correct');
  const d={...draftFor(t,task),author:'nodira.author',set:{explanation:'x'}};
  const issues=(over)=>previewDraft(t,{...d,...over}).issues;
  assert.ok(issues({file:'../package.json'}).some(i=>i.startsWith('AUTHORING_PATH_')));
  assert.ok(issues({file:'content-src/chemistry/reactions.json'}).some(i=>i.startsWith('DRAFT_FILE_MISMATCH')),'a draft cannot redirect to another file');
  assert.ok(issues({select:{path:['records'],match:{salt:'AlCl3'}}}).includes('DRAFT_SELECT_MISMATCH'),'nor to another record');
  assert.ok(issues({set:{reviewStatus:'approved'}}).includes('DRAFT_FIELD_FORBIDDEN:reviewStatus'));
  assert.ok(issues({set:{salt:'KCl'}}).includes('DRAFT_FIELD_NOT_EDITABLE:salt'));
  assert.ok(issues({approvedBy:'x'}).includes('DRAFT_FIELD_NOT_ALLOWED:approvedBy'));
  assert.ok(issues({author:'Codex'}).includes('DRAFT_AUTHOR_NOT_HUMAN'));
  assert.ok(issues({taskId:'task.unknown'}).some(i=>i.startsWith('DRAFT_TASK_UNKNOWN')));
  // the apply command refuses in CI / agent environments; preview still works
  const file=path.join(t,'draft.json'); fs.writeFileSync(file,JSON.stringify(d));
  const apply=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,'scripts/authoring.ts'),'apply',file],{env:{...process.env,CI:'true'},encoding:'utf8'});
  assert.equal(apply.status,1); assert.match(apply.stderr,/AUTHORING_APPLY_REFUSED_IN_AUTOMATION/);
  // guard: the authoring and report tooling never writes a register; release.ts is the release register’s only writer
  for(const f of ['scripts/lib/authoring.ts','scripts/authoring.ts','scripts/lib/governance-reports.ts','scripts/lib/release.ts']) assert.deepEqual(checkSource(f,fs.readFileSync(path.join(root,f),'utf8')),[],f);
  assert.ok(checkSource('scripts/x.ts',"import fs from 'node:fs';fs.writeFileSync('content-src/release-decisions.json','{}');").some(v=>v.rule==='HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
});

// ------------------------------------------------------------------ reports + production state

test('reports are deterministic; the action queue shows every blocker and one next human action per item',()=>{
  const m=buildWorkbenchModel(root); const tasks=deriveAuthoringTasks(root,m); const entries=releaseEntries(root);
  assert.deepEqual(read(GOVERNANCE_REPORTS.authoring),authoringStatus(tasks),'run npm run review:status');
  assert.deepEqual(read(GOVERNANCE_REPORTS.release),releaseDecisionStatus(entries,root));
  assert.deepEqual(read(GOVERNANCE_REPORTS.actions),humanActionQueue(m,tasks,entries,root));
  assert.deepEqual(read(GOVERNANCE_REPORTS.goldenGraph),goldenSliceGraph(m,tasks,entries,root));
  const a=read(GOVERNANCE_REPORTS.authoring);
  assert.deepEqual([a.totals.tasks,a.byAction['add-source'].OPEN,a.byAction['map-concept'].OPEN],[130,127,3]);
  assert.equal(a.canonicalContentMutated,false);
  const q=read(GOVERNANCE_REPORTS.actions);
  assert.ok(q.items.every(i=>typeof i.nextHumanAction==='string'&&i.nextHumanAction.length>10&&Array.isArray(i.blockedBy)&&i.role));
  for(const k of ['review-chemistry','review-assessment','fix-mapping','add-source','triage-candidates','decide-release','sign-off-pilot']) assert.ok(q.counts[k]>0,k);
  assert.ok(q.items.find(i=>i.kind==='review-chemistry'&&i.priority==='A').blockedBy[0].startsWith('SOURCE_NOT_ACCEPTABLE'),'the provenance blocker is not hidden');
  assert.ok(q.items.filter(i=>i.kind==='decide-release').every(i=>i.blockedBy.length>0),'NOT_ELIGIBLE reasons are shown');
  const g=read(GOVERNANCE_REPORTS.goldenGraph);
  const ids=new Set(g.nodes.map(n=>n.id));
  assert.ok(g.edges.every(e=>ids.has(e.from)&&ids.has(e.to)));
  const seen=new Set(),visiting=new Set();const dfs=(n)=>{ assert.ok(!visiting.has(n),'acyclic'); if(seen.has(n)) return; visiting.add(n); for(const e of g.edges.filter(x=>x.from===n)) dfs(e.to); visiting.delete(n); seen.add(n); };
  for(const n of ids) dfs(n);
  assert.deepEqual(g.nodes.find(n=>n.id==='practice-technical').status,'PASS');
  assert.ok(g.pendingHuman.includes('pilot-owner-signoff')&&g.pendingHuman.includes('release-decision')&&g.pendingHuman.includes('electrolysis-chemistry-review'));
});

test('production state: 0 imported decisions, 0 releases, no canonical electrolysis addition, global strict OFF, workbench tabs',()=>{
  for(const r of REGISTERS) assert.deepEqual(read(r).records,[],r);
  const s=read(GOVERNANCE_REPORTS.release);
  assert.deepEqual([s.totals.released,s.totals.eligible,s.totals.decisionMissing,s.pendingActivities.count],[0,0,146,27]);
  assert.equal(s.globalStrictEnforcement,false);
  assert.equal(read('reports/readiness-enforcement-impact.json').globalStrictEnforcement.enabled,false);
  assert.equal(read('content-src/chemistry/electrolysis.json').records.length,1);
  const tpl=read('review-packets/electrolysis-expansion/record.template.json');
  assert.equal(tpl.canonical,false); assert.ok(Object.values(tpl.record).filter(v=>v===null).length>=3);
  for(const k of ['electrolyte','phase','electrode','cathode','anode','sourceRefs','reviewStatus']) assert.ok(k in tpl.record,k);
  const html=fs.readFileSync(path.join(root,'review-packets/reviewer-workspace.html'),'utf8');
  for(const tab of ['authoring','release']) assert.match(html,new RegExp(`role="tab" id="tabbtn-${tab}" aria-controls="tab-${tab}"`));
  assert.match(html,/value="content-owner"/);
  const client=fs.readFileSync(path.join(root,'scripts/lib/review-workbench-client.ts'),'utf8');
  assert.match(client,/RELEASE mumkin emas: NOT_ELIGIBLE/); assert.doesNotMatch(client,/innerHTML|fetch\(/);
  const pkg=read('package.json');
  for(const c of ['authoring:draft','authoring:preview','authoring:apply']) assert.ok(pkg.scripts[c],c);
  assert.ok(!Object.values(pkg.scripts).some(v=>/authoring\.ts apply/.test(v)&&/content:validate|verify/.test(v)),'apply is never part of a build');
});
