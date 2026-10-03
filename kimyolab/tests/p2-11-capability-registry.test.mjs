// P2.11 — Instruction-driven runtime expansion & capability registry (ADR-P2-012): a versioned registry derived from
// the catalog, the runtime's handler declaration and the engine data; new procedure/condition handlers (HEAT, STOP_HEAT,
// SEAL, TRANSFER, PASS_GAS, COLLECT_GAS, WAIT); two new slices (7.10, 8.14); substance and capability coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LAB_ACTION_FAMILIES} from '../src/domain/lab/action-catalog.ts';
import {topicLabProfileProblems} from '../src/domain/lab/topic-lab-profile.ts';
import {createLabRuntime,createLabState,availableActions,HANDLER_SEMANTICS} from '../src/domain/lab/lab-runtime.ts';
import {createLabDomain} from '../src/domain/lab/lab-domain.ts';
import {buildCapabilityRegistry,registryProblems,resolveOperation,resolveSubstance,CAPABILITY_REGISTRY_SCHEMA,CAPABILITY_REGISTRY_VERSION} from '../src/domain/lab/capability-registry.ts';
import {compileTopicLabProfiles} from '../scripts/lib/topic-lab-profiles.ts';
import {guidedDynamicLabOutputs,LAB_REPORTS,loadRegistry} from '../scripts/guided-dynamic-lab.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const clone=(v)=>JSON.parse(JSON.stringify(v));
const {profiles}=compileTopicLabProfiles(root);
const P=Object.fromEntries(profiles.map(p=>[p.activityId.replace('practice.experiment.',''),p]));
const chemistry={reactions:json('content-src/chemistry/reactions.json'),solutionRules:json('content-src/chemistry/solubility.json'),species:json('content-src/chemistry/species.json'),electrolysis:json('content-src/chemistry/electrolysis.json'),conditionVocabulary:json('content-src/chemistry/condition-vocabulary.json')};
const rt=createLabRuntime(createLabDomain(chemistry));
const registry=loadRegistry(root);
function run(profile,actions){ let s=createLabState(profile); const out=[]; for(const a of actions){ const r=rt.applyLabAction(s,a,profile); out.push(r); s=r.nextState; } return {state:s,results:out}; }
const add=(substance,container)=>({family:'ADD_SUBSTANCE',params:{substance,container}});
const on=(family,params)=>({family,params});
const MG=[add('mg','tube-1'),add('h2so4-dilute','tube-1')];
const ZN=[add('zn','tube-2'),add('hcl-dilute','tube-2')];
const NH3=[add('nh4cl','reaction-tube'),add('slaked-lime','reaction-tube'),on('SEAL',{container:'reaction-tube'}),on('HEAT',{container:'reaction-tube'}),on('COLLECT_GAS',{container:'collector-tube'})];

test('registry: versioned, derived from catalog + runtime + engine data, consistent, deterministic',()=>{
  assert.equal(registry.schema,CAPABILITY_REGISTRY_SCHEMA); assert.equal(registry.version,CAPABILITY_REGISTRY_VERSION);
  assert.deepEqual(registryProblems(registry),[]);
  // derived: one capability per catalog family, handler iff the catalog says domainHandler and the runtime declares it
  assert.deepEqual(registry.actions.map(a=>a.family),LAB_ACTION_FAMILIES.map(d=>d.family));
  for(const a of registry.actions){ const d=LAB_ACTION_FAMILIES.find(x=>x.family===a.family); assert.equal(a.handler!=='NONE',d.domainHandler,a.family); assert.equal(a.kind,d.kind); }
  // the authorities come from the engine data, not from a hand list
  const rx=chemistry.reactions.reactions??chemistry.reactions;
  assert.equal(registry.authorities.ReactionMatcher.records,rx.length);
  assert.ok(registry.authorities.ReactionMatcher.reactantSets.some(r=>r.reactionId==='rxn.mg-h2so4'&&r.reactants.join('+')==='H2SO4+Mg'));
  assert.equal(registry.authorities.SchoolLabModel.scope,'STEP_BOUND_ONLY');
  // a family without safe semantics has no handler
  for(const f of ['TEST','SEPARATE','PREPARE_SUBSTANCE','BRING_NEAR','IGNITE','SETTLE','REPEAT']) assert.equal(registry.actions.find(a=>a.family===f).handler,'NONE',f);
  // the condition-dependent handlers declare the authority they need
  assert.equal(HANDLER_SEMANTICS.HEAT.requiresProfileAuthority,'reaction-matcher');
  assert.equal(registry.actions.find(a=>a.family==='PASS_GAS').requiresProfileAuthority,'reaction-matcher');
  // deterministic: same data, same registry
  assert.deepEqual(buildCapabilityRegistry(clone(chemistry)).actions,buildCapabilityRegistry(clone(chemistry)).actions);
  // no engine selector: nothing in the profile contract or the registry lets an author pick an engine
  assert.ok(!read('src/domain/lab/capability-registry.ts').includes('engineSelector'));
});

test('resolveOperation: instruction operation → capability → authority; ambiguous gets no family; unknown fails closed',()=>{
  const op=(family,status='MAPPED')=>({family,status});
  const mg=resolveOperation(registry,op('ADD_SUBSTANCE'),['Mg','H2SO4']);
  assert.equal(mg.status,'SUPPORTED'); assert.equal(mg.authority,'ReactionMatcher'); assert.match(mg.reason,/rxn\.mg-h2so4/);
  // each formula is known, but no record has exactly Cu + HCl → never "supported" by adding up knowledge
  assert.equal(resolveOperation(registry,op('HEAT'),['Cu','HCl']).status,'AUTHORITY_REQUIRED');
  assert.equal(resolveOperation(registry,op('ADD_SUBSTANCE'),['Xq9']).status,'AUTHORITY_REQUIRED');
  assert.deepEqual(resolveOperation(registry,{family:null,status:'AMBIGUOUS'}),{status:'AMBIGUOUS',family:null,authority:null,reason:'no context rule resolved the verb'});
  assert.equal(resolveOperation(registry,{family:null,status:'UNMAPPED_OPERATION'}).family,null);
  assert.equal(resolveOperation(registry,op('COMPARE')).status,'LEARNER_RESPONSE');
  assert.equal(resolveOperation(registry,op('RECORD')).authority,'checker');
  assert.equal(resolveOperation(registry,op('RESET')).status,'CONTROL');
  assert.equal(resolveOperation(registry,op('SAFETY_PROHIBITION')).status,'SAFETY_RULE');
  assert.equal(resolveOperation(registry,op('TEST')).status,'UNSUPPORTED_ACTION');
  for(const f of ['COLLECT_GAS','SEAL','WAIT','STOP_HEAT']) assert.equal(resolveOperation(registry,op(f)).status,'PROCEDURE_ONLY',f);
  // no formula in the step: never claimed as SUPPORTED
  assert.equal(resolveOperation(registry,op('HEAT')).status,'AUTHORITY_AT_RUNTIME');
  assert.match(resolveOperation(registry,op('HEAT')).reason,/only under a reaction-matcher profile/);
  // the coverage report resolves every one of the 350 operations, with the same function
  const cap=json(LAB_REPORTS.capability);
  assert.equal(cap.summary.operations,json(LAB_REPORTS.inventory).summary.operations);
  assert.equal(cap.registry.version,CAPABILITY_REGISTRY_VERSION); assert.deepEqual(cap.registry.problems,[]);
  for(const r of cap.rows) for(const o of r.operations) if(o.status==='AMBIGUOUS'||o.status==='UNMAPPED') assert.equal(o.family,null);
});

test('substance coverage: instruction substance → species → authority; 9.10 KI is never silently supported',()=>{
  assert.equal(resolveSubstance(registry,'KI').status,'KNOWN');
  assert.equal(resolveSubstance(registry,'Xq9').status,'UNKNOWN_SUBSTANCE');
  const sub=json(LAB_REPORTS.substances);
  const r910=sub.rows.find(r=>r.activityId==='practice.experiment.9.10');
  assert.equal(r910.boundAuthority,'electrolysis');
  assert.equal(r910.materials.find(m=>m.formula==='KI').status,'KNOWN_TO_OTHER_AUTHORITY');
  assert.deepEqual(json(LAB_REPORTS.coverage).rows.find(r=>r.activityId==='practice.experiment.9.10').blockers.map(b=>b.code),['INSTRUCTION_SUBSTANCE_NOT_MODELED:KI']);
  // Uzbek names are never guessed into species
  for(const r of sub.rows) for(const m of r.materials) if(m.formula===null) assert.equal(m.status,'NAME_NOT_RESOLVED');
  // the new slices' substances are covered by the authority they are bound to
  for(const id of ['practice.experiment.7.10','practice.experiment.8.14']) for(const s of sub.rows.find(r=>r.activityId===id).profileSubstances) assert.ok(s.authorities.includes('ReactionMatcher'),`${id}: ${s.id}`);
});

test('7.10: ReactionMatcher under the actual conditions; gas collected from its tube; Cu + HCl fails closed even when heated',()=>{
  const p=P['7.10'];
  assert.deepEqual(topicLabProfileProblems(p),[]); assert.equal(p.chemistryTruth,false); assert.equal(p.chemistry.authority,'reaction-matcher');
  const a=run(p,MG);
  assert.equal(a.results[1].status,'accepted');
  assert.deepEqual(a.state.containers['tube-1'].gases.map(g=>[g.product,g.reactionId]),[['H2','rxn.mg-h2so4']]);
  const obs=a.results[1].observations.find(o=>o.producedBy==='ReactionMatcher');
  assert.equal(obs.kind,'gas'); assert.equal(obs.grounding,'MODEL_BASED'); assert.equal(obs.source,'chemistry/reactions.json#rxn.mg-h2so4');
  // nothing to collect before a gas exists; collecting needs a gas-collection vessel
  assert.equal(rt.applyLabAction(createLabState(p),on('COLLECT_GAS',{container:'gas-collector'}),p).error.detail,'NO_GAS_TO_COLLECT');
  assert.equal(rt.applyLabAction(a.state,on('COLLECT_GAS',{container:'tube-2'}),p).error.detail,'NOT_A_GAS_COLLECTION_VESSEL');
  // two gas sources: the learner chooses one (one option per source); without a choice the action is rejected
  const two=run(p,[...MG,...ZN]);
  assert.equal(rt.applyLabAction(two.state,on('COLLECT_GAS',{container:'gas-collector'}),p).error.detail,'GAS_SOURCE_REQUIRED');
  assert.deepEqual(availableActions(two.state,p).filter(o=>o.action.family==='COLLECT_GAS'&&o.action.params.container==='gas-collector').map(o=>o.action.params.from),['tube-1','tube-2']);
  const c=rt.applyLabAction(two.state,on('COLLECT_GAS',{container:'gas-collector',from:'tube-1'}),p);
  assert.equal(c.observations[0].kind,'gas-collected'); assert.equal(c.observations[0].grounding,'PROCEDURE');
  assert.equal(rt.applyLabAction(c.nextState,on('COLLECT_GAS',{container:'gas-collector',from:'tube-1'}),p).error.detail,'NO_GAS_IN_SOURCE');
  // Cu + dilute HCl: no record → no observation, no product, even after heating
  const cu=run(p,[add('cu','tube-3'),add('hcl-dilute','tube-3'),on('HEAT',{container:'tube-3'})]);
  assert.equal(cu.results[1].status,'unsupported'); assert.equal(cu.results[1].unsupported.detail,'REACTION_NOT_MODELED');
  assert.equal(cu.results[2].status,'unsupported');
  assert.equal(cu.state.observations.filter(o=>o.container==='tube-3').length,0);
  assert.equal(cu.state.containers['tube-3'].gases.length,0);
  // completion: both bound reactions observed and a modeled gas collected
  const full=run(p,[...MG,on('COLLECT_GAS',{container:'gas-collector',from:'tube-1'}),...ZN]);
  assert.equal(full.state.complete,true);
  assert.equal(run(p,[...MG,...ZN]).state.complete,false,'no gas collected yet');
  // replay is deterministic
  assert.deepEqual(rt.replay(p,full.state.actionLog),full.state);
});

test('7.10 fail closed: a condition the instruction does not declare is never assumed',()=>{
  const p=clone(P['7.10']);
  // the dilute-acid condition comes from the instruction (“suyultirilgan H2SO4”); without it the record does not apply
  p.substances.find(s=>s.id==='h2so4-dilute').declaredConditions=[];
  const r=run(p,MG).results[1];
  assert.equal(r.status,'unsupported'); assert.match(r.unsupported.detail,/^REACTION_CONDITION/);
  assert.equal(run(p,MG).state.containers['tube-1'].gases.length,0);
  // MIX is not in the 7.10 instruction → rejected at the domain boundary, state unchanged
  const s=run(P['7.10'],MG).state;
  const bad=rt.applyLabAction(s,on('MIX',{container:'tube-1'}),P['7.10']);
  assert.equal(bad.error.code,'ACTION_NOT_ALLOWED_IN_TOPIC'); assert.deepEqual(bad.nextState,s);
});

test('8.14: heating is the gate (the record requires gentle heating); seal, heat, collect; replay',()=>{
  const p=P['8.14'];
  assert.deepEqual(topicLabProfileProblems(p),[]);
  assert.equal(p.limits.heating.level,'gently-heated'); assert.match(p.limits.heating.source,/biroz qizdiring/);
  const cold=run(p,NH3.slice(0,2));
  assert.equal(cold.results[1].status,'unsupported'); assert.equal(cold.results[1].unsupported.detail,'REACTION_CONDITIONS_NOT_MET');
  assert.equal(cold.state.containers['reaction-tube'].gases.length,0);
  assert.equal(rt.applyLabAction(cold.state,on('COLLECT_GAS',{container:'collector-tube'}),p).error.detail,'NO_GAS_TO_COLLECT');
  const all=run(p,NH3);
  assert.deepEqual(all.results.map(r=>r.status),['accepted','unsupported','accepted','accepted','accepted']);
  assert.deepEqual(all.state.containers['reaction-tube'].gases.map(g=>[g.product,g.reactionId]),[['NH3','rxn.nh4cl-caoh2']]);
  assert.equal(all.state.containers['reaction-tube'].sealed,true);
  assert.equal(all.state.complete,true);
  assert.equal(rt.applyLabAction(all.state,on('SEAL',{container:'reaction-tube'}),p).error.detail,'ALREADY_SEALED');
  assert.equal(rt.applyLabAction(all.state,on('HEAT',{container:'reaction-tube'}),p).error.detail,'ALREADY_HEATED');
  assert.equal(rt.applyLabAction(createLabState(p),on('HEAT',{container:'reaction-tube'}),p).error.detail,'CONTAINER_EMPTY');
  assert.deepEqual(rt.replay(p,all.state.actionLog),all.state);
  // the school lab model stays step-bound and its conflicting observation is a recorded human decision, not resolved here
  assert.ok(p.gaps.some(g=>g.code==='INSTRUCTION_MODEL_OBSERVATION_CONFLICT'));
  assert.ok(json(LAB_REPORTS.readiness).humanDecisions.some(d=>d.activityId==='practice.experiment.8.14'&&d.selected===null));
});

test('procedure handlers: STOP_HEAT, TRANSFER, PASS_GAS, WAIT — deterministic, and chemistry only from an authority',()=>{
  const p=clone(P['7.10']); p.allowedFamilies.push('TRANSFER','PASS_GAS','WAIT','STOP_HEAT');
  // TRANSFER brings the acid to the metal: the reaction is evaluated in the receiving tube
  const t=run(p,[add('zn','tube-1'),add('hcl-dilute','tube-2'),on('TRANSFER',{from:'tube-2',to:'tube-1'})]);
  assert.equal(t.results[2].status,'accepted');
  assert.equal(t.state.containers['tube-2'].contents.length,0);
  assert.deepEqual(t.state.containers['tube-1'].reactions.map(r=>[r.reactionId,r.outcome]),[['rxn.zn-hcl','reaction']]);
  assert.equal(rt.applyLabAction(t.state,on('TRANSFER',{from:'tube-2',to:'tube-3'}),p).error.detail,'SOURCE_EMPTY');
  assert.equal(rt.applyLabAction(t.state,on('TRANSFER',{from:'tube-1',to:'tube-1'}),p).error.detail,'SAME_CONTAINER');
  // PASS_GAS: H2 into a tube with Mg — no record → fails closed (no invented chemistry)
  const g=rt.applyLabAction(run(p,[add('zn','tube-1'),add('hcl-dilute','tube-1'),add('mg','tube-2')]).state,on('PASS_GAS',{from:'tube-1',to:'tube-2'}),p);
  assert.equal(g.status,'unsupported'); assert.equal(g.unsupported.detail,'REACTION_NOT_MODELED');
  assert.equal(rt.applyLabAction(createLabState(p),on('PASS_GAS',{from:'tube-1',to:'tube-2'}),p).error.detail,'NO_GAS_IN_SOURCE');
  // WAIT: accepted, nothing changes (no time model)
  const s=run(p,MG).state; const w=rt.applyLabAction(s,on('WAIT',{}),p);
  assert.equal(w.status,'accepted'); assert.equal(w.guidance.code,'NO_TIME_MODEL'); assert.deepEqual(w.nextState.containers,s.containers);
  // STOP_HEAT
  const h=run(p,[add('zn','tube-2'),on('HEAT',{container:'tube-2'}),on('STOP_HEAT',{container:'tube-2'})]);
  assert.equal(h.state.containers['tube-2'].heating,null);
  assert.equal(rt.applyLabAction(h.state,on('STOP_HEAT',{container:'tube-2'}),p).error.detail,'NOT_HEATED');
  // under any other authority the condition-dependent handlers fail closed
  const ionic=clone(P['8.1']); ionic.allowedFamilies.push('PASS_GAS');
  assert.equal(rt.applyLabAction(createLabState(ionic),on('PASS_GAS',{from:'tube-1',to:'tube-2'}),ionic).unsupported.detail,'GAS_REACTION_NOT_ORCHESTRATED');
});

test('instruction is authoritative: profiles offer only families the instruction contains; nothing extra is inferred',()=>{
  const inv=json(LAB_REPORTS.inventory);
  for(const p of [P['7.10'],P['8.14']]){
    const fams=new Set(inv.experiments.find(e=>e.activityId===p.activityId).steps.flatMap(s=>s.operations).filter(o=>o.status==='MAPPED').map(o=>o.family));
    for(const f of p.allowedFamilies) assert.ok(fams.has(f),`${p.activityId}: ${f} is not in the instruction`);
    for(const s of p.procedure.steps) assert.ok(s.instructionStep===null||p.instruction.steps[s.instructionStep],`${p.activityId}: ${s.id}`);
  }
  // 7.10's gas test (“gugurt alangasi bilan tekshiring”) has no safe handler: it is a gap, not a guessed action
  assert.ok(!P['7.10'].allowedFamilies.includes('TEST')); assert.ok(P['7.10'].gaps.some(g=>g.code==='TEST_NOT_OFFERED'));
  // missing quantities stay unspecified
  assert.deepEqual(P['8.14'].limits.quantities,[]);
});

test('learner-facing strings: every new code and label is in the Uzbek catalog; no engine or developer names',()=>{
  const labels=json('content-src/locales/uz-latn/learner-interaction.json').labels;
  for(const p of [P['7.10'],P['8.14']]) for(const k of [...p.apparatus,...p.substances,...p.observationTargets].map(x=>x.labelKey)) assert.ok(labels[k],k);
  for(const f of ['TRANSFER','PASS_GAS','WAIT','HEAT','STOP_HEAT','SEAL','COLLECT_GAS']) assert.ok(labels[`ui.dlab-family-${f}`],f);
  const runtime=read('src/domain/lab/lab-runtime.ts');
  for(const code of ['CONTAINER_EMPTY','ALREADY_HEATED','NOT_HEATED','ALREADY_SEALED','SAME_CONTAINER','SOURCE_EMPTY','TARGET_EMPTY','NO_GAS_IN_SOURCE','NO_GAS_TO_COLLECT','GAS_SOURCE_REQUIRED','NOT_A_GAS_COLLECTION_VESSEL','HEATING_NOT_ORCHESTRATED','GAS_REACTION_NOT_ORCHESTRATED','HEATING_EFFECT_NOT_MODELED','NO_TIME_MODEL']){ assert.ok(runtime.includes(`'${code}'`),code); assert.ok(labels[`ui.dlab-reason-${code}`],code); }
  for(const code of ['REACTION_CONDITIONS_NOT_MET','REACTION_CONDITION_REQUIRED']) assert.ok(labels[`ui.dlab-reason-${code}`],code);
  for(const [k,v] of Object.entries(labels)) if(k.startsWith('ui.dlab-')) assert.ok(!/ReactionMatcher|IonicEngine|ElectrolysisModel|SchoolLab|registry|handler|null|undefined/i.test(v),`${k}: ${v}`);
  // the closeout removed WASH from 8.1, so no reason may tell the learner to wash
  assert.ok(!labels['ui.dlab-reason-ALREADY_MIXED'].includes('yuving'));
});

test('reports: generator-equal; readiness P2.11; no migration; human decisions open; bundle delta split per phase',async()=>{
  const out=await guidedDynamicLabOutputs(root);
  for(const rel of Object.values(LAB_REPORTS)) assert.equal(read(rel),out[rel],rel);
  const r=json(LAB_REPORTS.readiness);
  assert.equal(r.phase,'P2.11'); assert.equal(r.decision,'NOT_A_RELEASE_OR_PILOT_DECISION');
  assert.ok(r.contracts.some(c=>c.id===CAPABILITY_REGISTRY_SCHEMA&&c.version===CAPABILITY_REGISTRY_VERSION));
  assert.ok(r.definitionOfDone.filter(d=>d.status!=='HUMAN').every(d=>d.status==='MET'));
  for(const d of r.humanDecisions) assert.equal(d.selected,null);
  for(const g of r.futureGates) assert.equal(g.decision,null);
  const eq=json(LAB_REPORTS.equivalence);
  assert.equal(eq.summary.migrationEquivalent,0);
  for(const s of eq.slices) assert.equal(s.decision,'KEEP_OLD_RUNTIME');
  for(const id of ['practice.experiment.7.10','practice.experiment.8.14']){ const s=eq.slices.find(x=>x.activityId===id); assert.equal(Object.keys(s.dimensions).length,8); assert.equal(s.newOnly.replayDeterministic,true); }
  const b=r.bundleDelta;
  assert.equal(b.cumulativeSince,'P2.9');
  for(const k of ['learnerModules','learnerModuleBytes','standaloneBytes']) assert.equal(b.phases['P2.10'][k]+b.phases['P2.11'][k],b.delta[k],k);
  const cov=json(LAB_REPORTS.coverage);
  assert.equal(cov.p211.before.summary.PROFILED,3); assert.equal(cov.p211.after.summary.PROFILED,5);
});
