import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
import {loadBeta2AdvancedRegistry,createBeta2AdvancedRouter} from '../src/runtime/beta2/advanced.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const registry=loadBeta2AdvancedRegistry(read('content-src/activity-configs/beta2-advanced.json'));
const reactions=read('content-src/chemistry/reactions.json');
const ionicRules=read('content-src/chemistry/solubility.json');
const now=()=> '2026-09-15T00:00:00.000Z';
const router=createBeta2AdvancedRouter({
 registry,
 ionicEngine:IonicEngine.from({reactions,rules:ionicRules}),
 hydrolysisModel:HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json')),
 electrolysisModel:ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json')),
 manganeseModel:ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json')),
 contentVersion:'2026.09.1',scoringVersion:'1.0.0',now,
});
const activity=(id,type)=>({id,type,title:id,goal:id,conceptIds:['concept.x'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:['keyboard'],engineCompatibility:{engine:type,range:'*'},sourceRefs:[],legacyIds:[],version:'1.0.0'});

test('ionic-equation trainer validates against IonicEngine output instead of a guessed string',async()=>{
 const id='practice.trainer.9.05.planned';
 const result=await router.run(activity(id,'trainer'),{inputs:{[id]:{trainerAnswers:['Ag+ + Cl- → AgCl(s)']}}});
 assert.equal(result.ok,true);
 assert.ok(result.value.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('hydrolysis simulation uses bounded curated model and emits construction evidence',async()=>{
 const id='practice.experiment.9.14';
 const result=await router.run(activity(id,'experiment'),{inputs:{[id]:{actions:[{type:'selectSalt',payload:{salt:'AlCl3'}},{type:'addIndicator'},{type:'recordMedium',payload:{medium:'acidic'}}]}}});
 assert.equal(result.ok,true);
 assert.ok(result.value.evidence.some(e=>e.type==='construction'&&e.achieved));
});

test('electrolysis experiment resolves only curated electrolyte/electrode products',async()=>{
 const id='practice.experiment.9.10';
 const result=await router.run(activity(id,'experiment'),{inputs:{[id]:{actions:[{type:'connectCurrent'},{type:'observeCathode'},{type:'observeAnode'}]}}});
 assert.equal(result.ok,true);
 assert.ok(result.value.evidence.some(e=>e.type==='observation'));
 assert.equal(result.value.model.cathode.product,'Cu');
 assert.equal(result.value.model.anode.product,'Cl2');
});

test('manganese redox simulation requires explicit medium and emits modeled target evidence',async()=>{
 const id='practice.simulation.9.23.planned';
 const result=await router.run(activity(id,'simulation'),{inputs:{[id]:{simulationActions:[{field:'medium',value:'acidic'}]}}});
 assert.equal(result.ok,true);
 assert.equal(result.value.model.product,'Mn^2+');
 assert.ok(result.value.evidence.some(e=>e.type==='construction'&&e.achieved));
});
