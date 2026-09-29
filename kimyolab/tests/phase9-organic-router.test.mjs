import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OrganicKnowledgeBase} from '../src/domain/chemistry/organic-knowledge.ts';
import {createBeta2OrganicRouter,loadBeta2OrganicRegistry} from '../src/runtime/beta2/organic.ts';
const data=JSON.parse(fs.readFileSync(new URL('../content-src/chemistry/organic.json',import.meta.url),'utf8'));
const kb=OrganicKnowledgeBase.from(data); const at=()=> '2026-09-15T00:00:00.000Z';
const raw={
 'practice.simulation.test.structure':{capability:'organic-structure-model',type:'simulation',version:'1.0.0',conceptId:'concept.test',task:'molecule-property',moleculeId:'benzene',property:'aromatic',field:'aromatic'},
 'practice.trainer.test.name':{capability:'organic-nomenclature',type:'trainer',version:'1.0.0',conceptId:'concept.test',task:'molecule-property',moleculeId:'2-methylpropane',property:'name'},
 'practice.simulation.test.isomers':{capability:'organic-isomerism',type:'simulation',version:'1.0.0',conceptId:'concept.test',task:'isomer-count',formula:'C4H10',field:'isomerCount'},
 'practice.simulation.test.homolog':{capability:'homologous-series',type:'simulation',version:'1.0.0',conceptId:'concept.test',task:'homolog-formula',series:'alkane',carbonCount:3,field:'formula'},
 'practice.trainer.test.reaction':{capability:'organic-reaction-template',type:'trainer',version:'1.0.0',conceptId:'concept.test',task:'reaction-type',reactionId:'ethene-bromine-addition'},
 'practice.experiment.test.qualitative':{capability:'organic-qualitative-reaction',type:'experiment',version:'1.0.0',conceptId:'concept.test',task:'experiment-reaction',reactionId:'glycerol-cuoh2',requiredActions:['prepareCuOH2','addGlycerol','record']}
};
const registry=loadBeta2OrganicRegistry(raw);
const router=createBeta2OrganicRouter({registry,knowledge:kb,contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:at});
const activity=(id,type)=>({id,type,title:id,goal:id,conceptIds:['concept.test'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:['keyboard'],engineCompatibility:{engine:type,range:'*'},sourceRefs:[],legacyIds:[],version:'1.0.0'});

test('organic simulation derives molecule properties from knowledge base',async()=>{
 const result=await router.run(activity('practice.simulation.test.structure','simulation'),{inputs:{'practice.simulation.test.structure':{simulationActions:[{field:'aromatic',value:true}]}}});
 assert.equal(result.ok,true); assert.ok(result.value.evidence.some(e=>e.type==='construction'&&e.achieved));
});

test('organic trainer derives nomenclature and reaction type answers from curated knowledge',async()=>{
 let result=await router.run(activity('practice.trainer.test.name','trainer'),{inputs:{'practice.trainer.test.name':{trainerAnswers:['2-methylpropane']}}});
 assert.ok(result.value.evidence.some(e=>e.type==='answer'&&e.correct));
 result=await router.run(activity('practice.trainer.test.reaction','trainer'),{inputs:{'practice.trainer.test.reaction':{trainerAnswers:['addition']}}});
 assert.ok(result.value.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('organic simulations derive isomer count and homolog formula without authored answer strings',async()=>{
 let result=await router.run(activity('practice.simulation.test.isomers','simulation'),{inputs:{'practice.simulation.test.isomers':{simulationActions:[{field:'isomerCount',value:2}]}}});
 assert.ok(result.value.evidence.some(e=>e.type==='construction'&&e.achieved));
 result=await router.run(activity('practice.simulation.test.homolog','simulation'),{inputs:{'practice.simulation.test.homolog':{simulationActions:[{field:'formula',value:'C3H8'}]}}});
 assert.ok(result.value.evidence.some(e=>e.type==='construction'&&e.achieved));
});

test('organic experiment evidence is emitted only after required bounded actions and uses curated observation',async()=>{
 const id='practice.experiment.test.qualitative';
 let result=await router.run(activity(id,'experiment'),{inputs:{[id]:{actions:[{type:'prepareCuOH2'},{type:'addGlycerol'}]}}});
 assert.equal(result.value.evidence.length,0);
 result=await router.run(activity(id,'experiment'),{inputs:{[id]:{actions:[{type:'prepareCuOH2'},{type:'addGlycerol'},{type:'record'}]}}});
 assert.ok(result.value.evidence.some(e=>e.type==='observation'&&e.observation.to==='deep-blue-solution'));
});
