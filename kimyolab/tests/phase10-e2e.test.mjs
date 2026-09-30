import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LearningRunner} from '../src/runtime/learning-runner/runner.ts';
import {IndexedDbProgressStore} from '../src/runtime/progress/indexeddb-store.ts';
import {createFakeIndexedDb} from './helpers/fake-indexeddb.mjs';
import {createCanonicalContentRepository} from '../src/runtime/reference-slices/repository.ts';
import {createBeta3Router,loadBeta3SafeConfigRegistry,loadBeta3AdvancedRegistry} from '../src/runtime/beta3/index.ts';
import {IonicEngine} from '../src/domain/chemistry/ionic-engine.ts';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
import {KineticsModel,averageReactionRate} from '../src/domain/chemistry/kinetics-model.ts';
import {EquilibriumModel} from '../src/domain/chemistry/equilibrium-model.ts';
import {electronConfiguration} from '../src/domain/chemistry/electron-configuration.ts';
import {idealGasPressure,totalGasMoles} from '../src/domain/chemistry/gas-laws.ts';
import {molarity,normality} from '../src/domain/chemistry/stoichiometry.ts';
import {faradayMass} from '../src/domain/chemistry/faraday-model.ts';
import {balanceRedox} from '../src/domain/chemistry/redox-balancer.ts';

const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const data={units:read('content-src/learning-units.json'),theories:read('content-src/theory-activities.json'),practices:read('content-src/practice-activities.json'),mappings:read('content-src/mapping-links.json')};
const safe=loadBeta3SafeConfigRegistry(read('content-src/activity-configs/beta3-safe.json'));
const advanced=loadBeta3AdvancedRegistry(read('content-src/activity-configs/beta3-advanced.json'));
const reactions=read('content-src/chemistry/reactions.json'),rules=read('content-src/chemistry/solubility.json');
const ionic=IonicEngine.from({reactions,rules}), hydro=HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json')), electro=ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json')), manganese=ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json')), kinetics=KineticsModel.from(read('content-src/chemistry/kinetics.json')), equilibrium=EquilibriumModel.from(read('content-src/chemistry/equilibrium.json'));
const at='2026-09-15T00:00:00.000Z';
function advExpected(c){
 switch(c.task){
  case 'electron-configuration':return electronConfiguration(c.atomicNumber);
  case 'bounded-choice':return c.expected;
  case 'nuclear-conservation':return true;
  case 'gas-total-moles':return totalGasMoles(c.mixtureMoles);
  case 'ideal-gas-pressure':return idealGasPressure({moles:c.moles,temperatureK:c.temperatureK,volumeL:c.volumeL});
  case 'hydrolysis':return hydro.classify(c.salt).medium;
  case 'molar-normal':return normality(molarity(c.moles,c.volumeL),c.equivalentFactor);
  case 'reaction-rate':return averageReactionRate({initialConcentration:c.initialConcentration,finalConcentration:c.finalConcentration,deltaSeconds:c.deltaSeconds});
  case 'kinetics-factor':return kinetics.effect(c.factor,c.change).effect;
  case 'equal-rates':return true;
  case 'equilibrium-shift':return equilibrium.resolve(c.reactionId,c.perturbation).shift;
  case 'medium-redox':return manganese.resolve(c.medium).product;
  case 'ionic-equation':return ionic.netIonicEquation(c.reactionId).equation;
  case 'redox-balance':return balanceRedox({reactants:c.reactants,products:c.products,medium:c.medium}).equation;
  case 'faraday-mass':return faradayMass({molarMassGPerMol:c.molarMassGPerMol,currentA:c.currentA,timeS:c.timeS,electronNumber:c.electronNumber});
 }
}
function input(id){
 const s=safe[id];if(s){if(s.type==='calculation')return {calculationResponses:s.steps.map(x=>({stepId:x.id,value:x.value,unit:x.unit}))};throw new Error('unexpected safe type');}
 const c=advanced[id];const e=advExpected(c);
 // P1.5: the hydrolysis task is a prediction trial (salt → prediction → indicator); a typed value is no longer an answer
 if(c.type==='simulation'&&c.task==='hydrolysis')return {simulationActions:[{type:'selectSalt',payload:{salt:c.salt}},{type:'predictMedium',payload:{medium:e}},{type:'addIndicator'}]};
 if(c.type==='simulation')return {simulationActions:[{field:c.field,value:e}]};
 if(c.type==='trainer')return {trainerAnswers:[String(e)]};
 if(c.type==='calculation')return {calculationResponses:[{stepId:c.stepId,value:e,unit:c.unit}]};
 if(c.type==='experiment')return {actions:c.requiredActions.map(type=>({type}))};
 throw new Error(`no input ${id}`);
}
function assessments(unit){return unit.conceptIds.flatMap((conceptId,ci)=>[1,2,3].map(n=>({id:`p10.${unit.id}.${ci}.${n}`,conceptId,activityId:`assessment.${unit.id}`,activityVersion:'1',contentVersion:'2026.09.1',scoringVersion:'1.0.0',createdAt:at,score:.95,evidenceClass:'concept-assessment',type:'answer',questionId:`q.${ci}.${n}`,correct:true,independenceKey:`p10.${unit.id}.${ci}.${n}`})));}

test('all 22 grade 11 Beta3 learning units run through canonical LearningRunner and restore progress',async()=>{
 const repo=createCanonicalContentRepository(data);
 const router=createBeta3Router({safeRegistry:safe,advancedRegistry:advanced,ionicEngine:ionic,hydrolysisModel:hydro,electrolysisModel:electro,manganeseModel:manganese,kineticsModel:kinetics,equilibriumModel:equilibrium,contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=>at});
 const units=data.units.filter(u=>u.grade===11);assert.equal(units.length,22);
 for(const unit of units){
  const mapping=data.mappings.find(m=>m.learningUnitId===unit.id&&m.role==='primary');assert.ok(mapping,unit.id);
  const factory=createFakeIndexedDb();const store=new IndexedDbProgressStore(factory,`p10-${unit.id}`);
  const runner=new LearningRunner({repository:repo,practiceRouter:router,store,assessmentRunner:async u=>assessments(u),contentVersion:'2026.09.1',schemaVersion:'1.0.0',assessmentVersion:'1.0.0',scoringVersion:'1.0.0',now:()=>at});
  const result=await runner.run(unit.id,{inputs:{[mapping.practiceActivityId]:input(mapping.practiceActivityId)}});
  assert.equal(result.ok,true,`${unit.legacyIds?.[0]}:${JSON.stringify(result)}`);assert.ok(result.value.evidence.length>=4,unit.legacyIds?.[0]);
  const restored=await new IndexedDbProgressStore(factory,`p10-${unit.id}`).loadProgress(unit.id);assert.equal(restored.status,result.value.progress.status,unit.legacyIds?.[0]);
 }
});
