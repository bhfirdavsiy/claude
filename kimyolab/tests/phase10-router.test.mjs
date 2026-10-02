import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadBeta3AdvancedRegistry,createBeta3AdvancedRouter} from '../src/runtime/beta3/advanced.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
import {KineticsModel} from '../src/domain/chemistry/kinetics-model.ts';
import {EquilibriumModel} from '../src/domain/chemistry/equilibrium-model.ts';

const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const registry=loadBeta3AdvancedRegistry(read('content-src/activity-configs/beta3-advanced.json'));
const now=()=> '2026-09-15T00:00:00.000Z';
const router=createBeta3AdvancedRouter({
 registry,
 ionicEngine:IonicEngine.from({reactions:read('content-src/chemistry/reactions.json'),rules:read('content-src/chemistry/solubility.json')}),
 hydrolysisModel:HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json')),
 electrolysisModel:ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json')),
 manganeseModel:ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json')),
 kineticsModel:KineticsModel.from(read('content-src/chemistry/kinetics.json')),
 equilibriumModel:EquilibriumModel.from(read('content-src/chemistry/equilibrium.json')),
 contentVersion:'2026.09.1',scoringVersion:'1.0.0',now,
});
const activity=(id,type)=>({id,type,title:id,goal:id,conceptIds:['concept.x'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:['keyboard'],engineCompatibility:{engine:type,range:'*'},sourceRefs:[],legacyIds:[],version:'1.0.0'});
const ctx=(id,input)=>({inputs:{[id]:input}});

test('Beta3 router derives electron configuration and gas-law answers from domain models',async()=>{
 let id='practice.simulation.11.01.planned';
 let r=await router.run(activity(id,'simulation'),ctx(id,{simulationActions:[{field:'configuration',value:'1s2 2s2 2p6 3s1'}]}));
 assert.equal(r.ok,true);assert.ok(r.value.evidence.some(e=>e.type==='construction'&&e.achieved));
 id='practice.calculation.11.08.planned';
 const expected=101.36;
 r=await router.run(activity(id,'calculation'),ctx(id,{calculationResponses:[{stepId:'pressure',value:expected,unit:'kPa'}]}));
 assert.equal(r.ok,true);assert.ok(r.value.evidence.some(e=>e.type==='calculation'&&e.score===1));
});

test('Beta3 router reuses ionic/hydrolysis/electrolysis bounded chemistry instead of guessing',async()=>{
 let id='practice.trainer.11.10.planned';
 let expected=IonicEngine.from({reactions:read('content-src/chemistry/reactions.json'),rules:read('content-src/chemistry/solubility.json')}).netIonicEquation('rxn.agno3-nacl').equation;
 let r=await router.run(activity(id,'trainer'),ctx(id,{trainerAnswers:[expected]}));
 assert.ok(r.value.evidence.some(e=>e.type==='answer'&&e.correct));
 id='practice.experiment.11.2';
 r=await router.run(activity(id,'experiment'),ctx(id,{actions:[{type:'connectCurrent'},{type:'observeCathode'},{type:'observeAnode'}]}));
 assert.ok(r.value.evidence.some(e=>e.type==='observation'));
});

test('Beta3 router resolves kinetics, equilibrium, redox and Faraday tasks from domain logic',async()=>{
 let id='practice.simulation.11.16.planned';
 let r=await router.run(activity(id,'simulation'),ctx(id,{simulationActions:[{field:'effect',value:'increase'}]}));
 assert.ok(r.value.evidence.some(e=>e.type==='construction'&&e.achieved));
 // P2.6 changed the 11.18 input: with the condition-prediction renderer (config 2.0.0, ADR-P2-007) the learner chooses
 // the perturbation, predicts the shift and reveals the model's result; the old one-field answer is no longer the protocol.
 id='practice.simulation.11.18.planned';
 r=await router.run(activity(id,'simulation'),ctx(id,{simulationActions:[{type:'selectCondition',payload:{condition:'pressure-increase'}},{type:'predictOutcome',payload:{outcome:'products'}},{type:'reveal'}]}));
 assert.ok(r.value.evidence.some(e=>e.type==='construction'&&e.achieved));
 r=await router.run(activity(id,'simulation'),ctx(id,{simulationActions:[{field:'shift',value:'products'}]}));
 assert.ok(!r.value.evidence.some(e=>e.type==='construction'&&e.achieved),'typing the final answer no longer completes 11.18');
 id='practice.trainer.11.19.planned';
 r=await router.run(activity(id,'trainer'),ctx(id,{trainerAnswers:['MnO4^- + 5Fe^2+ + 8H+ → Mn^2+ + 5Fe^3+ + 4H2O']}));
 assert.ok(r.value.evidence.some(e=>e.type==='answer'&&e.correct));
 id='practice.calculation.11.22.planned';
 r=await router.run(activity(id,'calculation'),ctx(id,{calculationResponses:[{stepId:'mass',value:0.6355,unit:'g'}]}));
 assert.ok(r.value.evidence.some(e=>e.type==='calculation'&&e.score===1));
});
