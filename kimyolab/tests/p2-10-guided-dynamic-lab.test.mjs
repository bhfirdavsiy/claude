// P2.10 — Guided Dynamic Lab: inventory, action catalog, topic lab profile v1, lab runtime, guidance, order semantics,
// feature flag, content client, reports (generator-equal) and migration equivalence. ADR-P2-011.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyInstructionStep,LAB_ACTION_FAMILIES,INSTRUCTION_VERBS,familyKind,TOPIC_ACTION_KINDS} from '../src/domain/lab/action-catalog.ts';
import {topicLabProfileProblems,TOPIC_LAB_PROFILE_PACK_PATH} from '../src/domain/lab/topic-lab-profile.ts';
import {createLabRuntime,createLabState,availableActions,observationGrounding} from '../src/domain/lab/lab-runtime.ts';
import {createLabDomain} from '../src/domain/lab/lab-domain.ts';
import {compileTopicLabProfiles} from '../scripts/lib/topic-lab-profiles.ts';
import {guidedDynamicLabOutputs,LAB_REPORTS} from '../scripts/guided-dynamic-lab.ts';
import {FEATURE_FLAGS,isFeatureEnabled} from '../src/app/feature-flags.ts';
import {parseAppRoute} from '../src/app/routes.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {memoryPackFetch} from './helpers/memory-pack.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const clone=(v)=>JSON.parse(JSON.stringify(v));
const {profiles}=compileTopicLabProfiles(root);
const P=Object.fromEntries(profiles.map(p=>[p.activityId.replace('practice.experiment.',''),p]));
const chemistry={reactions:json('content-src/chemistry/reactions.json'),solutionRules:json('content-src/chemistry/solubility.json'),species:json('content-src/chemistry/species.json'),electrolysis:json('content-src/chemistry/electrolysis.json'),conditionVocabulary:json('content-src/chemistry/condition-vocabulary.json')};
const rt=createLabRuntime(createLabDomain(chemistry));
function run(profile,actions,runtime=rt){ let s=createLabState(profile); const out=[]; for(const a of actions){ const r=runtime.applyLabAction(s,a,profile); out.push(r); s=r.nextState; } return {state:s,results:out}; }
const add=(substance,container,quantity)=>({family:'ADD_SUBSTANCE',params:{substance,container,...(quantity!==undefined?{quantity}:{})}});
const on=(family,params)=>({family,params});
const SALT_72=[on('SETUP_APPARATUS',{apparatus:'beaker'}),add('water','beaker'),add('contaminated-salt','beaker'),on('SETUP_APPARATUS',{apparatus:'glass-rod'}),on('MIX',{container:'beaker'}),on('SETUP_APPARATUS',{apparatus:'funnel'}),on('SETUP_APPARATUS',{apparatus:'filter-paper'}),on('SETUP_APPARATUS',{apparatus:'receiver'}),on('FILTER',{container:'beaker'}),on('SETUP_APPARATUS',{apparatus:'spirit-lamp'}),on('SETUP_APPARATUS',{apparatus:'stand'}),on('SETUP_APPARATUS',{apparatus:'dish'}),on('EVAPORATE',{container:'receiver'}),on('OBSERVE',{target:'crystals'})];
const CELL_112=[add('cucl2-solution','cell'),on('SETUP_APPARATUS',{apparatus:'electrodes'}),on('SETUP_APPARATUS',{apparatus:'dc-source'}),on('ELECTRIC_CURRENT',{container:'cell'}),on('OBSERVE',{target:'cathode'}),on('OBSERVE',{target:'anode'})];

test('audit: every experiment is inventoried from the repository; every operation is mapped or an explicit gap',()=>{
  const inv=json(LAB_REPORTS.inventory);
  const experiments=json('content-src/practice-activities.json').filter(a=>a.type==='experiment').map(a=>a.id).sort();
  assert.deepEqual(inv.experiments.map(e=>e.activityId).sort(),experiments);
  assert.equal(inv.summary.operations,inv.summary.mapped+inv.summary.ambiguous+inv.summary.unmapped);
  for(const e of inv.experiments){
    for(const k of ['activityId','learningUnitIds','instructionSource','apparatus','substances','quantities','steps','observations','safetyNotes','grounding','runtime','renderer','orderSemantics','guidanceSemantics','externalLabs','gaps']) assert.ok(k in e,`${e.activityId}: ${k}`);
    for(const s of e.steps) for(const o of s.operations){
      assert.ok(['MAPPED','AMBIGUOUS','UNMAPPED_OPERATION'].includes(o.status));
      if(o.status==='UNMAPPED_OPERATION') assert.ok(e.gaps.some(g=>g.startsWith('UNMAPPED_OPERATION')),`${e.activityId}: unmapped without a gap`);
    }
    // external labs: listed, never given a role without evidence
    for(const x of e.externalLabs) assert.equal(x.proposedRole,null);
  }
  // order is never inferred: the generic runtime's array-position order is reported as a GAP, not as a declared order
  assert.ok(inv.experiments.filter(e=>e.orderSemantics.kind==='SEQUENTIAL_BY_ARRAY_POSITION').every(e=>e.gaps.includes('ORDER_FROM_ARRAY_POSITION')));
  // the six P2.9 order questions are carried forward unanswered
  assert.deepEqual(inv.summary.openOrderDecisions,['practice.experiment.10.3','practice.experiment.10.5','practice.experiment.10.8','practice.experiment.10.9','practice.experiment.11.2','practice.experiment.9.10']);
});

test('lexicon: classification only; unknown verbs and steps without a verb are UNMAPPED, ambiguous ones need context',()=>{
  assert.deepEqual(classifyInstructionStep('Filtratni chinni kosachaga quying va bug‘lating.').map(o=>o.family),['ADD_SUBSTANCE','EVAPORATE']);
  assert.equal(classifyInstructionStep('Kondensatni yig‘ing.')[0].status,'AMBIGUOUS');
  assert.equal(classifyInstructionStep('Gaz o‘tkazgichli apparatni yig‘ing.')[0].family,'SETUP_APPARATUS');
  // P2.10 closeout: was UNMAPPED_OPERATION. A prohibition is classified as a SAFETY_RULE (not a learner action)
  assert.deepEqual(classifyInstructionStep('Probirkani o‘zingizga qaratmang.').map(o=>[o.family,o.status]),[['SAFETY_PROHIBITION','MAPPED']]);
  assert.equal(classifyInstructionStep('Probirkani yuving.')[0].family,'WASH');
  assert.deepEqual(classifyInstructionStep('Darslikdagi rasm.'),[{verb:'',family:null,status:'UNMAPPED_OPERATION'}]);
  // genitive nouns are not verbs; a listed verb ending in -ning is
  assert.equal(classifyInstructionStep('Suvning rangi.')[0].status,'UNMAPPED_OPERATION');
  assert.equal(classifyInstructionStep('Bosqichlarni o‘rganing.')[0].family,'STUDY');
  const families=new Set(LAB_ACTION_FAMILIES.map(d=>d.family));
  for(const rule of Object.values(INSTRUCTION_VERBS)) assert.ok(families.has(rule.family));
  assert.equal(new Set(LAB_ACTION_FAMILIES.map(d=>d.id)).size,LAB_ACTION_FAMILIES.length);
});

test('profile v1: compiled profiles are valid, never chemistry truth, derived from content; violations fail closed',()=>{
  assert.deepEqual(profiles.map(p=>p.activityId).sort(),['practice.experiment.11.2','practice.experiment.7.2','practice.experiment.8.1']);
  for(const p of profiles){ assert.deepEqual(topicLabProfileProblems(p),[]); assert.equal(p.chemistryTruth,false); assert.equal(p.guidance.revealsFinalAnswer,false); }
  // derived, not duplicated: the shelf and target come from the config, the steps from legacyContent
  const ref=json('content-src/activity-configs/reference-slices.json');
  assert.deepEqual(P['8.1'].chemistry.reagentShelf,ref['practice.experiment.8.1'].reagentShelf);
  assert.equal(P['8.1'].chemistry.targetReactionId,ref['practice.experiment.8.1'].reactionId);
  const a72=json('content-src/practice-activities.json').find(a=>a.id==='practice.experiment.7.2');
  assert.deepEqual(P['7.2'].instruction.steps.map(s=>s.text),a72.legacyContent.steps);
  // order: STRICT dependencies are exactly the config's declared ones; unordered profiles carry none
  assert.deepEqual(P['7.2'].procedure.steps.map(s=>[s.id,s.dependencies]),ref['practice.experiment.7.2'].scenario.steps.map(s=>[s.id,s.dependencies]));
  assert.ok(P['11.2'].procedure.steps.every(s=>s.dependencies.length===0));
  assert.equal(P['11.2'].procedure.humanDecision.selected,null);
  assert.equal(P['11.2'].procedure.humanDecision.packet,'review-packets/feedback-semantics/practice.experiment.11.2.md');
  const bad=(mut)=>{ const p=clone(P['7.2']); mut(p); return topicLabProfileProblems(p); };
  assert.ok(bad(p=>{p.chemistryTruth=true;}).includes('CHEMISTRY_TRUTH_MUST_BE_FALSE'));
  assert.ok(bad(p=>{p.allowedFamilies.push('NOT_A_FAMILY');}).includes('FAMILY_UNKNOWN:NOT_A_FAMILY'));
  assert.ok(bad(p=>{p.safety.forbiddenFamilies=['MIX'];}).includes('FAMILY_ALLOWED_AND_FORBIDDEN:MIX'));
  assert.ok(bad(p=>{p.procedure.steps[0].dependencies=['observe'];}).includes('ORDER_CYCLE'));
  assert.ok(bad(p=>{p.procedure.mode='FLEXIBLE';}).includes('ORDER_DEPENDENCIES_WITHOUT_DECLARED_ORDER'));
  assert.ok(bad(p=>{p.guidance.revealsFinalAnswer=true;}).includes('GUIDANCE'));
  const h=clone(P['11.2']); h.procedure.humanDecision.selected='A'; assert.ok(topicLabProfileProblems(h).includes('HUMAN_DECISION_PRESELECTED_OR_MISSING'));
  // the pack ships exactly the compiled profiles
  const pointer=json('public/content/manifest.json');
  assert.deepEqual(json(`public/content/${pointer.activeVersion}/${TOPIC_LAB_PROFILE_PACK_PATH}`),compileTopicLabProfiles(root));
});

test('8.1: precipitation via evaluateIonicMixing; FILTER rejected in topic; unsupported fails closed; completion; replay',()=>{
  const p=P['8.1'];
  const filter=run(p,[on('FILTER',{container:'tube-1'})]).results[0];
  assert.equal(filter.status,'rejected'); assert.equal(filter.error.code,'ACTION_NOT_ALLOWED_IN_TOPIC');
  assert.deepEqual(filter.nextState,createLabState(p));                      // a rejection never changes the state
  const ternary=run(p,[add('bacl2','tube-1'),add('h2so4','tube-1'),add('nano3','tube-1')]).results[2];
  assert.equal(ternary.status,'unsupported'); assert.equal(ternary.unsupported.code,'UNSUPPORTED_CHEMISTRY');
  const notModeled=run(p,[add('nacl','tube-2'),add('nano3','tube-2'),on('MIX',{container:'tube-2'})]).results[2];
  assert.equal(notModeled.status,'unsupported'); assert.deepEqual(notModeled.observations,[]);   // nothing invented
  const {state,results}=run(p,[add('agno3','tube-1'),add('nacl','tube-1'),on('MIX',{container:'tube-1'}),on('RECORD',{container:'tube-1',text:'Ag+ + Cl- -> AgCl'})]);
  assert.deepEqual(results[2].observations.map(o=>[o.kind,o.data,o.producedBy]),[['precipitate',{type:'precipitate',color:'white'},'ReactionMatcher']]);
  assert.equal(state.complete,true); assert.equal(results[3].evidenceCandidate.kind,'completion'); assert.equal(results[3].evidenceCandidate.persisted,false);
  assert.deepEqual(rt.replay(p,state.actionLog),state);
  assert.deepEqual(rt.reset(p),createLabState(p));
});

test('11.2: ElectrolysisModel only; no process before current; an unmodeled query is UNSUPPORTED_CHEMISTRY',()=>{
  const p=P['11.2'];
  const early=run(p,[on('OBSERVE',{target:'cathode'})]).results[0];
  assert.equal(early.guidance.code,'NO_PROCESS_YET'); assert.deepEqual(early.observations,[]); assert.deepEqual(early.nextState.observedTargets,[]);
  const {state}=run(p,CELL_112);
  assert.equal(state.complete,true);
  assert.deepEqual(state.observations.map(o=>[o.target,o.data.product,o.producedBy]),[['cathode','Cu','ElectrolysisModel'],['anode','Cl2','ElectrolysisModel']]);
  const active=clone(p); active.chemistry.query.electrode='active';
  const r=run(active,CELL_112.slice(0,4)).results[3];
  assert.equal(r.status,'unsupported'); assert.equal(r.unsupported.detail,'ELECTROLYSIS_NOT_MODELED'); assert.equal(r.nextState.current.on,false);
});

test('7.2: STRICT declared order, instruction quantity, apparatus preconditions, dissolution from the solubility data',()=>{
  const p=P['7.2'];
  const early=run(p,[add('water','beaker')]).results[0];
  assert.equal(early.error.code,'PROCEDURE_BLOCKED'); assert.deepEqual(early.procedural.blockedBy,['apparatus']); assert.equal(early.guidance.category,'procedural-dependency');
  const limit=run(p,[on('SETUP_APPARATUS',{apparatus:'beaker'}),add('water','beaker',50)]).results[1];
  assert.equal(limit.error.code,'QUANTITY_LIMIT');
  const rod=run(p,SALT_72.slice(0,3).concat([on('MIX',{container:'beaker'})])).results[3];
  assert.equal(rod.error.code,'APPARATUS_NOT_SET_UP');
  const filterEarly=run(p,[on('SETUP_APPARATUS',{apparatus:'funnel'}),on('SETUP_APPARATUS',{apparatus:'filter-paper'}),on('SETUP_APPARATUS',{apparatus:'receiver'}),on('FILTER',{container:'beaker'})]).results[3];
  assert.equal(filterEarly.error.code,'PROCEDURE_BLOCKED');
  const {state}=run(p,SALT_72);
  assert.equal(state.complete,true);
  assert.deepEqual(state.observations.map(o=>[o.target,o.producedBy]),[['dissolved','IonicEngine'],['turbid','INSTRUCTION_TEXT'],['filtrate','INSTRUCTION_TEXT'],['crystals','INSTRUCTION_TEXT']]);
  assert.deepEqual(rt.replay(p,state.actionLog),state);
  // without the solubility rule the dissolution is not modeled → fail closed, no dissolved state
  const noRule=createLabRuntime(createLabDomain({...chemistry,solutionRules:{...chemistry.solutionRules,dissociation:chemistry.solutionRules.dissociation.filter(d=>d.formula!=='NaCl')}}));
  const r=run(p,SALT_72.slice(0,5),noRule).results[4];
  assert.equal(r.status,'unsupported'); assert.equal(r.unsupported.detail,'DISSOLUTION_NOT_MODELED');
  assert.ok(!r.nextState.containers.beaker.contents.some(e=>e.form==='dissolved'));
});

test('guidance 1–4: more help per level, the instruction’s next action only where an order is declared, never the answer',()=>{
  const s=createLabState(P['7.2']);
  const g=[1,2,3,4].map(l=>rt.guidance(s,P['7.2'],l));
  assert.deepEqual(g[0].possibleFamilies,[]); assert.ok(g[1].possibleFamilies.length);
  assert.deepEqual(g[1].recommended,[]); assert.deepEqual(g[2].recommended.map(r=>r.step),['apparatus']);
  assert.ok(g[3].instructionText[0].startsWith('20 ml')); assert.ok(g[3].blocked.length);
  const done=run(P['8.1'],[add('agno3','tube-1'),add('nacl','tube-1'),on('MIX',{container:'tube-1'})]).state;
  const text=JSON.stringify([1,2,3,4].map(l=>rt.guidance(done,P['8.1'],l)));
  assert.ok(!/AgCl|Ag\+|Cl-|→/.test(text),'guidance must not contain the equation');
  for(const l of [1,2,3,4]) assert.equal(rt.guidance(done,P['8.1'],l).revealsAnswer,false);
  const h=rt.guidance(createLabState(P['11.2']),P['11.2'],3);
  assert.equal(h.ordered,false); assert.equal(h.orderDecisionOpen,true);
  // availability classifies, the domain decides: an unavailable option is still rejected by applyLabAction
  const options=availableActions(s,P['7.2']);
  assert.ok(options.some(o=>o.category==='procedural-dependency')&&options.some(o=>o.category==='recommended'));
});

test('feature flag guidedDynamicLabV1: off by default, only an explicit ?ff= enables it; route parsing',()=>{
  assert.equal(FEATURE_FLAGS.guidedDynamicLabV1.default,false);
  assert.equal(isFeatureEnabled('guidedDynamicLabV1',new URLSearchParams('')),false);
  assert.equal(isFeatureEnabled('guidedDynamicLabV1',new URLSearchParams('ff=other')),false);
  assert.equal(isFeatureEnabled('guidedDynamicLabV1',new URLSearchParams('ff=a,guidedDynamicLabV1')),true);
  assert.deepEqual(parseAppRoute('/dynamic-lab/practice.experiment.8.1'),{name:'dynamic-lab',practiceActivityId:'practice.experiment.8.1'});
  assert.equal(parseAppRoute('/dynamic-lab/practice.simulation.7.02.planned').name,'not-found');
  assert.deepEqual(parseAppRoute('/practice/practice.experiment.8.1'),{name:'practice',practiceActivityId:'practice.experiment.8.1'});
});

test('content client: profile integrity-checked; none → null; an invalid profile fails closed',async()=>{
  const ok=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  assert.equal((await ok.loadTopicLabProfile('practice.experiment.8.1')).profileId,'lab-profile.8.1.chloride-precipitation');
  assert.equal(await ok.loadTopicLabProfile('practice.experiment.7.1'),null);
  const broken=new ContentClient({fetchImpl:memoryPackFetch({[TOPIC_LAB_PROFILE_PACK_PATH]:(pack)=>({...pack,profiles:pack.profiles.map(p=>({...p,chemistryTruth:true}))})}),baseUrl:'/content'});
  await assert.rejects(()=>broken.loadTopicLabProfile('practice.experiment.8.1'),/TOPIC_LAB_PROFILE_INVALID/);
});

test('no progress, login or IChO: the dynamic lab writes nothing; the renderer never mutates chemistry state itself',()=>{
  const src=read('src/features/dynamic-lab/render.ts');
  assert.ok(!/progress|indexeddb|evidence\/types|storage/i.test(src.replace(/\/\/.*$/gm,'')),'no persistence imports');
  assert.ok(/state=r\.nextState/.test(src));
  const boot=read('src/app/bootstrap.ts');
  const dyn=boot.slice(boot.indexOf("route.name==='dynamic-lab'"),boot.indexOf("route.name==='learning-unit'"));
  assert.ok(!/progressService/.test(dyn),'the dynamic lab route never touches the progress service');
  for(const f of ['src/domain/lab/lab-runtime.ts','src/features/dynamic-lab/render.ts','content-src/topic-lab-profiles.json']) assert.ok(!/IChO|login|leaderboard|streak/i.test(read(f)));
});

test('reports equal the generator; equivalence keeps every old runtime (none is MIGRATION_EQUIVALENT)',async()=>{
  const outputs=await guidedDynamicLabOutputs(root);
  for(const [rel,body] of Object.entries(outputs)) assert.equal(read(rel),body,`${rel} is stale: run npm run lab:inventory`);
  const eq=JSON.parse(outputs[LAB_REPORTS.equivalence]);
  assert.equal(eq.summary.migrationEquivalent,0);
  for(const s of eq.slices){ assert.equal(s.decision,'KEEP_OLD_RUNTIME'); assert.ok(s.blockingDimensions.includes('evidence')); assert.equal(s.newOnly.replayDeterministic,true); }
  const s81=eq.slices.find(s=>s.activityId==='practice.experiment.8.1');
  assert.equal(s81.dimensions.chemistryResult.status,'EQUIVALENT'); assert.equal(s81.dimensions.completion.status,'EQUIVALENT');
  const readiness=JSON.parse(outputs[LAB_REPORTS.readiness]);
  assert.equal(readiness.decision,'NOT_A_RELEASE_OR_PILOT_DECISION');
  assert.ok(readiness.humanDecisions.every(h=>h.selected===null));
  assert.equal(readiness.featureFlag.default,false);
});

// ------------------------------------------------------------------ P2.10 closeout

test('closeout 8.1: WASH is not in the instruction → ACTION_NOT_ALLOWED_IN_TOPIC; RESET restores the initial state; another pair after restart',()=>{
  const p=P['8.1'];
  const a81=json('content-src/practice-activities.json').find(a=>a.id==='practice.experiment.8.1');
  const families=a81.legacyContent.steps.flatMap(t=>classifyInstructionStep(t).map(o=>o.family));
  assert.ok(!families.includes('WASH'),'the instruction neither contains nor authorizes WASH');
  assert.ok(!p.allowedFamilies.includes('WASH'));
  assert.ok(!availableActions(createLabState(p),p).some(o=>o.action.family==='WASH'),'never offered');
  const used=run(p,[add('nacl','tube-1'),add('nano3','tube-1'),on('MIX',{container:'tube-1'})]).state;
  const wash=rt.applyLabAction(used,on('WASH',{container:'tube-1'}),p);
  assert.equal(wash.status,'rejected'); assert.equal(wash.error.code,'ACTION_NOT_ALLOWED_IN_TOPIC'); assert.deepEqual(wash.nextState,used);
  // retry = the lab-level RESET (createLabState): the initial state, no reverse chemistry
  const reset=rt.reset(p);
  assert.deepEqual(reset,createLabState(p)); assert.deepEqual(reset.engine.ionicActions,[]); assert.deepEqual(reset.observations,[]);
  // after restarting, the learner tests another pair in the same tube
  let s=reset;
  for(const a of [add('agno3','tube-1'),add('nacl','tube-1'),on('MIX',{container:'tube-1'})]){ const r=rt.applyLabAction(s,a,p); assert.equal(r.status,'accepted'); s=r.nextState; }
  assert.equal(s.containers['tube-1'].mixed.reactionId,'rxn.agno3-nacl');
  assert.ok(!p.gaps.some(g=>g.code==='ACTION_FROM_RUNTIME_NOT_INSTRUCTION'),'no runtime-only action is kept');
  const eq=json(LAB_REPORTS.equivalence).slices.find(x=>x.activityId==='practice.experiment.8.1');
  assert.equal(eq.newOnly.washInTopic,'ACTION_NOT_ALLOWED_IN_TOPIC');
});

test('closeout taxonomy: state / observation / learner response / control / safety are distinct kinds',()=>{
  const kinds=Object.fromEntries(LAB_ACTION_FAMILIES.map(d=>[d.family,d.kind]));
  for(const f of ['SETUP_APPARATUS','ADD_SUBSTANCE','TRANSFER','MIX','HEAT','STOP_HEAT','EVAPORATE','FILTER','SETTLE','SEPARATE','PASS_GAS','COLLECT_GAS','SEAL','IGNITE','BRING_NEAR','ELECTRIC_CURRENT','WAIT','WASH']) assert.equal(kinds[f],'STATE_ACTION',f);
  for(const f of ['OBSERVE','TEST']) assert.equal(kinds[f],'OBSERVATION_ACTION',f);
  for(const f of ['COMPARE','INFER','RECORD','EXPLAIN','STUDY','SELECT']) assert.equal(kinds[f],'LEARNER_RESPONSE',f);
  for(const f of ['RESET','CONTINUE']) assert.equal(kinds[f],'CONTROL',f);
  assert.equal(kinds.SAFETY_PROHIBITION,'SAFETY_RULE');
  // a learner response is judged only by a real checker; none is fabricated
  for(const d of LAB_ACTION_FAMILIES) if(d.kind!=='LEARNER_RESPONSE') assert.equal(d.checker,null,d.family);
  assert.deepEqual(LAB_ACTION_FAMILIES.filter(d=>d.checker).map(d=>d.family),['RECORD']);
  // in the runtime: a learner response without a checker is not "missing chemistry"
  const withExplain=clone(P['8.1']); withExplain.allowedFamilies.push('EXPLAIN');
  const r=rt.applyLabAction(createLabState(withExplain),on('EXPLAIN',{text:'…'}),withExplain);
  assert.equal(r.status,'unsupported'); assert.equal(r.unsupported.code,'LEARNER_RESPONSE_CHECKER_MISSING');
  const withHeat=clone(P['8.1']); withHeat.allowedFamilies.push('HEAT');
  assert.equal(rt.applyLabAction(createLabState(withHeat),on('HEAT',{container:'tube-1'}),withHeat).unsupported.code,'ACTION_UNSUPPORTED');
  // control and safety rules can never be topic actions
  for(const f of ['RESET','CONTINUE','SAFETY_PROHIBITION']){ const bad=clone(P['8.1']); bad.allowedFamilies.push(f); assert.ok(topicLabProfileProblems(bad).includes(`FAMILY_NOT_A_TOPIC_ACTION:${f}`),f); }
  for(const p of profiles) for(const f of p.allowedFamilies) assert.ok(TOPIC_ACTION_KINDS.has(familyKind(f)));
  const cat=json(LAB_REPORTS.catalog);
  for(const f of cat.families.filter(x=>x.kind==='LEARNER_RESPONSE')) assert.equal(f.domainHandler.required,false,f.family);
});

test('closeout coverage: learner responses are never handler blockers; physical gaps and unknown chemistry still block',()=>{
  const cov=json(LAB_REPORTS.coverage);
  const learner=new Set(['COMPARE','INFER','RECORD','EXPLAIN','STUDY','SELECT']);
  for(const r of cov.rows){
    for(const b of r.blockers){ const f=b.code.split(':')[1]; assert.ok(!(b.code.startsWith('NO_DOMAIN_HANDLER:')&&learner.has(f)),`${r.activityId}: ${b.code} must be a checker gap`); }
    if(r.status==='BLOCKED') assert.ok(r.blockers.length>0);
    if(r.status==='PROFILE_CANDIDATE') assert.equal(r.profileId,null,'a candidate is not profiled');
    for(const g of r.gaps) assert.ok(['LEARNER_RESPONSE_CHECKER_MISSING','HUMAN_DECISION_REQUIRED','SAFETY_RULE'].includes(g.category));
  }
  assert.ok(cov.rows.some(r=>r.gaps.some(g=>g.category==='LEARNER_RESPONSE_CHECKER_MISSING')));
  // physical operations without a safe implementation still block; unknown chemistry still blocks
  assert.ok(cov.rows.some(r=>r.blockers.some(b=>b.code==='NO_DOMAIN_HANDLER:HEAT')));
  assert.deepEqual(cov.rows.find(r=>r.activityId==='practice.experiment.9.10').blockers.map(b=>b.code),['INSTRUCTION_SUBSTANCE_NOT_MODELED:KI']);
  assert.ok(cov.rows.find(r=>r.activityId==='practice.experiment.8.2').blockers.some(b=>b.category==='CONTENT_REQUIRED'));
  assert.equal(cov.summary.PROFILED,3,'nothing was profiled by reclassification');
  assert.equal(cov.reclassification.before.summary.BLOCKED,54);
});

test('closeout black-swan: an instruction-derived observation is never MODEL_BASED',()=>{
  assert.equal(observationGrounding({producedBy:'INSTRUCTION_TEXT'}),'INSTRUCTION_TEXT');
  assert.equal(observationGrounding({producedBy:'PROCEDURE'}),'PROCEDURE');
  for(const a of ['ReactionMatcher','ElectrolysisModel','IonicEngine']) assert.equal(observationGrounding({producedBy:a}),'MODEL_BASED');
  const {state}=run(P['7.2'],SALT_72);
  const byTarget=Object.fromEntries(state.observations.map(o=>[o.target,o.grounding]));
  assert.deepEqual(byTarget,{dissolved:'MODEL_BASED',turbid:'INSTRUCTION_TEXT',filtrate:'INSTRUCTION_TEXT',crystals:'INSTRUCTION_TEXT'});
  for(const o of state.observations) assert.equal(o.grounding==='MODEL_BASED',['ReactionMatcher','ElectrolysisModel','IonicEngine'].includes(o.producedBy));
  const slice=json(LAB_REPORTS.readiness).slices.find(s=>s.activityId==='practice.experiment.7.2');
  assert.deepEqual(slice.observationGrounding,{turbid:'INSTRUCTION_TEXT',filtrate:'INSTRUCTION_TEXT',crystals:'INSTRUCTION_TEXT'});
  // the learning-depth classification of 7.2 is unchanged by the dynamic lab (never MODEL_BASED from instruction text)
  const lu=json('reports/learning-depth-baseline.json');
  assert.ok(!JSON.stringify(lu).includes('"activityId":"practice.experiment.7.2","role":"primary","depth":"MODEL_BASED"'));
});

test('closeout readiness: zero migrations is not an unmet P2.10 item; the migration gate belongs to P2.11, undecided',()=>{
  const r=json(LAB_REPORTS.readiness);
  assert.ok(!r.definitionOfDone.some(d=>/migration equivalence proven/.test(d.item)));
  assert.ok(r.definitionOfDone.filter(d=>d.status!=='HUMAN').every(d=>d.status==='MET'));
  const gate=r.futureGates.find(g=>g.gate==='P2.11 migration gate');
  assert.equal(gate.decision,null); assert.equal(gate.currentlyEquivalentSlices,0);
});
