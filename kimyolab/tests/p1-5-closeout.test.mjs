// P1.5 closeout — semantic audit before merge: indicator chemistry governance (authority, validation, review
// hash), the 11.11 evaluation change and its versioning, the hydrolysis evidence subtype discriminator, evidence
// identity across retries, late predictions, bounded trials per attempt (no inflation), and the target-salt rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HydrolysisModel,validateIndicator,indicatorCoverage} from '../src/domain/chemistry/hydrolysis-model.ts';
import {evaluateHydrolysisTrials} from '../src/domain/chemistry/hydrolysis-trial.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';
import {rescoreEvidence,computeConceptMastery} from '../src/domain/mastery/mastery.ts';
import {toHydrolysisRendererModel} from '../src/renderers/hydrolysis-medium/renderer-model.ts';
import {hydrolysisIntent} from '../src/renderers/hydrolysis-medium/renderer.ts';
import {buildStableSignoffTargets} from '../scripts/stable-signoff-targets.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {isReleaseReady} from '../src/domain/readiness/readiness.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {BrowserProgressService} from '../src/features/progress/service.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {memoryPackFetch} from './helpers/memory-pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const DATA=read('content-src/chemistry/hydrolysis.json');
const model=HydrolysisModel.from(DATA);
const EXP='practice.experiment.9.14', SIM='practice.simulation.11.11.planned';
const sel=(salt)=>({type:'selectSalt',payload:{salt}}), pred=(medium)=>({type:'predictMedium',payload:{medium}}), reveal={type:'addIndicator'};
const client=()=>new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
async function run(pageId,actions,mutate){
  const page=await client().loadPractice(pageId);
  if(mutate) page.chemistry={...page.chemistry,hydrolysis:mutate(structuredClone(page.chemistry.hydrolysis))};
  const session=new ReferencePracticeSession(page);
  let r=await session.result();
  for(const a of actions) r=await session.apply(hydrolysisIntent(a,page.type));
  return {page,r};
}

// ------------------------------------------------------------------ indicator governance

test('indicator authority: content → HydrolysisModel → observation → RendererModel; the renderer knows no medium→colour map',async()=>{
  // change the content colour and the whole chain follows (the renderer only names colours)
  const {r}=await run(EXP,[sel('AlCl3'),pred('acidic'),reveal],(h)=>({...h,indicator:{...h.indicator,colors:{...h.indicator.colors,acidic:'yellow'}}}));
  assert.equal(r.finalState.hydrolysis.current.observation.color,'yellow');
  assert.equal(toHydrolysisRendererModel(r).observation.text,'Indikator (lakmus) sariq tusga o‘tdi. Muhit kislotali.');
  for(const f of ['renderer.ts','renderer-model.ts']){
    const src=fs.readFileSync(path.join(root,'src/renderers/hydrolysis-medium',f),'utf8');
    assert.doesNotMatch(src,/acidic\s*:\s*['"](red|blue|violet)|basic\s*:\s*['"](red|blue|violet)|neutral\s*:\s*['"](red|blue|violet)/,f);
  }
});

test('indicator validation: id, colours, sourceRefs, explanation, reviewStatus required; a missing colour fails closed at reveal',()=>{
  const ind=DATA.indicator;
  for(const [field,bad] of [['id',{...ind,id:''}],['colors',{...ind,colors:null}],['colors.acidic',{...ind,colors:{...ind.colors,acidic:'purple-ish'}}],['colors.salty',{...ind,colors:{...ind.colors,salty:'red'}}],['sourceRefs',{...ind,sourceRefs:[]}],['explanation',{...ind,explanation:''}],['reviewStatus',{...ind,reviewStatus:'approved-by-tool'}],['reviewStatus',(({reviewStatus,...x})=>x)(ind)]])
    assert.throws(()=>validateIndicator(bad),new RegExp(`HYDROLYSIS_INDICATOR_INVALID:${field.replace('.','\\.')}`),field);
  const gap={...DATA,indicator:{...ind,colors:{acidic:'red',neutral:'violet'}}};
  const m=HydrolysisModel.from(gap);
  assert.deepEqual(indicatorCoverage(gap.indicator),{modeled:['acidic','neutral'],missing:['basic']});
  assert.deepEqual(m.indicatorColor('basic'),{modeled:false,code:'HYDROLYSIS_INDICATOR_NOT_MODELED'});
  const s=evaluateHydrolysisTrials(m,'AlCl3',[sel('Na2CO3'),pred('basic'),reveal]);
  assert.equal(s.rejected,'HYDROLYSIS_INDICATOR_NOT_MODELED'); assert.equal(s.current.observation,null); assert.equal(s.trials.length,0);
  assert.equal(ind.reviewStatus,'pending','the litmus colours are NOT approved by tooling');
  const chem=read('reports/chemistry-validation.json');
  assert.deepEqual([chem.hydrolysisErrors,chem.hydrolysisIndicator.missingMedia,chem.hydrolysisIndicator.reviewStatus],[0,[],'pending']);
});

test('review hash: the litmus data is in the CHEM-033 surface — changing one colour changes expertReviewHash',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kl-chem-hash-'));
  try{
    fs.cpSync(path.join(root,'content-src'),path.join(tmp,'content-src'),{recursive:true});
    const before=buildStableSignoffTargets(tmp).targets['CHEM-033'];
    assert.equal(before.hash,buildStableSignoffTargets(root).targets['CHEM-033'].hash,'the copy reproduces the real hash');
    assert.ok(before.reviewSurfaceFiles.includes('content-src/chemistry/hydrolysis.json'));
    const file=path.join(tmp,'content-src/chemistry/hydrolysis.json');
    const data=JSON.parse(fs.readFileSync(file,'utf8'));data.indicator.colors.basic='violet';
    fs.writeFileSync(file,JSON.stringify(data));
    assert.notEqual(buildStableSignoffTargets(tmp).targets['CHEM-033'].hash,before.hash);
  }finally{ fs.rmSync(tmp,{recursive:true,force:true}); }
});

// ------------------------------------------------------------------ 11.11 semantic change

test('11.11: the old free-text answer no longer scores; the new trial does; the change is versioned (2.0.0) and re-identified',async()=>{
  const page=await client().loadPractice(SIM);
  const old=new ReferencePracticeSession(page);
  const typed=await old.apply({kind:'simulation-action',action:{field:'medium',value:'acidic'}});   // pre-P1.5 input
  assert.equal(isPracticeResultComplete(page.type,typed),false,'typing the medium is not a prediction trial');
  assert.equal(typed.finalState.hydrolysis.rejected,'HYDROLYSIS_ACTION_INVALID');
  const {r}=await run(SIM,[sel('NH4Cl'),pred('acidic'),reveal]);
  assert.equal(isPracticeResultComplete('simulation',r),true);
  const construction=r.evidence.find(e=>e.type==='construction');
  assert.deepEqual([construction.id,construction.targetId,construction.activityVersion],[`${SIM}.hydrolysis`,'hydrolysis-NH4Cl-trial','2.0.0']);
  assert.notEqual(construction.id,`${SIM}.beta3.medium`,'never the same identity as the old free-text evidence');
  assert.ok(r.evidence.filter(e=>e.type==='answer').every(e=>e.activityVersion==='2.0.0'));
  assert.equal(read('content-src/activity-configs/beta2-advanced.json')[EXP].version,'2.0.0');
  // 11.11 now depends on chemistry content → chemistry review is required (was not_applicable)
  assert.equal(read('content-src/practice-activities.json').find(a=>a.id===SIM).approvals.chemistry.status,'pending');
});

test('renderer added ≠ activity released: readiness of 9.14/11.11 is identical with and without the rendererRequirement',()=>{
  const withReq=compileReadiness(structuredClone(loadSources())).pack.activities;
  const src=structuredClone(loadSources());
  delete src.configs['beta2-advanced'][EXP].rendererRequirement;
  delete src.configs['beta3-advanced'][SIM].rendererRequirement;
  const without=compileReadiness(src).pack.activities;
  for(const id of [EXP,SIM]){
    const a=withReq.find(x=>x.activityId===id), b=without.find(x=>x.activityId===id);
    assert.deepEqual(a,b,id);
    assert.equal(a.content,'REVIEW_PENDING'); assert.equal(isReleaseReady(a),false,id);
  }
});

// ------------------------------------------------------------------ evidence subtype + identity

test('evidence subtype: explicit answerKind discriminator; stray, partial or unknown hydrolysis fields are rejected',async()=>{
  const {r}=await run(EXP,[sel('AlCl3'),pred('acidic'),reveal]);
  const ev=r.evidence.find(e=>e.type==='answer');
  assert.equal(ev.answerKind,'hydrolysis-prediction');
  assert.doesNotThrow(()=>validateEvidence(ev));
  const {answerKind:_k,...noKind}=ev;
  assert.throws(()=>validateEvidence(noKind),/hydrolysis fields require answerKind/,'an ordinary answer may not carry selectedSalt');
  const plain={id:'x',conceptId:'c',activityId:'a',activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-01-01T00:00:00Z',score:1,evidenceClass:'trainer-calculation',type:'answer',questionId:'q',correct:true};
  assert.doesNotThrow(()=>validateEvidence(plain));
  assert.throws(()=>validateEvidence({...plain,selectedSalt:'AlCl3'}),/answerKind/);
  assert.throws(()=>validateEvidence({...ev,actualMedium:undefined}),/fields required/,'partial record');
  assert.throws(()=>validateEvidence({...plain,answerKind:'future-kind'}),/unknown answerKind/);
});

test('identity: a retry re-emits trial.1 but persistence gives fresh ids bound to the new attempt (append-only)',async()=>{
  const page=await client().loadPractice(EXP);
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'ident',{liveness:null});
  const store=new IndexedDbProgressStore(factory,'ident');
  const a=service.beginPracticeSession(page,new ReferencePracticeSession(page));
  for(const x of [sel('AlCl3'),pred('basic'),reveal]) await service.applyPracticeCommand(a,hydrolysisIntent(x,page.type));
  const before=JSON.stringify(await store.listEvidence());
  const b=await service.retryPracticeSession(a,new ReferencePracticeSession(page));
  for(const x of [sel('AlCl3'),pred('acidic'),reveal]) await service.applyPracticeCommand(b,hydrolysisIntent(x,page.type));
  const all=await store.listEvidence();
  const trials=all.filter(e=>e.sourceEvidenceId===`${EXP}.hydrolysis.trial.1`);
  assert.equal(trials.length,2,'same engine id in both attempts');
  assert.equal(new Set(trials.map(e=>e.id)).size,2,'unique persisted ids');
  assert.equal(new Set(trials.map(e=>e.attemptId)).size,2,'bound to different attempts');
  assert.equal(new Set(all.map(e=>e.id)).size,all.length);
  for(const e of JSON.parse(before)) assert.deepEqual(all.find(x=>x.id===e.id),e,'append-only: nothing rewritten');
});

// ------------------------------------------------------------------ scoring semantics

test('late prediction: recorded, score 0, never completes, and rescoring cannot credit it',async()=>{
  const {page,r}=await run(EXP,[sel('AlCl3'),reveal,pred('acidic')]);
  const ev=r.evidence.find(e=>e.type==='answer');
  assert.deepEqual([ev.correct,ev.predictedBeforeReveal,ev.score],[true,false,0]);
  assert.equal(isPracticeResultComplete(page.type,r),false);
  assert.equal(rescoreEvidence(ev),0,'a recalculation (version policy) does not turn a late prediction into credit');
  assert.equal(rescoreEvidence({...ev,predictedBeforeReveal:true,score:1}),1);
});

test('multiple trials: one trial per salt per attempt, bounded evidence, achieved only by the target salt',async()=>{
  // A wrong, B right, target right → achieved; re-selecting a revealed salt is rejected (no copy trial)
  const {page,r}=await run(EXP,[sel('Na2CO3'),pred('acidic'),reveal,sel('NaCl'),pred('neutral'),reveal,sel('AlCl3'),pred('acidic'),reveal,sel('Na2CO3'),pred('basic'),reveal]);
  const trials=r.evidence.filter(e=>e.type==='answer');
  assert.deepEqual(trials.map(e=>[e.selectedSalt,e.correct,e.score]),[['Na2CO3',false,0],['NaCl',true,1],['AlCl3',true,1]]);
  assert.equal(r.finalState.hydrolysis.rejected,null,'the last reveal is idempotent, the re-select was rejected earlier');
  assert.deepEqual(r.finalState.hydrolysis.triedSalts,['Na2CO3','NaCl','AlCl3']);
  assert.equal(isPracticeResultComplete(page.type,r),true);
  // upper bound: hammering every salt many times never yields more trials than modeled salts
  const spam=[];for(let i=0;i<5;i++) for(const s of model.salts()) spam.push(sel(s),pred('acidic'),reveal);
  assert.ok(evaluateHydrolysisTrials(model,'AlCl3',spam).trials.length<=model.salts().length);
  // wrong on the target first → cannot be "fixed" in the same attempt (only a new attempt)
  const fixed=evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('basic'),reveal,sel('AlCl3'),pred('acidic'),reveal]);
  assert.deepEqual([fixed.achieved,fixed.trials.length,fixed.rejected],[false,1,null]);
  assert.equal(evaluateHydrolysisTrials(model,'AlCl3',[sel('AlCl3'),pred('basic'),reveal,sel('AlCl3')]).rejected,'HYDROLYSIS_ALREADY_TRIED');
  // mastery: the per-trial scores are averaged (no bonus for repetition); the construction adds one record
  const m=computeConceptMastery({conceptId:trials[0].conceptId,evidence:r.evidence,scoringVersion:trials[0].scoringVersion,context:{scoringVersion:trials[0].scoringVersion}});
  assert.equal(m.evidenceIds.length,trials.length+1);
});

test('target-salt invariant: a correct pre-reveal trial on another modeled salt never completes the activity',async()=>{
  for(const salt of model.salts().filter(s=>s!=='AlCl3')){
    const {page,r}=await run(EXP,[sel(salt),pred(model.classify(salt).medium),reveal]);
    assert.equal(r.evidence.find(e=>e.type==='answer').score,1,salt);
    assert.equal(isPracticeResultComplete(page.type,r),false,salt);
  }
});
