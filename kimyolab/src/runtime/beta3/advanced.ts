import type {PracticeActivity,PracticeType} from '../../domain/content/types.ts';
import type {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';
import type {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';
import {assertHydrolysisTarget} from '../../domain/chemistry/hydrolysis-trial.ts';
import {hydrolysisPracticeResult} from '../reference-slices/hydrolysis-practice.ts';
import type {ElectrolysisModel} from '../../domain/chemistry/electrolysis-model.ts';
import type {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.ts';
import type {KineticsModel} from '../../domain/chemistry/kinetics-model.ts';
import type {EquilibriumModel} from '../../domain/chemistry/equilibrium-model.ts';
import {electronConfiguration} from '../../domain/chemistry/electron-configuration.ts';
import {validateNuclearEquation} from '../../domain/chemistry/nuclear-equation.ts';
import {idealGasPressure,totalGasMoles} from '../../domain/chemistry/gas-laws.ts';
import {molarity,normality} from '../../domain/chemistry/stoichiometry.ts';
import {averageReactionRate} from '../../domain/chemistry/kinetics-model.ts';
import {faradayMass} from '../../domain/chemistry/faraday-model.ts';
import {balanceRedox} from '../../domain/chemistry/redox-balancer.ts';
import {CalculationEngine} from '../../engines/calculation/engine.ts';
import type {AnswerEvidence,ConstructionEvidence,Evidence,ObservationEvidence,ProcedureEvidence} from '../evidence/types.ts';
import {PracticeRouter,type PracticeEngineAdapter} from '../practice-router/router.ts';
import type {ReferenceSliceContext} from '../reference-slices/config.ts';

export interface Beta3AdvancedConfig{
  capability:string;type:PracticeType;version:string;conceptId:string;task:string;
  [key:string]:any;
}
export type Beta3AdvancedRegistry=Record<string,Beta3AdvancedConfig>;
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v:unknown):v is string{return typeof v==='string'&&v.length>0}
export function loadBeta3AdvancedRegistry(raw:unknown):Beta3AdvancedRegistry{
  if(!obj(raw))throw new Error('BETA3_ADVANCED_INVALID:root');const out:Beta3AdvancedRegistry={};
  for(const [id,v] of Object.entries(raw)){
    if(!obj(v)||!text(v.capability)||!text(v.type)||!text(v.version)||!text(v.conceptId)||!text(v.task))throw new Error(`BETA3_ADVANCED_INVALID:${id}`);
    out[id]=v as unknown as Beta3AdvancedConfig;
  }return out;
}
interface Options{
 registry:Beta3AdvancedRegistry;ionicEngine:IonicEngine;hydrolysisModel:HydrolysisModel;electrolysisModel:ElectrolysisModel;manganeseModel:ManganeseRedoxModel;kineticsModel:KineticsModel;equilibriumModel:EquilibriumModel;contentVersion:string;scoringVersion:string;now:()=>string;
}
function meta(a:PracticeActivity,c:Beta3AdvancedConfig,o:Options){return {conceptId:c.conceptId,activityId:a.id,activityVersion:a.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now()}}
function norm(v:unknown){return String(v).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')}
function normEq(v:unknown){return String(v).normalize('NFKC').replace(/->|=>/g,'→').replace(/\s+/g,'').replace(/⇌/g,'→')}
function lastField(actions:any[],field:string){return ([...actions].reverse().find(x=>x.field===field) as any)?.value}
/** Tasks this runtime can execute, per engine (the capability surface used by ActivityExecutionPlan, P1.1 D8). */
export const BETA3_ADVANCED_TASKS:Readonly<Record<string,ReadonlySet<string>>>=Object.freeze({
  simulation:new Set(['electron-configuration','bounded-choice','nuclear-conservation','hydrolysis','reaction-rate','kinetics-factor','equal-rates','equilibrium-shift','medium-redox']),
  calculation:new Set(['gas-total-moles','ideal-gas-pressure','molar-normal','faraday-mass']),
  trainer:new Set(['ionic-equation','redox-balance']),
  experiment:new Set(['electrolysis']),
});
function simulationExpected(c:Beta3AdvancedConfig,o:Options):unknown{
  switch(c.task){
    case 'electron-configuration':return electronConfiguration(c.atomicNumber);
    case 'bounded-choice':return c.expected;
    case 'nuclear-conservation':return validateNuclearEquation({reactants:c.reactants,products:c.products});
    case 'hydrolysis':{const r=o.hydrolysisModel.classify(c.salt);if(!r.modeled)throw new Error(r.code);return r.medium;}
    case 'reaction-rate':return averageReactionRate({initialConcentration:c.initialConcentration,finalConcentration:c.finalConcentration,deltaSeconds:c.deltaSeconds});
    case 'kinetics-factor':{const r=o.kineticsModel.effect(c.factor,c.change);if(!r.modeled)throw new Error(r.code);return r.effect;}
    case 'equal-rates':return Math.abs(Number(c.forwardRate)-Number(c.reverseRate))<1e-12;
    case 'equilibrium-shift':{const r=o.equilibriumModel.resolve(c.reactionId,c.perturbation);if(!r.modeled)throw new Error(r.code);return r.shift;}
    case 'medium-redox':return o.manganeseModel.resolve(c.medium).product;
    default:throw new Error(`BETA3_SIMULATION_TASK_INVALID:${c.task}`);
  }
}
function calculationExpected(c:Beta3AdvancedConfig):{value:number;stepId:string;unit:string;tolerance:number}{
  switch(c.task){
    case 'gas-total-moles':return {value:totalGasMoles(c.mixtureMoles),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-9};
    case 'ideal-gas-pressure':return {value:idealGasPressure({moles:c.moles,temperatureK:c.temperatureK,volumeL:c.volumeL}),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-6};
    case 'molar-normal':return {value:normality(molarity(c.moles,c.volumeL),c.equivalentFactor),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-9};
    case 'faraday-mass':return {value:faradayMass({molarMassGPerMol:c.molarMassGPerMol,currentA:c.currentA,timeS:c.timeS,electronNumber:c.electronNumber}),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-6};
    default:throw new Error(`BETA3_CALCULATION_TASK_INVALID:${c.task}`);
  }
}
function trainerExpected(c:Beta3AdvancedConfig,o:Options):string{
  if(c.task==='ionic-equation')return o.ionicEngine.netIonicEquation(c.reactionId).equation;
  if(c.task==='redox-balance')return balanceRedox({reactants:c.reactants,products:c.products,medium:c.medium}).equation;
  throw new Error(`BETA3_TRAINER_TASK_INVALID:${c.task}`);
}
export function createBeta3AdvancedRouter(o:Options){
 const router=new PracticeRouter<ReferenceSliceContext>();
 const simulation:PracticeEngineAdapter<ReferenceSliceContext>={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='simulation')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);
  // P1.5: the hydrolysis task is a prediction trial (same scoring as the beta2 experiment, hydrolysis-practice.ts);
  // the former free-text {field:'medium',value} input let the learner type the answer without any observation.
  if(c.task==='hydrolysis'){assertHydrolysisTarget(o.hydrolysisModel,c.salt);return hydrolysisPracticeResult({model:o.hydrolysisModel,targetSalt:c.salt,actions:ctx.inputs[a.id]?.simulationActions??[],meta:meta(a,c,o),construction:{id:`${a.id}.beta3.${c.field}`,targetId:`${c.task}:${c.field}`}}) as any;}
const expected=simulationExpected(c,o);const value=lastField(ctx.inputs[a.id]?.simulationActions??[],c.field);const achieved=typeof expected==='number'?Math.abs(Number(value)-expected)<=(c.tolerance??1e-6):norm(value)===norm(expected);const ev:ConstructionEvidence={...meta(a,c,o),id:`${a.id}.beta3.${c.field}`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`${c.task}:${c.field}`,achieved,independenceKey:`${a.id}:${c.field}`};return {evidence:[ev],serializedState:JSON.stringify({value,expected,achieved})};}};
 const trainer:PracticeEngineAdapter<ReferenceSliceContext>={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='trainer')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const expected=trainerExpected(c,o);const answers=ctx.inputs[a.id]?.trainerAnswers??[];const answer=answers.at(-1)??'';const correct=normEq(answer)===normEq(expected);const ev:AnswerEvidence={...meta(a,c,o),id:`${a.id}.beta3.answer.${answers.length||1}`,score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:c.task,correct,independenceKey:`${a.id}:answer`};return {evidence:[ev],serializedState:JSON.stringify({answer,expected,correct}),finalState:{status:correct?'correct':'in_progress'}};}};
 const calculation:PracticeEngineAdapter<ReferenceSliceContext>={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='calculation')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const exp=calculationExpected(c);const engine=new CalculationEngine({activityId:a.id,activityVersion:a.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:c.conceptId,now:o.now,steps:[{id:exp.stepId,validator:r=>{const accepted=r.unit===exp.unit&&Math.abs(r.value-exp.value)<=exp.tolerance;return {accepted,score:accepted?1:0,feedbackKey:accepted?'calculation.correct':'calculation.incorrect'}}}]});const outcomes=[];for(const r of ctx.inputs[a.id]?.calculationResponses??[])outcomes.push(engine.submit(r.stepId,{value:r.value,unit:r.unit}));return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,expected:exp,finalState:engine.getState()};}};
 const experiment:PracticeEngineAdapter<ReferenceSliceContext>={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='experiment'||c.task!=='electrolysis')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const model=o.electrolysisModel.resolve(c.query);if(!model.modeled)throw new Error(model.code);const types=new Set((ctx.inputs[a.id]?.actions??[]).map(x=>x.type));const complete=c.requiredActions.every((x:string)=>types.has(x));const evidence:Evidence[]=[];if(complete){for(const stepId of c.requiredActions)evidence.push({...meta(a,c,o),id:`${a.id}.procedure.${stepId}`,score:1,evidenceClass:'practice-observation',type:'procedure',stepId,accepted:true,independenceKey:`${a.id}:${stepId}`} as ProcedureEvidence);evidence.push({...meta(a,c,o),id:`${a.id}.cathode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'state-change',from:`${c.query.electrolyte}(${c.query.phase})`,to:model.cathode.product},independenceKey:`${a.id}:cathode`} as ObservationEvidence);}return {evidence,serializedState:JSON.stringify({complete,model}),finalState:{status:complete?'complete':'in_progress'}};}};
 router.register('simulation',simulation);router.register('trainer',trainer);router.register('calculation',calculation);router.register('experiment',experiment);return router;
}
