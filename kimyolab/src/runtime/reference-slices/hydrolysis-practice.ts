// Hydrolysis practice result (P1.5) — shared by the beta2 experiment (9.14) and the beta3 simulation (11.11)
// adapters so both engines score a hydrolysis trial identically. Chemistry: HydrolysisModel via
// evaluateHydrolysisTrials; this module only turns the trial state into evidence and an engine result.
import type {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';
import {evaluateHydrolysisTrials,type HydrolysisTrialState} from '../../domain/chemistry/hydrolysis-trial.ts';
import type {ConstructionEvidence,HydrolysisPredictionEvidence} from '../evidence/types.ts';

type Meta={conceptId:string;activityId:string;activityVersion:string;contentVersion:string;scoringVersion:string;createdAt:string};

export interface HydrolysisPracticeResult {
  evidence:Array<HydrolysisPredictionEvidence|ConstructionEvidence>;
  serializedState:string;
  finalState:{status:'complete'|'in_progress';hydrolysis:HydrolysisTrialState};
}

export function hydrolysisPracticeResult(input:{model:HydrolysisModel;targetSalt:string;actions:readonly unknown[];meta:Meta;construction:{id:string;targetId:string}}):HydrolysisPracticeResult{
  const state=evaluateHydrolysisTrials(input.model,input.targetSalt,input.actions);
  const id=input.meta.activityId;
  const trials:HydrolysisPredictionEvidence[]=state.trials.map(t=>({
    ...input.meta,id:`${id}.hydrolysis.trial.${t.n}`,answerKind:'hydrolysis-prediction',
    score:t.correct&&t.predictedBeforeReveal?1:0,evidenceClass:'practice-observation',type:'answer',
    questionId:`hydrolysis-medium:${t.selectedSalt}`,correct:t.correct,response:t.predictedMedium,
    selectedSalt:t.selectedSalt,predictedMedium:t.predictedMedium,actualMedium:t.actualMedium,predictedBeforeReveal:t.predictedBeforeReveal,
    independenceKey:`${id}:hydrolysis-prediction`,
  }));
  const construction:ConstructionEvidence={...input.meta,id:input.construction.id,score:state.achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:input.construction.targetId,achieved:state.achieved,independenceKey:`${id}:hydrolysis`};
  return {
    evidence:[...trials,construction],
    serializedState:JSON.stringify({current:state.current,trials:state.trials,achieved:state.achieved}),
    finalState:{status:state.achieved?'complete':'in_progress',hydrolysis:state},
  };
}
