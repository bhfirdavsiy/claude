import { validateEvidence, type CalculationEvidence, type Evidence } from '../../runtime/evidence/types.ts';
import { completeCapabilities } from '../shared/types.ts';

export interface CalculationResponse { value:number; unit:string }
export interface CalculationValidationResult { accepted:boolean; score:number; feedbackKey:string }
export interface CalculationStepConfig {
  id:string;
  validator:(response:CalculationResponse)=>CalculationValidationResult;
}
export interface CalculationConfig {
  activityId:string;
  activityVersion:string;
  contentVersion:string;
  scoringVersion:string;
  conceptId:string;
  now:()=>string;
  steps:CalculationStepConfig[];
}
export interface CalculationState {
  currentStepIndex:number;
  status:'active'|'complete';
  acceptedResponses:Record<string,CalculationResponse>;
  evidence:Evidence[];
}
export type CalculationSubmitResult =
  | {status:'accepted';feedbackKey:string}
  | {status:'rejected';feedbackKey:string}
  | {status:'invalid';code:'CALCULATION_STEP_OUT_OF_ORDER';expectedStepId?:string};

function clone<T>(value:T):T { return JSON.parse(JSON.stringify(value)); }

export class CalculationEngine {
  private readonly config:CalculationConfig;
  private state:CalculationState={currentStepIndex:0,status:'active',acceptedResponses:{},evidence:[]};
  constructor(config:CalculationConfig){ this.config=config; }

  submit(stepId:string,response:CalculationResponse):CalculationSubmitResult {
    const step=this.config.steps[this.state.currentStepIndex];
    if(!step||step.id!==stepId) return {status:'invalid',code:'CALCULATION_STEP_OUT_OF_ORDER',expectedStepId:step?.id};
    const result=step.validator(response);
    if(!Number.isFinite(result.score)||result.score<0||result.score>1) throw new Error('CALCULATION_SCORE_INVALID');
    if(!result.accepted) return {status:'rejected',feedbackKey:result.feedbackKey};

    const evidence:CalculationEvidence=validateEvidence({
      id:`${this.config.activityId}.${step.id}.${this.state.currentStepIndex+1}`,
      conceptId:this.config.conceptId,
      activityId:this.config.activityId,
      activityVersion:this.config.activityVersion,
      contentVersion:this.config.contentVersion,
      scoringVersion:this.config.scoringVersion,
      createdAt:this.config.now(),
      score:result.score,
      evidenceClass:'trainer-calculation',
      type:'calculation',
      stepId:step.id,
      value:response.value,
      unit:response.unit,
      independenceKey:`${this.config.activityId}:${step.id}`,
    }) as CalculationEvidence;
    this.state.acceptedResponses[step.id]=clone(response);
    this.state.evidence.push(evidence);
    this.state.currentStepIndex++;
    if(this.state.currentStepIndex>=this.config.steps.length) this.state.status='complete';
    return {status:'accepted',feedbackKey:result.feedbackKey};
  }

  getCapabilities(){ return completeCapabilities(); }
  getState():CalculationState { return clone(this.state); }
  getEvidence():Evidence[] { return clone(this.state.evidence); }
  serialize():string { return JSON.stringify({activityId:this.config.activityId,state:this.state}); }
  restore(serialized:string):void {
    let parsed:any;
    try{ parsed=JSON.parse(serialized); }catch{ throw new Error('CALCULATION_STATE_INVALID'); }
    if(!parsed||parsed.activityId!==this.config.activityId||!parsed.state||!Array.isArray(parsed.state.evidence)) throw new Error('CALCULATION_STATE_INVALID');
    parsed.state.evidence=parsed.state.evidence.map(validateEvidence);
    if(!Number.isInteger(parsed.state.currentStepIndex)||parsed.state.currentStepIndex<0||parsed.state.currentStepIndex>this.config.steps.length) throw new Error('CALCULATION_STATE_INVALID');
    this.state=clone(parsed.state);
  }
}
