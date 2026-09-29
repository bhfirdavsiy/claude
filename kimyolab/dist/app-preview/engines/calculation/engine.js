import { validateEvidence,                                         } from '../../runtime/evidence/types.js';
import { completeCapabilities } from '../shared/types.js';

                                                                  
                                                                                                   
                                        
            
                                                                        
 
                                    
                    
                         
                        
                        
                   
                 
                                
 
                                   
                          
                             
                                                       
                      
 
                                     
                                          
                                          
                                                                                   

function clone   (value  )   { return JSON.parse(JSON.stringify(value)); }

export class CalculationEngine {
                   config                  ;
          state                 ={currentStepIndex:0,status:'active',acceptedResponses:{},evidence:[]};
  constructor(config                  ){ this.config=config; }

  submit(stepId       ,response                    )                         {
    const step=this.config.steps[this.state.currentStepIndex];
    if(!step||step.id!==stepId) return {status:'invalid',code:'CALCULATION_STEP_OUT_OF_ORDER',expectedStepId:step?.id};
    const result=step.validator(response);
    if(!Number.isFinite(result.score)||result.score<0||result.score>1) throw new Error('CALCULATION_SCORE_INVALID');
    if(!result.accepted) return {status:'rejected',feedbackKey:result.feedbackKey};

    const evidence                    =validateEvidence({
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
    })                       ;
    this.state.acceptedResponses[step.id]=clone(response);
    this.state.evidence.push(evidence);
    this.state.currentStepIndex++;
    if(this.state.currentStepIndex>=this.config.steps.length) this.state.status='complete';
    return {status:'accepted',feedbackKey:result.feedbackKey};
  }

  getCapabilities(){ return completeCapabilities(); }
  getState()                  { return clone(this.state); }
  getEvidence()            { return clone(this.state.evidence); }
  serialize()        { return JSON.stringify({activityId:this.config.activityId,state:this.state}); }
  restore(serialized       )      {
    let parsed    ;
    try{ parsed=JSON.parse(serialized); }catch{ throw new Error('CALCULATION_STATE_INVALID'); }
    if(!parsed||parsed.activityId!==this.config.activityId||!parsed.state||!Array.isArray(parsed.state.evidence)) throw new Error('CALCULATION_STATE_INVALID');
    parsed.state.evidence=parsed.state.evidence.map(validateEvidence);
    if(!Number.isInteger(parsed.state.currentStepIndex)||parsed.state.currentStepIndex<0||parsed.state.currentStepIndex>this.config.steps.length) throw new Error('CALCULATION_STATE_INVALID');
    this.state=clone(parsed.state);
  }
}
