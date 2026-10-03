// P2.6 — computed model interaction expansion (ADR-P2-007). The audit lists every computed-engine candidate with facts from
// the REAL domain; only activities passing F1–F8 were converted (9.23, 11.18, 11.20 → condition-prediction trials); each
// conversion has its own black-swan through the real stack; evidence stays canonical; the renderer holds no chemistry and
// never sees an outcome before the reveal; no chemistry record was added; progress moved only through classification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildComputedModelAudit,buildComputedModelExpansion,bundle,P26_CONVERTED,P25_BASELINE,CMI_AUDIT_REPORT,CMI_EXPANSION_REPORT} from '../scripts/lib/computed-model-interaction.ts';
import {buildConditionReport,CONDITION_REPORT} from '../scripts/renderer-reports.ts';
import {hardcodedUzbek,classifyActivity} from '../scripts/lib/learning-depth.ts';
import {evaluateConditionTrials,equilibriumConditionModel,manganeseConditionModel,assertConditionTarget} from '../src/domain/chemistry/condition-trial.ts';
import {EquilibriumModel,EQUILIBRIUM_SHIFTS} from '../src/domain/chemistry/equilibrium-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
import {conditionPracticeResult} from '../src/runtime/reference-slices/condition-practice.ts';
import {validateEvidence} from '../src/runtime/evidence/types.ts';
import {toConditionRendererModel,CONDITION_UI_KEYS,formulaLabel} from '../src/renderers/condition-prediction/renderer-model.ts';
import {conditionIntent} from '../src/renderers/condition-prediction/renderer.ts';
import {CONDITION_PREDICTION_CAPABILITY} from '../src/renderers/catalog.ts';
import {createLocalizer,parseInteractionCatalog} from '../src/features/localization/element-names.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {diskFetch} from '../scripts/pilot-status.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';
import {isPracticeResultComplete} from '../src/runtime/learning-orchestrator/selectors.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const audit=json(CMI_AUDIT_REPORT), expansion=json(CMI_EXPANSION_REPORT);
const row=(id)=>audit.candidates.find(c=>c.activityId===id);
const eq=EquilibriumModel.from(json('content-src/chemistry/equilibrium.json'));
const mn=ManganeseRedoxModel.from(json('content-src/chemistry/manganese-redox.json'));
const MODELS={equilibrium:equilibriumConditionModel(eq,'haber',EQUILIBRIUM_SHIFTS),manganese:manganeseConditionModel(mn)};
const localize=createLocalizer({interaction:parseInteractionCatalog(json('content-src/locales/uz-latn/learner-interaction.json'))});
const NOW={now:()=>'2026-10-02T00:00:00.000Z'};
const client=()=>new ContentClient({fetchImpl:diskFetch(root),baseUrl:'/content'});
const trial=(c,o)=>[{type:'selectCondition',payload:{condition:c}},{type:'predictOutcome',payload:{outcome:o}},{type:'reveal'}];
const META={conceptId:'c',activityId:'a',activityVersion:'1',contentVersion:'1',scoringVersion:'1',createdAt:'2026-10-02T00:00:00.000Z'};
const PRES={conditionDomain:'manganese-medium',outcomeDomain:'manganese-product',outcomeFormat:'formula',subjectFormula:'MnO4^-'};
async function run(id,actions){ const s=new ReferencePracticeSession(await client().loadPractice(id),NOW); let r=await s.result(); for(const a of actions) r=await s.apply(conditionIntent(a,'simulation')); return r; }

// ------------------------------------------------------------------ reports: current, complete, facts only

test('audit + expansion reports are current and deterministic; every candidate carries every audit field; nothing hidden',()=>{
  const fresh=buildComputedModelAudit(root);
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)),audit,'run npm run model:computed');
  assert.deepEqual(JSON.parse(JSON.stringify(buildComputedModelExpansion(root,fresh))),expansion,'run npm run model:computed');
  const FIELDS=['activityId','learningUnitIds','type','currentDepth','currentInteraction','domainModule','learnerControllableInputs','inputDomain','distinctReachableOutcomes','invalidInputBehaviour','contentDefinesParameters','newChemistryRequired','rendererReuse','evidenceSemantics','accessibilityRequirements','blackSwan','eligible','status','reasons'];
  for(const c of audit.candidates){
    for(const k of FIELDS) assert.ok(k in c,`${c.activityId}.${k}`);
    if(['NOT_ELIGIBLE','BLOCKED','OUT_OF_FAMILY'].includes(c.status)) assert.ok(c.reasons.length>0,`${c.activityId}: a rejected candidate states why`);
  }
  // no hidden candidates: every computed-engine config, every config-target simulation/calculation, every organic activity
  const cfg=(f)=>json(`content-src/activity-configs/${f}.json`);
  const expected=[...Object.keys(cfg('beta3-advanced')),...Object.keys(cfg('beta2-advanced')),...Object.keys(cfg('beta2-organic')),
    ...['beta1','beta2-safe','beta3-safe'].flatMap(f=>Object.entries(cfg(f)).filter(([,c])=>['simulation','calculation'].includes(c.type)).map(([id])=>id))];
  for(const id of expected) assert.ok(row(id),`${id} is audited`);
  for(const id of ['practice.simulation.11.01.planned','practice.simulation.11.15.planned','practice.simulation.11.16.planned','practice.simulation.11.18.planned','practice.simulation.9.23.planned','practice.simulation.11.20.planned']) assert.ok(row(id),`first target ${id}`);
  assert.equal(audit.totals.candidates,audit.candidates.length);
  assert.equal(expansion.totalCandidates,audit.candidates.length);
});

test('eligibility is derived, not a quota: exactly the F1–F8 candidates were converted; the rest are blocked or not eligible with reasons',()=>{
  assert.deepEqual(audit.converted,[...P26_CONVERTED].sort());
  assert.deepEqual(expansion.eligible,[...P26_CONVERTED].sort());
  assert.equal(audit.totals.eligibleNotConverted,0,'nothing eligible was left unconverted');
  const reasons=(id)=>row(id).reasons.map(r=>r.split(':')[0]);
  assert.equal(row('practice.simulation.11.16.planned').status,'BLOCKED'); assert.ok(reasons('practice.simulation.11.16.planned').includes('BLACK_SWAN_FAIL'));
  assert.deepEqual(row('practice.simulation.11.16.planned').distinctReachableOutcomes,['increase'],'every modeled kinetics factor has the same effect');
  assert.equal(row('practice.simulation.11.01.planned').status,'BLOCKED'); assert.ok(reasons('practice.simulation.11.01.planned').includes('ANSWER_LEAK')&&reasons('practice.simulation.11.01.planned').includes('MODEL_KNOWN_GAP'));
  assert.equal(row('practice.simulation.11.15.planned').status,'BLOCKED');
  assert.equal(row('practice.simulation.8.20.planned').status,'BLOCKED'); assert.ok(reasons('practice.simulation.8.20.planned').includes('CONTENT_SCOPE'));
  for(const id of ['practice.calculation.11.06.planned','practice.calculation.11.08.planned','practice.calculation.11.14.planned','practice.calculation.11.22.planned','practice.trainer.11.19.planned','practice.simulation.11.03.planned']){
    assert.equal(row(id).status,'NOT_ELIGIBLE',id); assert.ok(reasons(id).includes('ANSWER_VALIDATOR_ONLY'),`${id}: a validator is never model-based`);
  }
  for(const id of ['practice.experiment.11.2','practice.experiment.9.10']) assert.ok(reasons(id).includes('OUT_OF_SCOPE_P26'));
  assert.ok(audit.candidates.filter(c=>c.family==='organic-knowledge').every(c=>c.status==='OUT_OF_FAMILY'));
  for(const id of P26_CONVERTED){ const c=row(id); assert.equal(c.status,'CONVERTED'); assert.equal(c.depthBeforeP26,'STATIC_CHECK'); assert.equal(c.currentDepth,'MODEL_BASED'); assert.ok(c.contentScope); }
  assert.match(row('practice.simulation.11.20.planned').contentScope,/Kislotali\/neytral\/ishqoriy/,'11.20 names all three media in its own title');
});

test('progress moved only through the classification: MODEL_BASED 4 → 7 activities, 6 → 9 units; formulas unchanged; 0 human decisions',()=>{
  assert.deepEqual(expansion.modelBasedActivities,{before:4,after:7}); assert.deepEqual(expansion.modelBasedUnits,{before:6,after:9,total:122});
  const p=json('reports/project-progress.json');
  assert.equal(p.foundationProgress.percent,100);
  assert.equal(p.learningProductProgress.components.modelBasedInteraction,Math.round(9/122*100*1000)/1000);
  assert.ok(Math.abs(0.4*p.foundationProgress.percent+0.6*p.learningProductProgress.percent-p.overallManagementEstimate.percent)<0.01,'formula unchanged');
  for(const k of ['learningCoverage','assessmentCoverage','governance','release','localization']) assert.equal(p.learningProductProgress.components[k],{learningCoverage:32.423,assessmentCoverage:0,governance:0,release:0,localization:33.333}[k],`${k} did not move`);
  assert.equal(expansion.humanDecisionsCreated,0);
  for(const f of ['release-decisions','pilot-signoffs','chemistry-reviews','assessment-reviews','chemistry-candidate-reviews']) assert.deepEqual(json(`content-src/${f}.json`).records,[],`${f}: no decision was created`);
});

// ------------------------------------------------------------------ domain: permutations, two outcomes, fail closed

test('domain permutations: every (condition × prediction) pair is judged by the model, never by the sequencer',()=>{
  for(const [name,model] of Object.entries(MODELS)) for(const c of model.conditions()) for(const o of model.outcomes()){
    const s=evaluateConditionTrials(model,model.conditions()[0],trial(c,o));
    const actual=model.resolve(c).outcome;
    assert.equal(s.trials.length,1,`${name} ${c} ${o}`);
    assert.deepEqual(s.trials[0],{n:1,condition:c,predicted:o,actual,correct:o===actual});
  }
  // equilibrium outcomes are exactly the records' shifts; manganese outcomes are exactly the records' products
  assert.deepEqual(MODELS.equilibrium.conditions().map(c=>MODELS.equilibrium.resolve(c).outcome),['products','reactants']);
  assert.deepEqual(MODELS.manganese.conditions().map(c=>MODELS.manganese.resolve(c).outcome),['Mn^2+','MnO4^2-','MnO2']);
});

test('black-swan (positive, real stack, per activity): path A → result A, path B → a different result B',async()=>{
  const PATHS={'practice.simulation.9.23.planned':[['acidic','Mn^2+'],['basic','MnO4^2-']],'practice.simulation.11.20.planned':[['acidic','Mn^2+'],['neutral','MnO2']],'practice.simulation.11.18.planned':[['pressure-increase','products'],['temperature-increase','reactants']]};
  for(const [id,[[ca,oa],[cb,ob]]] of Object.entries(PATHS)){
    const a=await run(id,trial(ca,oa)), b=await run(id,trial(cb,ob));
    assert.equal(a.finalState.condition.trials[0].actual,oa); assert.equal(b.finalState.condition.trials[0].actual,ob);
    assert.notEqual(oa,ob,`${id}: two learner paths, two domain outcomes`);
    assert.equal(toConditionRendererModel(a,localize).observation.outcome,oa,'renderer = engine = domain');
  }
  const r=json(CONDITION_REPORT);
  assert.equal(r.status,'PASS');
  assert.deepEqual(r.activities.map(a=>[a.activityId,a.status,a.distinctOutcomes]),[['practice.simulation.11.18.planned','PASS',2],['practice.simulation.11.20.planned','PASS',3],['practice.simulation.9.23.planned','PASS',3]]);
  for(const b of expansion.perActivityBlackSwan){ assert.equal(b.pass,true); assert.notEqual(b.pathA.outcome,b.pathB.outcome); assert.equal(b.invalidPath.failsClosed,true); }
});

test('black-swan (negative): a canned model (one outcome for every condition) FAILS and could never be MODEL_BASED',async()=>{
  const canned={records:['acidic','neutral','basic'].map(medium=>({medium,reactant:'MnO4^-',product:'MnO2',observation:'x',sourceRefs:['src.test'],reviewStatus:'pending'}))};
  const r=await buildConditionReport(root,{chemistry:{manganeseRedox:canned}});
  for(const id of ['practice.simulation.9.23.planned','practice.simulation.11.20.planned']){
    const a=r.activities.find(x=>x.activityId===id);
    assert.equal(a.status,'FAIL'); assert.equal(a.distinctOutcomes,1); assert.equal(a.checks.modelBased,false);
  }
  assert.equal(r.status,'FAIL');
  assert.equal(classifyActivity({uiKind:'registry',runtime:'beta2-advanced',capability:'manganese-redox-simulation',registry:true,blackSwan:false,hardening:null,modules:[],steps:0}).depth,'GUIDED');
  const src=fs.readFileSync(path.join(root,'scripts/lib/learning-depth.ts'),'utf8');
  assert.match(src,/capability==='condition-prediction'\)\{\s*const a=/,'classification reads the activity\'s OWN measurement');
});

test('invalid and unsupported input fail closed: no trial, no evidence, no crash; a broken target is a content error',()=>{
  const m=MODELS.manganese;
  const cases=[
    [[{type:'selectCondition',payload:{condition:'ACIDIC'}}],'CONDITION_NOT_MODELED'],
    [[{type:'selectCondition',payload:{condition:'<img src=x>'}}],'CONDITION_NOT_MODELED'],
    [[{type:'selectCondition',payload:{}}],'CONDITION_NOT_MODELED'],
    [[{type:'selectCondition',payload:{condition:'acidic'}},{type:'predictOutcome',payload:{outcome:'Mn'}}],'OUTCOME_NOT_IN_MODEL'],
    [[{type:'predictOutcome',payload:{outcome:'MnO2'}}],'CONDITION_NO_SELECTION'],
    [[{type:'selectCondition',payload:{condition:'acidic'}},{type:'reveal'}],'PREDICTION_REQUIRED'],
    [[...trial('acidic','MnO2'),{type:'predictOutcome',payload:{outcome:'Mn^2+'}}],'PREDICTION_LOCKED'],
    [[...trial('acidic','MnO2'),{type:'selectCondition',payload:{condition:'acidic'}}],'CONDITION_ALREADY_TRIED'],
    [[{field:'medium',value:'acidic'}],'CONDITION_ACTION_INVALID'],
    [[null],'CONDITION_ACTION_INVALID'],
  ];
  for(const [actions,code] of cases){
    const s=evaluateConditionTrials(m,'acidic',actions);
    assert.equal(s.rejected,code,JSON.stringify(actions));
    assert.equal(s.achieved,false,'rejected input never completes');
    const r=conditionPracticeResult({model:m,targetCondition:'acidic',actions,meta:META,construction:{id:'a.condition',targetId:'t'},presentation:PRES});
    assert.equal(r.evidence.filter(e=>e.type==='answer').length,s.trials.length,'only recorded trials are evidence');
    if(s.trials.length===0) assert.deepEqual(r.evidence,[],'invalid input is not evidence');
  }
  // the late prediction did not rewrite the recorded trial
  const late=evaluateConditionTrials(m,'acidic',[...trial('acidic','MnO2'),{type:'predictOutcome',payload:{outcome:'Mn^2+'}}]);
  assert.deepEqual(late.trials,[{n:1,condition:'acidic',predicted:'MnO2',actual:'Mn^2+',correct:false}]);
  assert.throws(()=>assertConditionTarget(m,'strongly-acidic'),/CONDITION_TARGET_NOT_MODELED/);
  assert.throws(()=>evaluateConditionTrials(MODELS.equilibrium,'pressure-decrease',[]),/CONDITION_TARGET_NOT_MODELED/,'an unmodeled target is never silently filled');
});

// ------------------------------------------------------------------ learner flow: wrong, correct, retry, evidence

test('wrong choice is legitimate evidence (score 0, no completion); the correct target trial completes; retry is a new attempt',async()=>{
  const id='practice.simulation.11.18.planned';
  const page=await client().loadPractice(id);
  const s=new ReferencePracticeSession(page,NOW);
  let r; for(const a of trial('pressure-increase','reactants')) r=await s.apply(conditionIntent(a,'simulation'));
  const wrong=r.evidence.find(e=>e.type==='answer');
  assert.deepEqual([wrong.correct,wrong.score,wrong.response,wrong.questionId],[false,0,'reactants','condition:equilibrium-shift:pressure-increase']);
  assert.equal(isPracticeResultComplete('simulation',r),false);
  const frozen=JSON.stringify(r.evidence);
  // the target condition was tried: a second prediction in this attempt is refused (it would copy the revealed answer)
  r=await s.apply(conditionIntent({type:'selectCondition',payload:{condition:'pressure-increase'}},'simulation'));
  assert.equal(r.finalState.condition.rejected,'CONDITION_ALREADY_TRIED'); assert.equal(isPracticeResultComplete('simulation',r),false);
  // retry = a new session/attempt: the earlier result is untouched, the new attempt can complete
  const again=new ReferencePracticeSession(page,NOW);
  let ok; for(const a of trial('pressure-increase','products')) ok=await again.apply(conditionIntent(a,'simulation'));
  assert.equal(isPracticeResultComplete('simulation',ok),true);
  assert.deepEqual(ok.evidence.find(e=>e.type==='construction'),{...META,conceptId:ok.evidence[0].conceptId,activityId:id,activityVersion:ok.evidence[0].activityVersion,contentVersion:ok.evidence[0].contentVersion,scoringVersion:ok.evidence[0].scoringVersion,createdAt:ok.evidence[0].createdAt,id:`${id}.condition`,score:1,evidenceClass:'practice-observation',type:'construction',targetId:'equilibrium-haber-pressure-increase-trial',achieved:true,independenceKey:`${id}:condition`});
  assert.equal(JSON.stringify(r.evidence),frozen,'the earlier attempt\'s evidence did not change');
});

test('evidence is canonical: every record validates; ids/targetIds are new (versioned); no new answerKind; scores come from the domain verdict',async()=>{
  for(const id of P26_CONVERTED){
    const page=await client().loadPractice(id);
    assert.equal(page.executionPlan.rendererRequirement.capability,'condition-prediction');
    const c=page.referenceConfig; assert.equal(c.version,'2.0.0',`${id}: semantics changed → config 2.0.0`);
    const target=c.targetMedium??c.medium??c.perturbation;
    const st=(await run(id,[])).finalState.condition;
    const out=st.conditions.map(x=>({c:x}));
    for(const {c:cond} of out){
      const r=await run(id,trial(cond,st.outcomeOptions[0]));
      for(const e of r.evidence){ validateEvidence(e); assert.equal(e.answerKind,undefined); assert.ok(e.id.startsWith(`${id}.condition`),e.id); }
      const a=r.evidence.find(e=>e.type==='answer');
      assert.equal(a.score,a.correct?1:0);
      assert.equal(a.correct,r.finalState.condition.trials[0].actual===st.outcomeOptions[0]);
      assert.equal(r.evidence.find(e=>e.type==='construction').achieved,cond===target&&a.correct);
    }
    assert.equal(st.targetCondition,target);
  }
});

// ------------------------------------------------------------------ renderer: separation, no leakage, localization

test('renderer/domain separation: the renderer imports no domain model or content, names no chemistry, declares only its intents',()=>{
  const dir=path.join(root,'src/renderers/condition-prediction');
  for(const f of fs.readdirSync(dir)){
    const s=fs.readFileSync(path.join(dir,f),'utf8');
    for(const m of s.matchAll(/^import\s+(type\s+)?[^;]*from\s+'([^']+)'/gm)){
      const spec=m[2]; if(spec.includes('domain/chemistry')) assert.ok(m[1],`${f}: domain import must be type-only (${spec})`);
      assert.ok(!/content-src|public\/content|\.json/.test(spec),`${f}: no content import`);
    }
    for(const word of ['haber','acidic','basic','neutral','pressure','temperature','Mn','products','reactants','Kislotali','Bosim']) assert.ok(!new RegExp(`['"\`][^'"\`\\n]*\\b${word}\\b`).test(s),`${f}: no chemistry token "${word}" in a literal`);
  }
  assert.deepEqual([...CONDITION_PREDICTION_CAPABILITY.intents],['simulation-action']);
  assert.deepEqual(conditionIntent({type:'reveal'}),{kind:'simulation-action',action:{type:'reveal'}});
  assert.deepEqual(CONDITION_PREDICTION_CAPABILITY.accessibility,{keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'});
  // the hard-coded Uzbek literal counter did not grow: all learner text is in the catalog.
  // P2.9: was equal(…,156). The reflection form's literal 'Barcha qismlarni to‘ldiring.' moved into the catalog
  // (ui.reflection-incomplete), so the count fell to 155; the assertion is now "never above 156" — a ratchet, so a
  // later move into the catalog does not need another edit while any new literal still fails
  assert.ok(hardcodedUzbek(root).literals<=156,`hard-coded Uzbek literals ${hardcodedUzbek(root).literals} > 156`);
  assert.ok(!hardcodedUzbek(root).byFile.some(r=>r.file.includes('condition-prediction')));
});

test('no answer leakage: before the reveal neither the engine result nor the renderer model carries the outcome',async()=>{
  for(const id of P26_CONVERTED){
    const st=(await run(id,[])).finalState.condition;
    const target=st.targetCondition;
    const before=await run(id,[{type:'selectCondition',payload:{condition:target}},{type:'predictOutcome',payload:{outcome:st.outcomeOptions[0]}}]);
    assert.equal(before.finalState.condition.current.outcome,null); assert.deepEqual(before.finalState.condition.trials,[]); assert.deepEqual(before.evidence,[]);
    const m=toConditionRendererModel(before,localize);
    assert.equal(m.observation,null); assert.equal(m.feedback,null); assert.deepEqual(m.trials,[]);
    // the option order is the model's closed set — identical whichever option is correct for the chosen condition
    const orders=new Set(); for(const c of st.conditions) orders.add(JSON.stringify(toConditionRendererModel(await run(id,[{type:'selectCondition',payload:{condition:c}}]),localize).outcomes.map(o=>o.id)));
    assert.equal(orders.size,1,`${id}: option order never depends on the condition`);
  }
});

test('localization: every key the renderer reads is in the catalog; labels are text, never raw ids; a missing catalog never shows ids',async()=>{
  const labels=json('content-src/locales/uz-latn/learner-interaction.json').labels;
  for(const k of CONDITION_UI_KEYS) assert.ok(labels[k],`${k} in the catalog`);
  for(const k of ['answer.equilibrium-perturbation.pressure-increase','answer.equilibrium-perturbation.temperature-increase','answer.equilibrium-system.haber','answer.manganese-medium.acidic','answer.manganese-medium.basic','answer.manganese-medium.neutral','answer.equilibrium-shift.products','answer.equilibrium-shift.reactants','answer.equilibrium-shift.no-shift']) assert.ok(labels[k],k);
  for(const id of P26_CONVERTED){
    const r=await run(id,[]); const st=r.finalState.condition;
    const m=toConditionRendererModel(await run(id,trial(st.targetCondition,st.outcomeOptions[0])),localize);
    assert.deepEqual(m.missingKeys,[],id);
    for(const c of m.conditions) assert.ok(!st.conditions.includes(c.label),`${id}: condition "${c.id}" shown raw`);
    const bare=toConditionRendererModel(r);
    assert.ok(bare.missingKeys.length>0);
    for(const c of bare.conditions) assert.match(c.label,/^#\d+$/,'no catalog → numbered label, never the id');
    assert.ok(!JSON.stringify(bare.conditions).includes('"label":"acidic"'));
  }
  assert.deepEqual(['Mn^2+','MnO2','MnO4^2-','MnO4^-'].map(formulaLabel),['Mn²⁺','MnO₂','MnO₄²⁻','MnO₄⁻'],'typography only');
  assert.throws(()=>toConditionRendererModel({finalState:{condition:{kind:'x'}}}),/CONDITION_RENDERER_MODEL_INPUT_INVALID/,'a non-condition result fails closed (host error boundary)');
});

// ------------------------------------------------------------------ no chemistry invented, bundle measured

test('no chemistry truth invented: record counts unchanged since P2.5; new text is display only (review pending)',()=>{
  assert.equal(expansion.newChemistryRecords,0);
  assert.deepEqual(expansion.chemistryRecordCounts,P25_BASELINE.chemistryRecords);
  assert.equal(json('content-src/chemistry/equilibrium.json').records.length,2);
  assert.equal(json('content-src/chemistry/manganese-redox.json').records.length,3);
  assert.equal(json('content-src/chemistry/kinetics.json').records.length,3,'no kinetics record added to unblock 11.16');
  assert.equal(expansion.newDisplayText.reviewStatus,'pending');
  assert.ok(expansion.newDisplayText.keys.every(k=>/^(ui\.cond-|answer\.equilibrium-(perturbation|system)\.)/.test(k)));
  // the haber system label restates the equation that the record's own explanation already gives
  assert.match(json('content-src/chemistry/equilibrium.json').records[0].explanation,/N2 \+ 3H2 ⇌ 2NH3/);
});

test('bundle impact is measured from the committed build, with no new dependency',()=>{
  const now=bundle(root);
  assert.deepEqual(expansion.bundleImpact.after,now);
  assert.equal(expansion.bundleImpact.delta.learnerModules,4,'condition-trial, condition-practice, renderer-model, renderer');
  assert.ok(expansion.bundleImpact.delta.learnerModuleBytes<64*1024,'well under 64 KB raw for the whole interaction');
  const pkg=json('package.json');
  assert.ok(!Object.keys({...pkg.dependencies,...pkg.devDependencies}).some(d=>/chart|d3|three|pixi|konva/.test(d)),'no visualization framework');
});
