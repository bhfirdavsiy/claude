// Condition-prediction practice result (P2.6, ADR-P2-007) — shared by the beta3 simulations 11.18 (equilibrium) and
// 11.20 (manganese redox) and the beta2 simulation 9.23 (manganese redox), so every engine scores a condition trial
// identically. Chemistry: the existing domain model behind a ConditionModel adapter (condition-trial.ts); this module
// only turns the trial state into evidence and an engine result.
//
// Evidence: one plain answer per recorded trial (a prediction made before the reveal — late predictions are rejected
// by the domain, so no special scoring rule is needed) and, once at least one trial exists, one construction for the
// activity's target condition. Rejected input (an unmodeled condition, an outcome outside the model, a reveal without a
// prediction) records no trial and therefore no evidence at all (the P2.1 guarantee: invalid input is not evidence).
import {evaluateConditionTrials,type ConditionModel,type ConditionTrialState} from '../../domain/chemistry/condition-trial.ts';
import type {AnswerEvidence,ConstructionEvidence} from '../evidence/types.ts';

type Meta={conceptId:string;activityId:string;activityVersion:string;contentVersion:string;scoringVersion:string;createdAt:string};

/** How the renderer names the model's ids: localization domains (`answer.<domain>.<id>`) or formula typography.
 *  Display text only — chosen by the runtime per model kind, never by the renderer. */
export interface ConditionPresentation {
  conditionDomain:string;
  outcomeDomain:string;
  outcomeFormat:'label'|'formula';
  /** optional localization key naming the modeled system (e.g. the reaction the perturbations act on) */
  systemKey?:string;
  /** optional formula of the species the conditions act on (formula typography) */
  subjectFormula?:string;
}

export interface ConditionPracticeResult {
  evidence:Array<AnswerEvidence|ConstructionEvidence>;
  serializedState:string;
  finalState:{status:'complete'|'in_progress';condition:ConditionTrialState;presentation:ConditionPresentation};
}

export function conditionPracticeResult(input:{model:ConditionModel;targetCondition:string;actions:readonly unknown[];meta:Meta;construction:{id:string;targetId:string};presentation:ConditionPresentation}):ConditionPracticeResult{
  const state=evaluateConditionTrials(input.model,input.targetCondition,input.actions);
  const id=input.meta.activityId;
  const trials:AnswerEvidence[]=state.trials.map(t=>({
    ...input.meta,id:`${id}.condition.trial.${t.n}`,score:t.correct?1:0,evidenceClass:'practice-observation',type:'answer',
    questionId:`condition:${state.kind}:${t.condition}`,correct:t.correct,response:t.predicted,independenceKey:`${id}:condition-prediction`,
  }));
  const construction:ConstructionEvidence={...input.meta,id:input.construction.id,score:state.achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:input.construction.targetId,achieved:state.achieved,independenceKey:`${id}:condition`};
  return {
    evidence:trials.length?[...trials,construction]:[],
    serializedState:JSON.stringify({current:state.current,trials:state.trials,achieved:state.achieved}),
    finalState:{status:state.achieved?'complete':'in_progress',condition:state,presentation:input.presentation},
  };
}
