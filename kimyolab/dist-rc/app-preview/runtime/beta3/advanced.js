                                                                                 
                                                                        
                                                                                
import {assertHydrolysisTarget} from '../../domain/chemistry/hydrolysis-trial.js';
import {hydrolysisPracticeResult} from '../reference-slices/hydrolysis-practice.js';
import {conditionPracticeResult} from '../reference-slices/condition-practice.js';
import {equilibriumConditionModel,manganeseConditionModel} from '../../domain/chemistry/condition-trial.js';
                                                                                    
                                                                                         
                                                                            
import {EQUILIBRIUM_SHIFTS,                     } from '../../domain/chemistry/equilibrium-model.js';
import {electronConfiguration} from '../../domain/chemistry/electron-configuration.js';
import {validateNuclearEquation} from '../../domain/chemistry/nuclear-equation.js';
import {idealGasPressure,totalGasMoles} from '../../domain/chemistry/gas-laws.js';
import {molarity,normality} from '../../domain/chemistry/stoichiometry.js';
import {averageReactionRate} from '../../domain/chemistry/kinetics-model.js';
import {faradayMass} from '../../domain/chemistry/faraday-model.js';
import {balanceRedox} from '../../domain/chemistry/redox-balancer.js';
import {CalculationEngine} from '../../engines/calculation/engine.js';
                                                                                                                             
import {PracticeRouter,                          } from '../practice-router/router.js';
                                                                         

                                     
                                                                                  
                   
 
                                                                     
function obj(v        )                            {return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v        )            {return typeof v==='string'&&v.length>0}
export function loadBeta3AdvancedRegistry(raw        )                      {
  if(!obj(raw))throw new Error('BETA3_ADVANCED_INVALID:root');const out                      ={};
  for(const [id,v] of Object.entries(raw)){
    if(!obj(v)||!text(v.capability)||!text(v.type)||!text(v.version)||!text(v.conceptId)||!text(v.task))throw new Error(`BETA3_ADVANCED_INVALID:${id}`);
    out[id]=v                                  ;
  }return out;
}
                  
                                                                                                                                                                                                                                                                                        
 
function meta(a                 ,c                    ,o        ){return {conceptId:c.conceptId,activityId:a.id,activityVersion:a.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now()}}
function norm(v        ){return String(v).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')}
function normEq(v        ){return String(v).normalize('NFKC').replace(/->|=>/g,'→').replace(/\s+/g,'').replace(/⇌/g,'→')}
function lastField(actions      ,field       ){return ([...actions].reverse().find(x=>x.field===field)       )?.value}
/** Tasks this runtime can execute, per engine (the capability surface used by ActivityExecutionPlan, P1.1 D8). */
export const BETA3_ADVANCED_TASKS                                             =Object.freeze({
  simulation:new Set(['electron-configuration','bounded-choice','nuclear-conservation','hydrolysis','reaction-rate','kinetics-factor','equal-rates','equilibrium-shift','medium-redox']),
  calculation:new Set(['gas-total-moles','ideal-gas-pressure','molar-normal','faraday-mass']),
  trainer:new Set(['ionic-equation','redox-balance']),
  experiment:new Set(['electrolysis']),
});
function simulationExpected(c                    ,o        )        {
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
function calculationExpected(c                    )                                                          {
  switch(c.task){
    case 'gas-total-moles':return {value:totalGasMoles(c.mixtureMoles),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-9};
    case 'ideal-gas-pressure':return {value:idealGasPressure({moles:c.moles,temperatureK:c.temperatureK,volumeL:c.volumeL}),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-6};
    case 'molar-normal':return {value:normality(molarity(c.moles,c.volumeL),c.equivalentFactor),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-9};
    case 'faraday-mass':return {value:faradayMass({molarMassGPerMol:c.molarMassGPerMol,currentA:c.currentA,timeS:c.timeS,electronNumber:c.electronNumber}),stepId:c.stepId,unit:c.unit,tolerance:c.tolerance??1e-6};
    default:throw new Error(`BETA3_CALCULATION_TASK_INVALID:${c.task}`);
  }
}
function trainerExpected(c                    ,o        )       {
  if(c.task==='ionic-equation')return o.ionicEngine.netIonicEquation(c.reactionId).equation;
  if(c.task==='redox-balance')return balanceRedox({reactants:c.reactants,products:c.products,medium:c.medium}).equation;
  throw new Error(`BETA3_TRAINER_TASK_INVALID:${c.task}`);
}
function conditionTrial(a                 ,c                    ,o        ,actions                   ){
  if(c.task==='equilibrium-shift') return conditionPracticeResult({model:equilibriumConditionModel(o.equilibriumModel,c.reactionId,EQUILIBRIUM_SHIFTS),targetCondition:c.perturbation,actions,meta:meta(a,c,o),
    construction:{id:`${a.id}.condition`,targetId:`equilibrium-${c.reactionId}-${c.perturbation}-trial`},presentation:{conditionDomain:'equilibrium-perturbation',outcomeDomain:'equilibrium-shift',outcomeFormat:'label',systemKey:`answer.equilibrium-system.${c.reactionId}`}});
  if(c.task==='medium-redox'){const m=manganeseConditionModel(o.manganeseModel);return conditionPracticeResult({model:m,targetCondition:c.medium,actions,meta:meta(a,c,o),
    construction:{id:`${a.id}.condition`,targetId:`manganese-${c.medium}-trial`},presentation:{conditionDomain:'manganese-medium',outcomeDomain:'manganese-product',outcomeFormat:'formula',subjectFormula:o.manganeseModel.resolve(c.medium).reactant}});}
  return null;
}
export function createBeta3AdvancedRouter(o        ){
 const router=new PracticeRouter                       ();
 const simulation                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='simulation')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);
  // P1.5: the hydrolysis task is a prediction trial (same scoring as the beta2 experiment, hydrolysis-practice.ts);
  // the former free-text {field:'medium',value} input let the learner type the answer without any observation.
  // The evaluation semantics changed, so the config version is 2.0.0 and the construction evidence has a new id and
  // targetId: old free-text evidence (`<id>.beta3.medium`, `hydrolysis:medium`, activityVersion 1.0.0) is never
  // presented as the same scoring context (ADR-P1-006 addendum).
  if(c.task==='hydrolysis'){assertHydrolysisTarget(o.hydrolysisModel,c.salt);return hydrolysisPracticeResult({model:o.hydrolysisModel,targetSalt:c.salt,actions:ctx.inputs[a.id]?.simulationActions??[],meta:meta(a,c,o),construction:{id:`${a.id}.hydrolysis`,targetId:`hydrolysis-${c.salt}-trial`}})       ;}
  // P2.6 (ADR-P2-007): with the condition-prediction renderer the equilibrium and medium-redox tasks become condition
  // trials — the learner chooses a modeled condition, predicts its outcome and reveals the domain's result (the former
  // one-field input asked only for the final answer). New evaluation semantics → config version 2.0.0 and new evidence
  // ids/targetIds; the old `<id>.beta3.<field>` evidence (activityVersion 1.0.0) is never the same scoring context.
  if(c.rendererRequirement?.capability==='condition-prediction'){const r=conditionTrial(a,c,o,ctx.inputs[a.id]?.simulationActions??[]);if(r)return r       ;}
const expected=simulationExpected(c,o);const value=lastField(ctx.inputs[a.id]?.simulationActions??[],c.field);const achieved=typeof expected==='number'?Math.abs(Number(value)-expected)<=(c.tolerance??1e-6):norm(value)===norm(expected);const ev                     ={...meta(a,c,o),id:`${a.id}.beta3.${c.field}`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`${c.task}:${c.field}`,achieved,independenceKey:`${a.id}:${c.field}`};return {evidence:[ev],serializedState:JSON.stringify({value,expected,achieved})};}};
 const trainer                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='trainer')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const expected=trainerExpected(c,o);const answers=ctx.inputs[a.id]?.trainerAnswers??[];const answer=answers.at(-1)??'';const correct=normEq(answer)===normEq(expected);const ev               ={...meta(a,c,o),id:`${a.id}.beta3.answer.${answers.length||1}`,score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:c.task,correct,independenceKey:`${a.id}:answer`};return {evidence:[ev],serializedState:JSON.stringify({answer,expected,correct}),finalState:{status:correct?'correct':'in_progress'}};}};
 const calculation                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='calculation')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const exp=calculationExpected(c);const engine=new CalculationEngine({activityId:a.id,activityVersion:a.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:c.conceptId,now:o.now,steps:[{id:exp.stepId,validator:r=>{const accepted=r.unit===exp.unit&&Math.abs(r.value-exp.value)<=exp.tolerance;return {accepted,score:accepted?1:0,feedbackKey:accepted?'calculation.correct':'calculation.incorrect'}}}]});const outcomes=[];for(const r of ctx.inputs[a.id]?.calculationResponses??[])outcomes.push(engine.submit(r.stepId,{value:r.value,unit:r.unit}));return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,expected:exp,finalState:engine.getState()};}};
 const experiment                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='experiment'||c.task!=='electrolysis')throw new Error(`BETA3_CONFIG_MISSING:${a.id}`);const model=o.electrolysisModel.resolve(c.query);if(!model.modeled)throw new Error(model.code);const types=new Set((ctx.inputs[a.id]?.actions??[]).map(x=>x.type));const complete=c.requiredActions.every((x       )=>types.has(x));const evidence           =[];if(complete){for(const stepId of c.requiredActions)evidence.push({...meta(a,c,o),id:`${a.id}.procedure.${stepId}`,score:1,evidenceClass:'practice-observation',type:'procedure',stepId,accepted:true,independenceKey:`${a.id}:${stepId}`}                     );evidence.push({...meta(a,c,o),id:`${a.id}.cathode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'state-change',from:`${c.query.electrolyte}(${c.query.phase})`,to:model.cathode.product},independenceKey:`${a.id}:cathode`}                       );}return {evidence,serializedState:JSON.stringify({complete,model}),finalState:{status:complete?'complete':'in_progress'}};}};
 router.register('simulation',simulation);router.register('trainer',trainer);router.register('calculation',calculation);router.register('experiment',experiment);return router;
}
