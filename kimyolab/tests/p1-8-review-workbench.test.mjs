// P1.8 — Human Review Workbench & governed content promotion. One workbench over the existing governance: it shows
// chemistry assertions, candidates, assessment items and pilot sign-offs, exports a hash-pinned decision file, and
// the EXISTING importers remain the only writers. Round trips run on fixture copies — the production registers stay
// empty (0 human decisions), and no approval, sign-off or chemistry fact is created by tooling.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildWorkbenchModel,validateDecisionFile,importDecisionFile,humanReviewStatus,changeQueue,authoringCandidates,goldenSliceDependencies,promotionImpact,mappingFlags,categorize,DECISIONS_SCHEMA,REVIEW_REPORTS,MAPPING_FLAG} from '../scripts/lib/review-workbench.ts';
import {writeWorkspace} from '../scripts/generate-reviewer-workspace.ts';
import {buildKbReports} from '../scripts/lib/chemistry-kb.ts';
import {evaluatePilot} from '../scripts/pilot-status.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {buildMasteryView} from '../src/domain/mastery/view.ts';
import {AUTOMATION_IDENTITY,automationContext} from '../src/domain/assessment/governance.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {RENDERER_CATALOG} from '../src/renderers/catalog.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel,base=root)=>JSON.parse(fs.readFileSync(path.join(base,rel),'utf8'));
const src=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const sandbox=()=>{ const t=fs.mkdtempSync(path.join(os.tmpdir(),'kl-review-')); for(const d of ['content-src','reports','review-packets']) fs.cpSync(path.join(root,d),path.join(t,d),{recursive:true}); return t; };
const digest=(base,dir)=>createHash('sha256').update(fs.readdirSync(path.join(base,dir),{recursive:true}).filter(f=>f.endsWith('.json')).sort().map(f=>`${f}\n${fs.readFileSync(path.join(base,dir,f),'utf8')}`).join('\n')).digest('hex');
const AT='2026-09-30T10:00:00.000Z';
const envelope=(model,...decisions)=>({schema:DECISIONS_SCHEMA,exportedAt:AT,workspaceFingerprint:model.fingerprint,decisions});
const chem=(model,id,over={})=>{ const a=model.chemistry.find(x=>x.id===id); assert.ok(a,id); return {surface:'chemistry',assertionId:a.id,assertionHash:a.currentHash,decision:'approve',reviewerId:'dilnoza.karimova',reviewerRole:'chemistry',reviewedAt:AT,...over}; };
const item=(model,id,role,over={})=>{ const a=model.assessment.find(x=>x.itemId===id); return {surface:'assessment',itemId:a.itemId,role,decision:'approved',reviewerId:role==='chemistry'?'dilnoza.karimova':'aziz.rahimov',reviewerRole:role,reviewedAt:AT,itemHash:a.itemHash,itemVersion:a.itemVersion,evidence:a.evidence,...(role==='didactic'?{outcomeDecision:'confirm'}:{}),...over}; };
const REGISTERS=['content-src/chemistry-reviews.json','content-src/chemistry-candidate-reviews.json','content-src/assessment-reviews.json','content-src/pilot-signoffs.json'];

// ------------------------------------------------------------------ one workbench over existing governance

test('the workbench reuses the existing governance: identity rule, importers as the only writers, no register writes',()=>{
  const model=buildWorkbenchModel(root);
  assert.equal(model.automationIdentityPattern,AUTOMATION_IDENTITY.source,'one automation-identity rule, shared');
  const lib=src('scripts/lib/review-workbench.ts');
  assert.match(lib,/from '\.\.\/chemistry-review\/import\.ts'/); assert.match(lib,/from '\.\.\/assessment-review\/lib\.ts'/);
  for(const f of ['scripts/lib/review-workbench.ts','scripts/review.ts','scripts/generate-reviewer-workspace.ts','scripts/lib/review-workbench-client.ts']) assert.deepEqual(checkSource(f,src(f)),[],`${f}: no register write outside the importers`);
  // the guard knows the new candidate register and refuses any other writer
  assert.ok(checkSource('scripts/x.ts',"import fs from 'node:fs';fs.writeFileSync('content-src/chemistry-candidate-reviews.json','{}');").some(v=>v.rule==='HUMAN_APPROVAL_WRITTEN_BY_TOOLING'));
  // one workbench: the existing reviewer workspace, extended (no second review UI)
  const pages=fs.readdirSync(path.join(root,'review-packets')).filter(f=>f.endsWith('.html'));
  assert.deepEqual(pages,['reviewer-workspace.html']);
  for(const r of REGISTERS) assert.deepEqual(read(r).records,[],`${r}: production register holds no decision — 0 human decisions imported`);
});

test('surfaces: chemistry assertions, candidates, assessment items and pilot sign-off state are all present',()=>{
  const m=buildWorkbenchModel(root);
  const kb=buildKbReports(root);
  assert.equal(m.chemistry.length,kb.assertions.length);
  for(const a of m.chemistry){
    for(const k of ['id','category','claim','currentHash','sourceRefs','affectedActivities','reviewStatus','flags','priority','display']) assert.ok(k in a,`${a.id}:${k}`);
    assert.ok(a.display.length>0&&a.display.every(([l,v])=>typeof l==='string'&&typeof v==='string'),`${a.id}: category rows, not raw JSON`);
    assert.equal(a.canonical,true);
  }
  const byId=(id)=>m.chemistry.find(a=>a.id===id);
  assert.deepEqual(byId('reaction:rxn.agno3-nacl').display.map(([l])=>l),['Tenglama','Reaktantlar','Mahsulotlar','Reaksiya turi','Sharoit','Kuzatuv','Net ionic']);
  assert.deepEqual(byId('hydrolysis:NaCl').display.map(([l])=>l),['Tuz','Muhit','Tushuntirish']);
  assert.deepEqual(byId('indicator:litmus:acidic').display.map(([l])=>l),['Indikator','Muhit','Rang']);
  assert.deepEqual(byId('species-name:species.agno3.name').display.map(([l])=>l),['Formula','nameKey','O‘zbekcha nom']);
  assert.equal(m.assessment.length,5);
  for(const a of m.assessment) for(const k of ['prompt','options','correctOptionId','explanation','concepts','outcomes','difficulty','distractors','itemHash','review','lifecycle']) assert.ok(k in a,`${a.itemId}:${k}`);
  assert.deepEqual(m.pilot.map(p=>p.learningUnitId),read('content-src/learning-pilot.json').learningUnits.map(u=>u.id));
  assert.ok(m.pilot.every(p=>/^[a-f0-9]{64}$/.test(p.basisHash)&&p.canSignOff===false),'no pilot can be signed off while reviews are pending');
});

test('priority queue: A = the six flagged observations, B foundational, C golden slice, D terminology (convenience, not approval)',()=>{
  const m=buildWorkbenchModel(root);
  const ids=(p)=>m.chemistry.filter(a=>a.priority===p).map(a=>a.id).sort();
  assert.deepEqual(ids('A'),['rxn.br2-ki','rxn.cl2-kbr','rxn.h2-combustion','rxn.nacl-h2so4','rxn.naoh-hcl','rxn.znoh2-hcl'].map(r=>`observation:${r}`));
  const B=ids('B');
  for(const id of ['indicator:litmus:acidic','indicator:litmus:basic','indicator:litmus:neutral','hydrolysis:AlCl3','hydrolysis:Na2CO3','hydrolysis:NaCl','hydrolysis:NH4Cl','condition-context:solution-mixing','reaction:rxn.agno3-nacl']) assert.ok(B.includes(id),id);
  assert.ok(B.some(id=>id.startsWith('condition-term:')));
  assert.deepEqual(ids('C'),['electrolysis:CuCl2|aq|inert']);
  assert.ok(ids('D').length===30&&ids('D').every(id=>/^(element|species)-name:/.test(id)));
  assert.ok(m.chemistry.every(a=>a.reviewStatus==='pending'),'the queue orders work; it approves nothing');
});

// ------------------------------------------------------------------ candidates are never canonical

test('candidates carry the NOT CANONICAL badge; a candidate decision triages authoring and never adds chemistry',()=>{
  const m=buildWorkbenchModel(root);
  assert.equal(m.candidates.length,18);
  assert.ok(m.candidates.every(c=>c.badge==='CANDIDATE — NOT PART OF CANONICAL KB'&&c.canonical===false&&/^[a-f0-9]{64}$/.test(c.candidateHash)));
  const report=authoringCandidates(m);
  assert.deepEqual([report.summary.reactionCandidates,report.summary.noReactionCandidates,report.summary.unclassifiable,report.summary.conditionDependent],[3,7,7,1]);
  for(const c of report.candidates) for(const k of ['candidateId','derivation','supportingRule','affectedActivity','requiredReviewerRole','status']) assert.ok(k in c,`${c.candidateId}:${k}`);
  assert.ok(report.candidates.every(c=>!('products' in c)&&!('reactionType' in c)&&!('observation' in c)),'no product / type / observation asserted');
  const t=sandbox();
  const before=digest(t,'content-src/chemistry'), inventory=buildKbReports(t).inventory.counts;
  const c=m.candidates.find(x=>x.candidate?.kind==='reaction-candidate');
  const out=importDecisionFile(t,envelope(m,{surface:'chemistry-candidate',candidateId:c.candidateId,candidateHash:c.candidateHash,decision:'accept_for_authoring',reviewerId:'dilnoza.karimova',reviewerRole:'chemistry',reviewedAt:AT}));
  assert.deepEqual(out.issues,[]); assert.equal(out.imported.candidates,1);
  assert.equal(digest(t,'content-src/chemistry'),before,'no reaction / no-reaction record was added');
  assert.deepEqual(buildKbReports(t).inventory.counts,inventory);
  const after=buildWorkbenchModel(t);
  assert.equal(after.candidates.find(x=>x.candidateId===c.candidateId).reviewStatus,'accept_for_authoring');
  assert.equal(authoringCandidates(after).summary.addedToKnowledgeBase,0);
  assert.equal(read(REVIEW_REPORTS.candidates).summary.addedToKnowledgeBase,0);
});

// ------------------------------------------------------------------ assessment review

test('q.9.15.01 (asks about the cathode, mapped to “Anod”) is flagged MAPPING_REVIEW_REQUIRED; the mapping is not changed',()=>{
  const m=buildWorkbenchModel(root);
  const q1=m.assessment.find(a=>a.itemId==='q.9.15.01');
  assert.ok(q1.flags.some(f=>f.startsWith(MAPPING_FLAG)&&f.includes('katod')),q1.flags.join());
  assert.deepEqual(q1.concepts.map(c=>c.id),read('content-src/assessment-items.json').items.find(i=>i.id==='q.9.15.01').conceptIds,'the agent did not remap it');
  assert.deepEqual(m.assessment.filter(a=>a.flags.length).map(a=>a.itemId),['q.9.15.01','q.9.15.02','q.9.15.04'],'the same pattern (katod/anod names swapped) is surfaced on 02 and 04 for the reviewer');
  assert.deepEqual(m.assessment.map(a=>a.lifecycle),Array(5).fill('REVIEW_PENDING'),'a flag is a hint, not a governance change');
  assert.deepEqual(mappingFlags({prompt:'Anodda nima bo‘ladi?',conceptIds:['c.anod']},[{id:'c.anod',name:'Anod'}]),[],'named and mapped → no flag');
});

test('assessment dual review: two different people on the current hash → APPROVED → MASTERED reachable (fixture only)',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const ids=m.assessment.map(a=>a.itemId);
  // one person approving both roles of one item is refused at validation (the lifecycle would not count it either)
  const same=validateDecisionFile(t,envelope(m,item(m,ids[0],'chemistry'),item(m,ids[0],'didactic',{reviewerId:'Dilnoza.Karimova'})));
  assert.ok(same.categories.conflicting.some(i=>i.startsWith('REVIEW_DUAL_ROLE_SAME_REVIEWER')),JSON.stringify(same.issues));
  const decisions=ids.flatMap(id=>[item(m,id,'chemistry'),item(m,id,'didactic')]);
  const v=validateDecisionFile(t,envelope(m,...decisions));
  assert.deepEqual(v.issues,[]); assert.equal(v.categories.valid.length,10); assert.equal(v.importable,true);
  assert.deepEqual(read('content-src/assessment-reviews.json',t).records,[],'validate writes nothing');
  assert.deepEqual(importDecisionFile(t,envelope(m,...decisions)).imported.assessment,10);
  const status=humanReviewStatus(buildWorkbenchModel(t),t);
  assert.deepEqual([status.assessment.chemistryApproved,status.assessment.didacticApproved,status.assessment.fullyApproved],[5,5,5]);
  const pack=compileReadiness(loadSources(t)).pack;
  assert.equal(pack.units.find(u=>u.learningUnitId==='lu.9.15').assessment.status,'AVAILABLE');
  const unit=read('content-src/learning-units.json',t).find(u=>u.id==='lu.9.15');
  const view=(availability)=>buildMasteryView({learningUnitId:'lu.9.15',conceptIds:unit.conceptIds,mastery:unit.conceptIds.map(c=>({conceptId:c,evidenceIds:['e'],confidence:1,status:'mastered',scoringVersion:'1'})),countedEvidence:[{id:'e',conceptId:unit.conceptIds[0],evidenceClass:'concept-assessment',source:'a',createdAt:AT}],attempts:{practiceCompletedOrAbandoned:3,assessment:1},assessmentAvailability:availability}).band;
  assert.equal(view('AVAILABLE'),'MASTERED','with all human reviews (fixture) MASTERED is reachable');
  assert.notEqual(view(compileReadiness(loadSources(root)).pack.units.find(u=>u.learningUnitId==='lu.9.15').assessment.status),'MASTERED','production: no human review → MASTERED unreachable');
  assert.deepEqual(read('content-src/assessment-reviews.json').records,[],'the fixture decisions never reach the production register');
});

// ------------------------------------------------------------------ chemistry round trip + stale

test('chemistry round trip: PENDING → exported decision → validate → import → APPROVED; content change → STALE → gate FAIL',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const id='hydrolysis:NaCl';
  assert.equal(m.chemistry.find(a=>a.id===id).reviewStatus,'pending');
  const file=envelope(m,chem(m,id));
  const v=validateDecisionFile(t,file);
  assert.deepEqual(v.issues,[]); assert.deepEqual(v.categories.valid,[`chemistry:${id}`]); assert.equal(v.registersChanged,false);
  assert.deepEqual(read('content-src/chemistry-reviews.json',t).records,[],'the preview writes nothing');
  // P1.9: the import result also counts release decisions (a new surface) — none here
  assert.deepEqual(importDecisionFile(t,file).imported,{chemistry:1,candidates:0,assessment:0,release:0});
  assert.equal(buildWorkbenchModel(t).chemistry.find(a=>a.id===id).reviewStatus,'approved');
  assert.equal(buildKbReports(t).gate.status,'PENDING');
  // the content the reviewer approved changes → the approval no longer counts and the gate FAILs until re-review
  const h=read('content-src/chemistry/hydrolysis.json',t);
  h.records.find(r=>r.salt==='NaCl').explanation+=' (edited)';
  fs.writeFileSync(path.join(t,'content-src/chemistry/hydrolysis.json'),JSON.stringify(h,null,2));
  assert.equal(buildWorkbenchModel(t).chemistry.find(a=>a.id===id).reviewStatus,'stale');
  const gate=buildKbReports(t).gate;
  assert.equal(gate.status,'FAIL'); assert.ok(gate.fail.includes(`APPROVAL_STALE:${id}`));
  // a reviewer cannot approve the old hash again
  const again=validateDecisionFile(t,file);
  assert.ok(again.categories.stale.some(i=>i.startsWith('CHEM_REVIEW_STALE_DECISION')));
  assert.deepEqual(read('content-src/chemistry-reviews.json').records,[],'production register untouched');
});

test('import preview classifies every problem: stale, invalid identity, unknown, missing comment, conflicting, tampering',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const cats=(...d)=>validateDecisionFile(t,envelope(m,...d)).categories;
  assert.ok(cats(chem(m,'hydrolysis:NaCl',{assertionHash:'0'.repeat(64)})).stale.length);
  for(const who of ['Claude','ChatGPT','Codex','ci-bot','automation','CI','script','github-actions[bot]']) assert.ok(cats(chem(m,'hydrolysis:NaCl',{reviewerId:who})).invalidIdentity.length,who);
  assert.ok(cats(chem(m,'hydrolysis:NaCl',{reviewerRole:'didactic'})).invalidIdentity.length,'role must be chemistry');
  assert.ok(cats({...chem(m,'hydrolysis:NaCl'),assertionId:'reaction:rxn.unknown'}).unknown.length);
  assert.ok(cats(chem(m,'hydrolysis:NaCl',{decision:'reject'})).missingComment.length);
  assert.ok(cats(chem(m,'hydrolysis:NaCl',{decision:'change_required',comment:'  '})).missingComment.length);
  assert.ok(cats(chem(m,'hydrolysis:NaCl'),chem(m,'hydrolysis:NaCl',{decision:'reject',comment:'Muhit noto‘g‘ri.'})).conflicting.length);
  // privileged / unknown fields are refused, never silently dropped — in every surface and in the envelope
  assert.ok(cats(chem(m,'hydrolysis:NaCl',{status:'approved'})).tampering.some(i=>i.includes(':status')));
  assert.ok(cats(item(m,'q.9.15.01','chemistry',{lifecycle:'APPROVED'})).tampering.length);
  assert.ok(validateDecisionFile(t,{...envelope(m,chem(m,'hydrolysis:NaCl')),approvedBy:'admin'}).categories.tampering.includes('ENVELOPE_FIELD_NOT_ALLOWED:approvedBy'));
  // P1.9 made `release` a real surface (content-owner decisions); an unknown surface is still refused
  assert.ok(validateDecisionFile(t,{...envelope(m),decisions:[{...chem(m,'hydrolysis:NaCl'),surface:'publish'}]}).issues.includes('DECISION_SURFACE_UNKNOWN:publish'));
  assert.ok(validateDecisionFile(t,{schema:'x',decisions:[]}).issues.includes('ENVELOPE_SCHEMA_INVALID'));
  // a file hash is compared, never trusted: the importer recomputes the current hash from content
  const lie=chem(m,'hydrolysis:NaCl',{assertionHash:m.chemistry.find(a=>a.id==='hydrolysis:AlCl3').currentHash});
  assert.ok(cats(lie).stale.length,'another assertion’s valid hash does not pass');
  // all-or-nothing: one bad decision refuses the whole file
  const mixed=importDecisionFile(t,envelope(m,chem(m,'hydrolysis:AlCl3'),chem(m,'hydrolysis:NaCl',{reviewerId:'claude'})));
  assert.equal(mixed.imported.chemistry,0); assert.deepEqual(read('content-src/chemistry-reviews.json',t).records,[]);
  assert.equal(categorize('CHEM_REVIEW_FIELD_NOT_ALLOWED:x:y'),'tampering');
});

// ------------------------------------------------------------------ change-required: queue, never an automatic fix

test('CHANGE_REQUIRED never edits content: it lands in the change queue with comment, files, activities and hash',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const before=digest(t,'content-src/chemistry');
  const out=importDecisionFile(t,envelope(m,chem(m,'observation:rxn.naoh-hcl',{decision:'change_required',comment:'Rang o‘zgarishi indikatorsiz ko‘rinmaydi; kuzatuvni aniqlashtiring.'}),item(m,'q.9.15.01','didactic',{decision:'changes_requested',outcomeDecision:'change_required',comment:'Savol katod haqida, konsept Anod.'})));
  assert.deepEqual(out.issues,[]);
  assert.equal(digest(t,'content-src/chemistry'),before,'rxn.naoh-hcl is not “fixed” by tooling');
  assert.equal(read('content-src/assessment-items.json',t).items.find(i=>i.id==='q.9.15.01').conceptIds.join(),read('content-src/assessment-items.json').items.find(i=>i.id==='q.9.15.01').conceptIds.join());
  const q=changeQueue(buildWorkbenchModel(t),t);
  assert.equal(q.sourceContentMutated,false);
  const e=q.entries.find(x=>x.id==='observation:rxn.naoh-hcl');
  assert.deepEqual([e.reviewDecision,e.affectedFiles,e.currentHash.length],['change_required',['content-src/chemistry/reactions.json'],64]);
  assert.match(e.reviewerComment,/kuzatuvni/); assert.ok(e.affectedActivities.length>0);
  assert.ok(q.entries.some(x=>x.id==='q.9.15.01'&&x.category==='assessment-didactic'));
  assert.ok(q.entries.some(x=>x.id==='q.9.15.01'&&x.category==='assessment-outcome-mapping'));
  assert.deepEqual(read(REVIEW_REPORTS.changeQueue).entries,[],'production: no human decision yet → empty queue');
});

// ------------------------------------------------------------------ pilot sign-off: visible, validated, never written

test('pilot sign-off: validated against the current basis, premature/stale refused, never written by review:import',()=>{
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const p=m.pilot[0];
  const signoff=(over={})=>({surface:'pilot-signoff',learningUnitId:p.learningUnitId,reviewerId:'pilot.owner',role:'pilot-owner',decision:'signed_off',signedAt:AT,basisHash:p.basisHash,...over});
  assert.ok(validateDecisionFile(t,envelope(m,signoff())).issues.some(i=>i.startsWith('PILOT_SIGNOFF_PREMATURE')),'reviews pending → no sign-off');
  assert.ok(validateDecisionFile(t,envelope(m,signoff({basisHash:'0'.repeat(64)}))).categories.stale.length);
  assert.ok(validateDecisionFile(t,envelope(m,signoff({reviewerId:'claude'}))).categories.invalidIdentity.length);
  assert.ok(validateDecisionFile(t,envelope(m,signoff({role:'chemistry'}))).categories.invalidIdentity.length);
  const rejected=signoff({decision:'rejected',comment:'Assessment review hali tugamagan.'});
  const v=validateDecisionFile(t,envelope(m,rejected));
  assert.deepEqual(v.issues,[]); assert.equal(v.pilotSignoffsImportable,false);
  const before=fs.readFileSync(path.join(t,'content-src/pilot-signoffs.json'),'utf8');
  const out=importDecisionFile(t,envelope(m,rejected));
  assert.equal(out.pilotSignoffsNotImported,1);
  assert.equal(fs.readFileSync(path.join(t,'content-src/pilot-signoffs.json'),'utf8'),before,'no tool writes a sign-off (ADR-P1-004)');
});

// ------------------------------------------------------------------ human-only enforcement beyond the name check

test('the import commands refuse to run in an automation context (CI / agent session); validation still works',()=>{
  assert.deepEqual(automationContext({}),[]);
  assert.deepEqual(automationContext({CI:'true',AI_AGENT:'x',CLAUDECODE:'0'}),['CI','AI_AGENT']);
  const t=sandbox(); const m=buildWorkbenchModel(t);
  const file=path.join(t,'decisions.json'); fs.writeFileSync(file,JSON.stringify(envelope(m,chem(m,'hydrolysis:NaCl'))));
  const env={...process.env,CI:'true'};
  for(const [script,args] of [['scripts/review.ts',['import',file]],['scripts/chemistry-review/import.ts',[file]],['scripts/assessment-review/import.ts',[file]]]){
    const r=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,script),...args],{env,encoding:'utf8'});
    assert.equal(r.status,1,script); assert.match(r.stderr,/REVIEW_IMPORT_REFUSED_IN_AUTOMATION/,script);
  }
  assert.deepEqual(read('content-src/chemistry-reviews.json').records,[]);
  const v=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,'scripts/review.ts'),'validate',file],{env,encoding:'utf8'});
  assert.equal(v.status,0,v.stderr); assert.equal(JSON.parse(v.stdout).registersChanged,false);
});

// ------------------------------------------------------------------ workbench page: offline, DOM-safe, accessible

test('workbench page: offline (CSP, no network), DOM-safe rendering, accessible tabs, embedded data cannot break out',()=>{
  const t=sandbox();
  const items=read('content-src/assessment-items.json',t);
  items.items[0].prompt='<img src=x onerror="window.__xss=1"> katodda nima bo‘ladi?';
  items.items[0].explanation='</script><script>window.__xss2=1</script>';
  fs.writeFileSync(path.join(t,'content-src/assessment-items.json'),JSON.stringify(items,null,2));
  const report=writeWorkspace(t);
  const html=fs.readFileSync(path.join(t,'review-packets/reviewer-workspace.html'),'utf8');
  assert.ok(!html.includes('</script><script>window.__xss2'),'packet text cannot close the data script');
  assert.ok(!html.includes('<img src=x'),'packet text is not markup');
  assert.match(html,/Content-Security-Policy[^>]+connect-src 'none'/);
  assert.doesNotMatch(html,/<(script|link|img|iframe)[^>]+(src|href)=["']?https?:/i,'no external resource');
  const client=src('scripts/lib/review-workbench-client.ts');
  assert.doesNotMatch(client,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|eval\(/,'text only, no network');
  for(const tab of ['chemistry','candidates','assessment','pilot']) assert.match(html,new RegExp(`role="tab" id="tabbtn-${tab}" aria-controls="tab-${tab}"`));
  assert.match(html,/role="tablist"/); assert.match(html,/ArrowRight/); assert.match(html,/aria-live="polite"/); assert.match(html,/role="alert"/);
  assert.equal(report.workbench.registerWrites,false); assert.equal(report.workbench.networkRequests,false);
  // P1.9 adds the authoring (read-only) and release-decision surfaces to the same workbench; the P1.8 four are unchanged
  const {authoring:_a,release:_r,...p18}=report.workbench.surfaces;
  assert.deepEqual(p18,{chemistry:134,candidates:18,assessment:5,pilot:4});
  assert.equal(report.approveAllAvailable,false);
});

test('the reviewer workbench (with answer keys) never ships in a learner build',()=>{
  for(const dir of ['public','dist-rc','dist-standalone']){
    const base=path.join(root,dir); if(!fs.existsSync(base)) continue;
    const files=fs.readdirSync(base,{recursive:true}).map(String);
    assert.ok(!files.some(f=>/reviewer-workspace|review-packets|review-output|chemistry-candidate-reviews/.test(f)),dir);
  }
});

// ------------------------------------------------------------------ reports

test('review reports are deterministic, derived from registers, and report 0 human decisions honestly',async()=>{
  const m=buildWorkbenchModel(root);
  assert.deepEqual(read(REVIEW_REPORTS.status),humanReviewStatus(m,root),'run npm run review:status');
  assert.deepEqual(read(REVIEW_REPORTS.changeQueue),changeQueue(m,root));
  assert.deepEqual(read(REVIEW_REPORTS.candidates),authoringCandidates(m));
  assert.deepEqual(read(REVIEW_REPORTS.goldenSlice),goldenSliceDependencies(m,root));
  const s=read(REVIEW_REPORTS.status);
  assert.equal(s.humanDecisionsImported.total,0,'0 human decisions imported — nothing fabricated');
  assert.deepEqual([s.chemistry.total,s.chemistry.pending,s.chemistry.approved,s.chemistry.rejected,s.chemistry.stale],[134,134,0,0,0]);
  assert.deepEqual([s.assessment.total,s.assessment.chemistryApproved,s.assessment.didacticApproved,s.assessment.fullyApproved],[5,0,0,0]);
  assert.deepEqual([s.pilot.pendingSignoff,s.pilot.signedOff],[4,0]);
  assert.equal(s.globalStrictEnforcement,false);
  const before=REGISTERS.map(r=>fs.readFileSync(path.join(root,r),'utf8'));
  const impact=await promotionImpact(m,root,evaluatePilot);
  assert.deepEqual(REGISTERS.map(r=>fs.readFileSync(path.join(root,r),'utf8')),before,'the hypothetical writes nothing');
  assert.deepEqual(read(REVIEW_REPORTS.impact),impact);
  assert.equal(impact.hypothetical,true); assert.equal(impact.canonicalStateChanged,false);
  assert.equal(impact.activities.runtimeStatesUnchanged,true,'approval never changes launchability');
  assert.ok(impact.activities.remainNotReleaseReady.some(a=>a.reasons.includes('ACTIVITY_NOT_RELEASED')));
  assert.deepEqual(impact.assessment.masteredReachable,{now:false,ifApproved:true});
  assert.ok(impact.pilots.every(p=>p.ifApproved==='SIGNOFF_PENDING'),'even with every review, a pilot still waits for a person’s sign-off');
  assert.equal(impact.chemistry.wouldRemainBlocked.count,30,'source-less name assertions cannot be approved yet');
});

test('golden slice lu.9.15: technical PASS; every human dependency is visible and pending; the electrolysis KB record is part of the chemistry check',()=>{
  const g=read(REVIEW_REPORTS.goldenSlice);
  assert.equal(g.learningUnitId,'lu.9.15');
  assert.deepEqual(g.dependencies.map(d=>d.id),['practice-technical','renderer-path','activity-content-review','electrolysis-chemistry-review','assessment-chemistry-review','assessment-didactic-review','outcome-mapping','pilot-owner-signoff']);
  assert.equal(g.dependencies.find(d=>d.id==='practice-technical').status,'PASS');
  assert.deepEqual(g.pending,['activity-content-review','electrolysis-chemistry-review','assessment-chemistry-review','assessment-didactic-review','outcome-mapping','pilot-owner-signoff']);
  assert.equal(g.masteredReachable,false);
  const row=read('reports/pilot-acceptance-matrix.json').rows.find(r=>r.learningUnitId==='lu.9.15');
  const check=row.checks.find(c=>c.id==='content.chemistry-review');
  assert.equal(check.verdict,'PENDING'); assert.match(check.detail,/electrolysis:CuCl2\|aq\|inert \(pending\)/);
  assert.notEqual(row.finalPilotStatus,'PILOT_READY');
});

test('pilot chemistry check: an approved activity alone is not enough while the electrolysis KB record is unreviewed',async()=>{
  const states=[];
  const m=await evaluatePilot({chemistryState:(id)=>{states.push(id);return 'approved';}});
  assert.ok(states.includes('electrolysis:CuCl2|aq|inert'),'the check consults the KB review state');
  const pending=await evaluatePilot({chemistryState:()=>'pending'});
  const row=(x)=>x.rows.find(r=>r.learningUnitId==='lu.9.15').checks.find(c=>c.id==='content.chemistry-review');
  assert.equal(row(pending).verdict,'PENDING');
  assert.equal(row(await evaluatePilot({chemistryState:()=>undefined})).verdict,'FAIL','a config pointing at no KB record is a failure');
  assert.equal(row(m).verdict,'PENDING','the activity’s own chemistry approval is still pending');
});

// ------------------------------------------------------------------ electrolysis: brief only, no renderer, no canonical data

test('electrolysis: an authoring brief of PROPOSED cases only — canonical data unchanged, no renderer',()=>{
  const p=read('review-packets/electrolysis-expansion/proposals.json');
  assert.equal(p.canonical,false); assert.equal(p.status,'PROPOSED / NEEDS REVIEW');
  assert.ok(p.candidateCases.every(c=>/PROPOSED \/ NEEDS REVIEW|EXISTING RECORD/.test(c.status)));
  assert.match(fs.readFileSync(path.join(root,'review-packets/electrolysis-expansion/README.md'),'utf8'),/PROPOSED \/ NEEDS REVIEW/);
  assert.equal(read('content-src/chemistry/electrolysis.json').records.length,1,'nothing added to canonical electrolysis data');
  assert.equal(read('reports/electrolysis-model-readiness.json').rendererStartGate.status,'NOT_READY');
  assert.ok(!RENDERER_CATALOG.some(c=>/electroly/i.test(c.id??c.capability??'')),'no electrolysis renderer');
  // the proposed design would satisfy the black-swan criterion (≥2 choices × ≥2 values, ≥3 outcomes)
  const d=p.proposedDesign;
  assert.ok(d.learnerChoices.length>=2&&d.learnerChoices.every(c=>c.values.length>=2));
  const outcomes=new Set(p.candidateCases.filter(c=>c.inProposedDesign).map(c=>`${c.proposedCathode}|${c.proposedAnode}`));
  assert.ok(outcomes.size>=3); assert.equal(outcomes.size,d.distinctOutcomes);
  const species=new Set(read('content-src/chemistry/species.json').map(s=>s.formula));
  assert.deepEqual(p.speciesCheck.notRegistered.filter(f=>species.has(f)),[]); assert.ok(p.speciesCheck.registered.every(f=>species.has(f)));
});

test('scope: global strict readiness stays OFF; commands exist once; CI treats missing human review as PENDING',()=>{
  const pkg=read('package.json');
  for(const c of ['review:build','review:validate','review:import','review:status']) assert.ok(pkg.scripts[c],c);
  assert.match(pkg.scripts['content:validate'],/review\.ts status/,'CI rebuilds the review reports; PENDING does not fail');
  assert.equal(read('reports/readiness-enforcement-impact.json').globalStrictEnforcement.enabled,false);
  assert.equal(read(REVIEW_REPORTS.impact).globalStrictEnforcement,false);
  const r=spawnSync(process.execPath,['--experimental-strip-types',path.join(root,'scripts/review.ts'),'status'],{encoding:'utf8',cwd:root});
  assert.equal(r.status,0,r.stderr); assert.equal(JSON.parse(r.stdout).gate,'PENDING');
});
