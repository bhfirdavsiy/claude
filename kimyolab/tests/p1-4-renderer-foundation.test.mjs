// P1.4 — RendererRegistry (capability + version), the renderer boundary, the canonical atom model and the
// atom-builder reference renderer: registration rules, fail-closed resolution, readiness integration,
// AtomState/RendererModel, evidence and completion parity, legacy strangler, architecture guards, reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RendererRegistry,validateCapability,selectCapability} from '../src/renderers/registry.ts';
import {RENDERER_CATALOG,ATOM_BUILDER_CAPABILITY} from '../src/renderers/catalog.ts';
import {createDefaultRendererRegistry} from '../src/renderers/index.ts';
import {atomBuilderRenderer,atomIntent} from '../src/renderers/atom-builder/renderer.ts';
import {toAtomRendererModel,ATOM_RENDERER_MODEL_SCHEMA} from '../src/renderers/atom-builder/renderer-model.ts';
import {deriveAtomState,applyParticleDelta} from '../src/domain/chemistry/atom.ts';
import {ELEMENT_SYMBOLS,elementByAtomicNumber} from '../src/domain/chemistry/periodic-table.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {satisfiesVersionRange} from '../src/runtime/compatibility/version-range.ts';
import {deriveActivityExecutionPlan,compileExecutionPlans,resolveExecutionPlan,CONFIG_SOURCE_NAMES} from '../src/runtime/practice-router/execution-plan.ts';
import {READINESS_MESSAGES,readinessMessage} from '../src/domain/readiness/readiness.ts';
import {compileReadiness} from '../scripts/lib/readiness-compile.ts';
import {loadSources} from '../scripts/learning-readiness.ts';
import {buildRegistryReport,buildMigrationReport,buildAtomReport,REGISTRY_REPORT,MIGRATION_REPORT,ATOM_REPORT} from '../scripts/renderer-reports.ts';
import {checkSource} from '../scripts/lib/architecture-guard.ts';
import {ContentClient} from '../src/app/content-client.ts';
import {buildPracticeUiModel} from '../src/features/practice/ui-model.ts';
import {runAtomParity,ATOM_ACTIVITY} from './helpers/atom-parity.mjs';
import {memoryPackFetch} from './helpers/memory-pack.mjs';
import {elementNameMapper,parseElementNameCatalog} from '../src/features/localization/element-names.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const committed=(rel)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const impl=(capability)=>({capability,mount:()=>({update(){},destroy(){}})});
const cap=(extra={})=>({...ATOM_BUILDER_CAPABILITY,accessibility:{...ATOM_BUILDER_CAPABILITY.accessibility},...extra});
const sources=()=>structuredClone(loadSources());
const RAW_CODE=/\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\b/;

// ------------------------------------------------------------------ registry

test('registry: valid registration resolves by capability id + compatible version',()=>{
  const registry=new RendererRegistry();
  registry.register(impl(cap()));
  registry.register(impl(cap({version:'1.4.0'})));
  registry.register(impl(cap({version:'2.0.0'})));
  assert.equal(registry.resolve({capability:'atom-builder',range:'^1.0.0'}).capability.version,'1.4.0','highest compatible version');
  // P1.4 closeout: comparators now need full MAJOR.MINOR.PATCH versions. The old invariant ('>=2 <3' is a valid
  // range) was wrong: partial versions were accepted without a documented meaning (see version-range.ts).
  assert.equal(registry.resolve({capability:'atom-builder',range:'>=2.0.0 <3.0.0'}).capability.version,'2.0.0');
  assert.equal(registry.resolve({capability:'atom-builder',range:'1.0.0'}).capability.version,'1.0.0');
});

test('registry: duplicate registration fails (no first-match-wins)',()=>{
  const registry=new RendererRegistry();
  registry.register(impl(cap()));
  assert.throws(()=>registry.register(impl(cap())),e=>e.code==='RENDERER_DUPLICATE');
  assert.equal(registry.capabilities().length,1);
});

test('registry: unknown renderer and version mismatch fail closed with RENDERER_UNAVAILABLE',()=>{
  const registry=createDefaultRendererRegistry();
  // P1.5/P1.6: hydrolysis-medium and ionic-precipitation are registered now, so the "unknown renderer" probe uses
  // a capability that is still not implemented (electrolysis).
  assert.throws(()=>registry.resolve({capability:'electrolysis',range:'^1.0.0'}),e=>e.code==='RENDERER_UNAVAILABLE');
  assert.throws(()=>registry.resolve({capability:'atom-builder',range:'^2.0.0'}),e=>e.code==='RENDERER_UNAVAILABLE');
  assert.throws(()=>registry.resolve({capability:'atom-builder',range:'garbage'}),e=>e.code==='RENDERER_REQUIREMENT_INVALID');
  assert.throws(()=>registry.resolve({capability:'atom-builder'}),e=>e.code==='RENDERER_REQUIREMENT_INVALID');
  // the learner sees a sentence, never the code
  assert.equal(readinessMessage(['RENDERER_UNAVAILABLE']),READINESS_MESSAGES.RENDERER_UNAVAILABLE);
  assert.doesNotMatch(READINESS_MESSAGES.RENDERER_UNAVAILABLE,RAW_CODE);
});

test('registry: every accessibility commitment is a registration gate',()=>{
  for(const key of ['keyboard','nonColorCues','screenReaderSummary','reducedMotion','nonVisualAlternative']){
    const a={...ATOM_BUILDER_CAPABILITY.accessibility};delete a[key];
    assert.throws(()=>new RendererRegistry().register(impl(cap({accessibility:a}))),e=>e.code==='RENDERER_ACCESSIBILITY_INCOMPLETE',key);
  }
  assert.throws(()=>validateCapability(cap({accessibility:{...ATOM_BUILDER_CAPABILITY.accessibility,keyboard:false}})),e=>e.code==='RENDERER_ACCESSIBILITY_INCOMPLETE');
  assert.throws(()=>validateCapability(cap({accessibility:{...ATOM_BUILDER_CAPABILITY.accessibility,reducedMotion:'animated'}})),e=>e.code==='RENDERER_ACCESSIBILITY_INCOMPLETE');
  assert.throws(()=>validateCapability(cap({rendererModelSchema:'atom'})),e=>e.code==='RENDERER_CAPABILITY_INVALID');
  assert.throws(()=>validateCapability(cap({intents:[]})),e=>e.code==='RENDERER_CAPABILITY_INVALID');
});

test('an activity id cannot choose a renderer: requirements name capabilities, and the guard rejects id-based selection',()=>{
  const registry=createDefaultRendererRegistry();
  assert.throws(()=>registry.resolve({capability:ATOM_ACTIVITY,range:'*'}),e=>e.code==='RENDERER_REQUIREMENT_INVALID'||e.code==='RENDERER_UNAVAILABLE');
  assert.throws(()=>registry.resolve({capability:'atom-builder',range:'^1.0.0',activityId:ATOM_ACTIVITY}.capability&&{activityId:ATOM_ACTIVITY}),e=>e.code==='RENDERER_REQUIREMENT_INVALID');
  const rules=(file,src)=>checkSource(file,src).map(v=>v.rule);
  assert.ok(rules('src/renderers/index.ts',"if(page.id==='practice.simulation.7.07.planned') return atom;").includes('RENDERER_SELECTED_BY_ACTIVITY_ID'));
  assert.ok(rules('src/features/practice/host.ts',"switch(page.activityId){case 'practice.simulation.7.07.planned': return atom;}").includes('RENDERER_SELECTED_BY_ACTIVITY_ID'));
  // the production host resolves by page.executionPlan.rendererRequirement only
  const host=fs.readFileSync(path.join(root,'src/features/practice/host.ts'),'utf8');
  assert.match(host,/registry\.resolve\(requirement\)/);
  assert.deepEqual(checkSource('src/features/practice/host.ts',host),[]);
});

test('catalog and production registry agree; the renderer re-exports the catalog declaration',()=>{
  assert.equal(atomBuilderRenderer.capability,ATOM_BUILDER_CAPABILITY);
  assert.deepEqual(createDefaultRendererRegistry().capabilities().map(c=>`${c.id}@${c.version}`),RENDERER_CATALOG.map(c=>`${c.id}@${c.version}`));
  assert.equal(selectCapability(RENDERER_CATALOG.map(capability=>({capability})),{capability:'atom-builder',range:'^1.0.0'}).capability.id,'atom-builder');
});

test('version ranges: exact, caret, comparator sets, wildcard; unparsable never matches',()=>{
  assert.ok(satisfiesVersionRange('1.0.0','^1.0.0'));
  assert.ok(satisfiesVersionRange('1.9.3','^1.2.0'));
  assert.ok(!satisfiesVersionRange('1.1.9','^1.2.0'));
  assert.ok(!satisfiesVersionRange('2.0.0','^1.0.0'));
  // P1.4 closeout: '>=1 <2' (partial versions) is outside the documented subset and now fails closed — the old
  // invariant accepted an undocumented form. Full versions express the same range.
  assert.ok(satisfiesVersionRange('1.5.0','>=1.0.0 <2.0.0'));
  assert.ok(!satisfiesVersionRange('2.0.0','>=1.0.0 <2.0.0'));
  assert.ok(!satisfiesVersionRange('1.5.0','>=1 <2'));
  assert.ok(satisfiesVersionRange('3.1.4','*'));
  assert.ok(!satisfiesVersionRange('1.0.0','~1.0.0'));
  assert.ok(!satisfiesVersionRange('x','^1.0.0'));
});

// ------------------------------------------------------------------ content pack + readiness

test('rendererRequirement is compiled from content, only for migrated activities, and validated',()=>{
  const src=sources();
  const configs=Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,src.configs[n]??{}]));
  const {pack}=compileExecutionPlans(src.activities,configs);
  // P1.5/P1.6: the two hydrolysis activities and the ionic experiment joined the atom (P1.4 had one entry).
  const HYDRO={capability:'hydrolysis-medium',range:'^1.0.0'};
  assert.deepEqual(pack.plans.filter(p=>p.rendererRequirement).map(p=>[p.activityId,p.rendererRequirement]).sort(),[['practice.experiment.8.1',{capability:'ionic-precipitation',range:'^1.0.0'}],['practice.experiment.9.14',HYDRO],['practice.simulation.11.11.planned',HYDRO],[ATOM_ACTIVITY,{capability:'atom-builder',range:'^1.0.0'}]]);
  const shipped=committed(`public/content/${committed('public/content/manifest.json').activeVersion}/execution-plans.json`);
  assert.deepEqual(resolveExecutionPlan(shipped,ATOM_ACTIVITY).rendererRequirement,{capability:'atom-builder',range:'^1.0.0'});
  assert.equal(shipped.plans.filter(p=>p.rendererRequirement).length,4,'legacy activities get no artificial requirement');
  const bad=structuredClone(configs);bad['reference-slices'][ATOM_ACTIVITY].rendererRequirement={capability:'atom-builder'};
  const route=deriveActivityExecutionPlan(src.activities.find(a=>a.id===ATOM_ACTIVITY),bad);
  assert.equal(route.ok,false);assert.equal(route.error.code,'CONFIG_INVALID');
  assert.throws(()=>resolveExecutionPlan({...shipped,plans:shipped.plans.map(p=>p.activityId===ATOM_ACTIVITY?{...p,rendererRequirement:{capability:''}}:p)},ATOM_ACTIVITY),/EXECUTION_PLAN_INVALID/);
});

test('renderer readiness: a required but unavailable/incompatible renderer makes the activity BLOCKED (RENDERER_UNAVAILABLE)',()=>{
  const current=compileReadiness(sources()).pack.activities.find(a=>a.activityId===ATOM_ACTIVITY);
  assert.equal(current.runtime,'READY');
  for(const requirement of [{capability:'atom-builder',range:'^2.0.0'},{capability:'no-such-renderer',range:'^1.0.0'}]){
    const src=sources();src.configs['reference-slices'][ATOM_ACTIVITY].rendererRequirement=requirement;
    const r=compileReadiness(src);
    const a=r.pack.activities.find(x=>x.activityId===ATOM_ACTIVITY);
    assert.deepEqual([a.runtime,a.reasons[0]],['BLOCKED','RENDERER_UNAVAILABLE'],JSON.stringify(requirement));
    assert.ok(r.fatal.includes('PILOT_PRIMARY_NOT_READY:lu.7.07'),'the pilot gate notices a blocked pilot practice');
  }
});

// ------------------------------------------------------------------ canonical atom model

test('periodic table: one domain source (formula parser and atom model both read it)',()=>{
  assert.equal(ELEMENT_SYMBOLS.length,118);
  // P1.4 closeout: the domain holds identity only (Z + symbol). The old invariant (nameUz in ElementInfo) was
  // wrong — localized names are presentation text and now live in content-src/locales (see p1-4-closeout tests).
  assert.deepEqual([elementByAtomicNumber(6),elementByAtomicNumber(11),elementByAtomicNumber(8)],[{atomicNumber:6,symbol:'C'},{atomicNumber:11,symbol:'Na'},{atomicNumber:8,symbol:'O'}]);
  assert.equal(elementByAtomicNumber(0),undefined);assert.equal(elementByAtomicNumber(119),undefined);
  assert.equal(parseFormula('Og').normalized,'Og');
  // no second element table anywhere in src/
  const files=fs.readdirSync(path.join(root,'src'),{recursive:true}).map(String).filter(f=>f.endsWith('.ts')&&!f.endsWith('periodic-table.ts'));
  for(const f of files){
    const text=fs.readFileSync(path.join(root,'src',f),'utf8');
    assert.doesNotMatch(text,/['"]He['"][^\n]{0,40}['"]Li['"][^\n]{0,40}['"]Be['"]|H He Li Be B C N O/,f);
  }
});

test('AtomState: Z, A, charge, element and isotope come from the domain; invalid states fail closed',()=>{
  const c14=deriveAtomState({protons:6,neutrons:8,electrons:6});
  // P1.4 closeout: elementName left the domain state (localization), and Z = 0 is an explicit construction state.
  // The old invariant (a localized name inside AtomState) mixed presentation into chemistry truth.
  assert.deepEqual(c14,{construction:'element',protons:6,neutrons:8,electrons:6,atomicNumber:6,massNumber:14,charge:0,element:'C',isotope:'C-14'});
  const na=deriveAtomState({protons:11,neutrons:12,electrons:10});
  assert.deepEqual([na.element,na.massNumber,na.charge,na.isotope],['Na',23,1,'Na-23']);
  const o=deriveAtomState({protons:8,neutrons:8,electrons:10});
  assert.deepEqual([o.element,o.massNumber,o.charge,o.isotope],['O',16,-2,'O-16']);
  const empty=deriveAtomState({protons:0,neutrons:2,electrons:1});
  assert.deepEqual([empty.construction,empty.element,empty.isotope,empty.charge],['noElementYet',null,null,-1],'Z = 0 is the explicit noElementYet state (never "Z0")');
  for(const bad of [{protons:-1,neutrons:0,electrons:0},{protons:1,neutrons:-2,electrons:0},{protons:1,neutrons:0,electrons:-1},{protons:1.5,neutrons:0,electrons:0},{protons:1,neutrons:0}])
    assert.throws(()=>deriveAtomState(bad),/ATOM_PARTICLES_INVALID/,JSON.stringify(bad));
  assert.throws(()=>deriveAtomState({protons:119,neutrons:0,electrons:0}),/ATOM_ATOMIC_NUMBER_UNSUPPORTED/);
  // the reducer keeps the pre-P1.4 clamping: never below 0, never beyond the known elements
  assert.equal(applyParticleDelta({protons:0,neutrons:0,electrons:0},'electrons',-1).electrons,0);
  assert.equal(applyParticleDelta({protons:118,neutrons:0,electrons:0},'protons',1).protons,118);
  assert.throws(()=>applyParticleDelta(c14,'quarks',1),/ATOM_ACTION_INVALID/);
  assert.throws(()=>applyParticleDelta(c14,'protons',0.5),/ATOM_ACTION_INVALID/);
});

test('AtomState → AtomRendererModel through the one canonical converter; serializable; different atoms → different models',()=>{
  const goal=deriveAtomState({protons:6,neutrons:8,electrons:6});
  const evidence=[{type:'construction',achieved:true,targetId:'C-14'}];
  const names=elementNameMapper(parseElementNameCatalog(committed('content-src/locales/uz-latn/chemistry-elements.json')));
  const m=toAtomRendererModel({finalState:goal,goal,evidence},names);
  assert.equal(m.schema,ATOM_RENDERER_MODEL_SCHEMA);
  assert.deepEqual([m.symbol,m.isotopeLabel,m.chargeLabel,m.chargeIcon,m.goalReached],['C','Uglerod-14','neytral atom','○',true]);
  assert.equal(m.accessibleSummary,'Uglerod-14. Neytral atom. 6 proton. 8 neytron. 6 elektron. Maqsadga yetildi.');
  assert.deepEqual(JSON.parse(JSON.stringify(m)),m,'plain JSON — serializable');
  const na=toAtomRendererModel({finalState:deriveAtomState({protons:11,neutrons:12,electrons:10}),goal,evidence:[]},names);
  assert.deepEqual([na.isotopeLabel,na.chargeLabel,na.chargeIcon,na.goalReached],['Natriy-23','musbat ion (+1)','⊕',false]);
  const o=toAtomRendererModel({finalState:deriveAtomState({protons:8,neutrons:8,electrons:10}),goal,evidence:[]},names);
  assert.equal(o.accessibleSummary,'Kislorod-16. Manfiy ion (−2). 8 proton. 8 neytron. 10 elektron.');
  assert.equal(new Set([m,na,o].map(x=>JSON.stringify(x))).size,3,'black-swan: model-based, not canned');
  // goalReached comes from the engine verdict — equal counts without the evidence do not count as reached
  assert.equal(toAtomRendererModel({finalState:goal,goal,evidence:[]}).goalReached,false);
  assert.throws(()=>toAtomRendererModel({finalState:{protons:1},goal}),/ATOM_RENDERER_MODEL_INPUT_INVALID/);
  for(const x of [m,na,o]) assert.doesNotMatch(x.accessibleSummary,RAW_CODE);
});

// ------------------------------------------------------------------ parity + strangler

test('evidence and completion parity: renderer intents reproduce the pre-P1.4 learning outcome exactly',async()=>{
  const baseline=committed('tests/fixtures/atom-legacy-baseline.json');
  assert.deepEqual(atomIntent('protons',1),{kind:'simulation-action',action:{particle:'protons',delta:1}},'the renderer emits the existing command contract');
  const current=await runAtomParity(root,(p,d)=>atomIntent(p,d));
  assert.deepEqual(current,baseline);
  assert.equal(current.completedAtStep,current.sequence.length-1,'PRACTICE_COMPLETED exactly when the domain reached the target (last input)');
  assert.deepEqual(current.progress,[{learningUnitId:'lu.7.07',status:'practice_complete'}]);
});

test('legacy activities are unaffected: every other routed activity still builds its legacy UI model; registry activities no longer can',async()=>{
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const readiness=committed(`public/content/${committed('public/content/manifest.json').activeVersion}/activity-readiness.json`);
  const launchable=readiness.activities.filter(a=>a.runtime==='READY').map(a=>a.activityId);
  assert.equal(launchable.length,118,'runtime readiness counts unchanged by P1.4/P1.5');
  let legacy=0,registry=0;
  for(const id of launchable){
    const model=await client.loadPractice(id);
    if(model.executionPlan.rendererRequirement){ assert.throws(()=>buildPracticeUiModel(model),/RENDERER_REQUIRED/,id); registry++; continue; }
    assert.doesNotThrow(()=>buildPracticeUiModel(model),id); legacy++;
  }
  // P1.5: computed, not hardcoded — every launchable activity is either registry- or legacy-rendered
  assert.equal(legacy+registry,launchable.length);
  assert.equal(registry,readiness.activities.filter(a=>a.runtime==='READY').filter(a=>committed(`public/content/${committed('public/content/manifest.json').activeVersion}/execution-plans.json`).plans.find(p=>p.activityId===a.activityId)?.rendererRequirement).length);
});

// ------------------------------------------------------------------ architecture guard

test('renderer guards: no persistence, mastery, readiness or chemistry in renderers — display text is fine',()=>{
  const rules=(src,file='src/renderers/atom-builder/renderer.ts')=>checkSource(file,src).map(v=>v.rule);
  assert.ok(rules("import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';").includes('RENDERER_IMPORTS_PERSISTENCE'));
  assert.ok(rules("import {LearningOrchestrator} from '../../runtime/learning-orchestrator/orchestrator.ts';").includes('RENDERER_IMPORTS_PERSISTENCE'));
  assert.ok(rules("import {buildMasteryView} from '../../domain/mastery/view.ts';").includes('RENDERER_IMPORTS_MASTERY'));
  assert.ok(rules("import {launchDecision} from '../../domain/readiness/readiness.ts';").includes('RENDERER_DERIVES_READINESS'));
  assert.ok(rules("import {deriveAtomState} from '../../domain/chemistry/atom.ts';").includes('CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'));
  assert.ok(rules("import {ELEMENT_SYMBOLS} from '../../domain/chemistry/periodic-table.ts';").includes('CHEMISTRY_DOMAIN_IMPORTED_IN_RENDERER'));
  assert.ok(rules("const massNumber=model.protons+model.neutrons;").includes('CHEMISTRY_COMPUTED_IN_RENDERER'));
  assert.ok(rules("const z=s.protons; const q=s.protons-s.electrons;").includes('CHEMISTRY_COMPUTED_IN_RENDERER'));
  assert.ok(rules("return {atomicNumber:s.protons};").includes('CHEMISTRY_COMPUTED_IN_RENDERER'));
  assert.ok(rules("const TABLE=['H','He','Li','Be'];").includes('CHEMISTRY_COMPUTED_IN_RENDERER'));
  assert.ok(rules("const T={1:'H',2:'He',3:'Li'};").includes('CHEMISTRY_COMPUTED_IN_RENDERER'));
  // false positives that must NOT fire: type-only domain imports, display words, pass-through fields, counters
  assert.deepEqual(rules("import type {AtomState,Particle} from '../../domain/chemistry/atom.ts';"),[]);
  assert.deepEqual(rules("const t=['Protonlar','Neytronlar','Elektronlar']; const l=`${s.protons} proton`; const m={atomicNumber:s.atomicNumber,charge:s.charge}; const n=String(Number(x)+1);"),[]);
  assert.deepEqual(rules("const c=model.charge>0?'+':'−';"),[]);
  // the real renderer package is clean
  for(const f of fs.readdirSync(path.join(root,'src/renderers'),{recursive:true}).map(String).filter(f=>f.endsWith('.ts')))
    assert.deepEqual(checkSource(`src/renderers/${f}`,fs.readFileSync(path.join(root,'src/renderers',f),'utf8')),[],f);
});

// ------------------------------------------------------------------ reports

test('renderer reports are deterministic and current; ionic/electrolysis not implemented',async()=>{
  assert.deepEqual(committed(REGISTRY_REPORT),buildRegistryReport(),'run npm run renderer:reports');
  assert.deepEqual(committed(MIGRATION_REPORT),buildMigrationReport());
  const atom=await buildAtomReport();
  assert.deepEqual(committed(ATOM_REPORT),atom);
  const registry=committed(REGISTRY_REPORT);
  assert.equal(registry.catalogMatchesRegistry,true);
  // P1.5/P1.6: three ACTIVE capabilities (P1.4 had one)
  assert.deepEqual(registry.renderers.map(r=>[r.capability,r.rendererVersion,r.status,r.compatibleActivities]),[['atom-builder','1.0.0','ACTIVE',[ATOM_ACTIVITY]],['hydrolysis-medium','1.0.0','ACTIVE',['practice.experiment.9.14','practice.simulation.11.11.planned']],['ionic-precipitation','1.0.0','ACTIVE',['practice.experiment.8.1']]]);
  const migration=committed(MIGRATION_REPORT);
  // P1.5: migration numbers are computed from the compiled plans, never hardcoded
  const shippedPlans=committed(`public/content/${committed('public/content/manifest.json').activeVersion}/execution-plans.json`).plans;
  assert.equal(migration.registryRendered,shippedPlans.filter(p=>p.rendererRequirement).length);
  assert.equal(migration.totalActivities,migration.registryRendered+migration.legacyRendered+migration.rendererBlocked+migration.unrouted);
  assert.equal(migration.rendererBlocked,0);
  assert.equal(migration.futureCandidates.find(c=>c.candidate==='hydrolysis-medium'),undefined,'hydrolysis is implemented, no longer a future candidate');
  // P1.6: ionic precipitation is implemented (reagent choice exists), so it is no longer a future candidate
  assert.equal(migration.futureCandidates.find(c=>c.candidate==='ionic-precipitation'),undefined);
  assert.ok(migration.notCandidates.find(c=>c.candidate==='electrolysis').reason.some(r=>/canned animation/.test(r)));
  assert.equal(atom.modelBased,true);assert.equal(atom.evidenceParity.equal,true);assert.equal(atom.keyboardE2E.keyboardOnly,true);
  assert.doesNotMatch(JSON.stringify([registry,migration,atom]),/generatedAt|"20\d\d-\d\d-\d\dT/);
});
