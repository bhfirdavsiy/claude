// Condition-prediction practice result (P2.6, ADR-P2-007) — shared by the beta3 simulations 11.18 (equilibrium) and
// 11.20 (manganese redox) and the beta2 simulation 9.23 (manganese redox), so every engine scores a condition trial
// identically. Chemistry: the existing domain model behind a ConditionModel adapter (condition-trial.ts); this module
// only turns the trial state into evidence and an engine result.
//
// Evidence: one plain answer per recorded trial (a prediction made before the reveal — late predictions are rejected
// by the domain, so no special scoring rule is needed) and, once at least one trial exists, one construction for the
// activity's target condition. Rejected input (an unmodeled condition, an outcome outside the model, a reveal without a
// prediction) records no trial and therefore no evidence at all (the P2.1 guarantee: invalid input is not evidence).
import {evaluateConditionTrials,                                            } from '../../domain/chemistry/condition-trial.js';
                                                                              

                                                                                                                                   

/** How the renderer names the model's ids: localization domains (`answer.<domain>.<id>`) or formula typography.
 *  Display text only — chosen by the runtime per model kind, never by the renderer. */
                                        
                         
                       
                                  
                                                                                                         
                    
                                                                                   
                         
 

                                          
                                                      
                         
                                                                                                                
 

export function conditionPracticeResult(input                                                                                                                                                               )                        {
  const state=evaluateConditionTrials(input.model,input.targetCondition,input.actions);
  const id=input.meta.activityId;
  const trials                 =state.trials.map(t=>({
    ...input.meta,id:`${id}.condition.trial.${t.n}`,score:t.correct?1:0,evidenceClass:'practice-observation',type:'answer',
    questionId:`condition:${state.kind}:${t.condition}`,correct:t.correct,response:t.predicted,independenceKey:`${id}:condition-prediction`,
  }));
  const construction                     ={...input.meta,id:input.construction.id,score:state.achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:input.construction.targetId,achieved:state.achieved,independenceKey:`${id}:condition`};
  return {
    evidence:trials.length?[...trials,construction]:[],
    serializedState:JSON.stringify({current:state.current,trials:state.trials,achieved:state.achieved}),
    finalState:{status:state.achieved?'complete':'in_progress',condition:state,presentation:input.presentation},
  };
}
