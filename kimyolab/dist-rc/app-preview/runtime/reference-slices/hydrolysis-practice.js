// Hydrolysis practice result (P1.5) — shared by the beta2 experiment (9.14) and the beta3 simulation (11.11)
// adapters so both engines score a hydrolysis trial identically. Chemistry: HydrolysisModel via
// evaluateHydrolysisTrials; this module only turns the trial state into evidence and an engine result.
                                                                                
import {evaluateHydrolysisTrials,                         } from '../../domain/chemistry/hydrolysis-trial.js';
                                                                                            

                                                                                                                                   

                                           
                                                                    
                         
                                                                               
 

export function hydrolysisPracticeResult(input                                                                                                                        )                         {
  const state=evaluateHydrolysisTrials(input.model,input.targetSalt,input.actions);
  const id=input.meta.activityId;
  const trials                               =state.trials.map(t=>({
    ...input.meta,id:`${id}.hydrolysis.trial.${t.n}`,
    score:t.correct&&t.predictedBeforeReveal?1:0,evidenceClass:'practice-observation',type:'answer',
    questionId:`hydrolysis-medium:${t.selectedSalt}`,correct:t.correct,response:t.predictedMedium,
    selectedSalt:t.selectedSalt,predictedMedium:t.predictedMedium,actualMedium:t.actualMedium,predictedBeforeReveal:t.predictedBeforeReveal,
    independenceKey:`${id}:hydrolysis-prediction`,
  }));
  const construction                     ={...input.meta,id:input.construction.id,score:state.achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:input.construction.targetId,achieved:state.achieved,independenceKey:`${id}:hydrolysis`};
  return {
    evidence:[...trials,construction],
    serializedState:JSON.stringify({current:state.current,trials:state.trials,achieved:state.achieved}),
    finalState:{status:state.achieved?'complete':'in_progress',hydrolysis:state},
  };
}
