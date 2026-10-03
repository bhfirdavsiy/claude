import type { Evidence } from '../../runtime/evidence/types.ts';

export type ExperimentStepMode='required'|'optional'|'repeatable';
export interface LabAction { type:string; payload?:Record<string,unknown> }
export interface ExperimentStep {
  id:string;
  dependencies:string[];
  mode:ExperimentStepMode;
  allowedActions:string[];
  completionRule:{actionType:string};
}
export interface ExperimentScenario { id:string; version:string; steps:ExperimentStep[] }
export interface ExperimentState {
  scenarioId:string;
  status:'not_started'|'in_progress'|'waiting_for_observation'|'complete'|'blocked';
  completedStepIds:string[];
  actions:LabAction[];
  evidence:Evidence[];
  warnings:string[];
}
export type ExperimentActionResult =
  | {status:'accepted';evidence?:Evidence[]}
  | {status:'invalid';code:string;feedbackKey:string;reason?:'STEP_DEPENDENCY_UNMET'}
  | {status:'unsafe';code:string;feedbackKey:string};
export type ExperimentActionEvaluator=(state:ExperimentState,action:LabAction,step:ExperimentStep)=>ExperimentActionResult;
