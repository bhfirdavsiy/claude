import { validateEvidence,               } from '../../runtime/evidence/types.js';
import { completeCapabilities } from '../shared/types.js';
                                                                                                                                                    

function clone   (value  )   { return JSON.parse(JSON.stringify(value)); }

export class ExperimentEngine {
          state                ;
                   scenario                   ;
                   evaluator                          ;

  constructor(scenario                   ,evaluator                          ){
    this.scenario=clone(scenario);
    this.evaluator=evaluator;
    this.state={scenarioId:scenario.id,status:'not_started',completedStepIds:[],actions:[],evidence:[],warnings:[]};
  }

  getCapabilities(){ return completeCapabilities(); }
  getState()                 { return clone(this.state); }
  getEvidence()            { return clone(this.state.evidence); }

          eligible(step               ,action          )         {
    if(!step.allowedActions.includes(action.type)) return false;
    if(!step.dependencies.every(id=>this.state.completedStepIds.includes(id))) return false;
    if(step.mode!=='repeatable'&&this.state.completedStepIds.includes(step.id)) return false;
    return true;
  }

  dispatch(action          )                        {
    const step=this.scenario.steps.find(s=>this.eligible(s,action));
    if(!step){
      // P2.9: same rejection (status/code unchanged, no state change, no evidence); the reason only says WHY, so the
      // learner hears "do the earlier step first" instead of "your input is invalid" when a declared dependency is open
      const blocked=this.scenario.steps.some(s=>s.allowedActions.includes(action.type)&&!this.state.completedStepIds.includes(s.id)&&!s.dependencies.every(id=>this.state.completedStepIds.includes(id)));
      return blocked?{status:'invalid',code:'INVALID_ACTION',feedbackKey:'experiment.invalid-action',reason:'STEP_DEPENDENCY_UNMET'}:{status:'invalid',code:'INVALID_ACTION',feedbackKey:'experiment.invalid-action'};
    }
    const evaluated=this.evaluator(this.getState(),clone(action),clone(step));
    if(evaluated.status!=='accepted'){
      if(evaluated.status==='unsafe') this.state.warnings.push(evaluated.code);
      return evaluated;
    }

    const evidence=(evaluated.evidence??[]).map(validateEvidence);
    this.state.actions.push(clone(action));
    this.state.evidence.push(...clone(evidence));
    if(action.type===step.completionRule.actionType&&!this.state.completedStepIds.includes(step.id)) this.state.completedStepIds.push(step.id);
    const required=this.scenario.steps.filter(s=>s.mode==='required');
    this.state.status=required.every(s=>this.state.completedStepIds.includes(s.id))?'complete':'in_progress';
    return evidence.length?{status:'accepted',evidence:clone(evidence)}:{status:'accepted'};
  }

  serialize()        { return JSON.stringify(this.state); }

  restore(serialized       )      {
    let parsed                ;
    try { parsed=JSON.parse(serialized); }
    catch { throw new Error('EXPERIMENT_STATE_INVALID'); }
    if(!parsed||parsed.scenarioId!==this.scenario.id||!Array.isArray(parsed.completedStepIds)||!Array.isArray(parsed.actions)||!Array.isArray(parsed.evidence)) throw new Error('EXPERIMENT_STATE_INVALID');
    parsed.evidence=parsed.evidence.map(validateEvidence);
    this.state=clone(parsed);
  }
}
