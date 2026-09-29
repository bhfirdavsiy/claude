import { validateEvidence,                                    } from '../../runtime/evidence/types.js';
import { completeCapabilities } from '../shared/types.js';

                                       
                      
                             
                                    
 
                                                                                              
                                                
                    
                         
                        
                        
                                                          
                                     
                 
                        
                                                     
                 
 
                               
                  
                      
                          
                                        
                             
                      
 

function clone   (v  )   { return JSON.parse(JSON.stringify(v)); }

export class TrainerEngine                 {
                   config                      ;
          state             ={attempts:0,shownHints:[],status:'active',explanationVisible:false,evidence:[]};
  constructor(config                      ){ this.config=config; }

  submit(answer       )                         {
    if(this.state.status!=='active') throw new Error('TRAINER_SESSION_COMPLETE');
    const result=this.config.validator(answer);
    if(!Number.isFinite(result.score)||result.score<0||result.score>1) throw new Error('TRAINER_SCORE_INVALID');
    this.state.attempts++;
    this.state.lastFeedbackKey=result.feedbackKey;

    const conceptId=this.config.question.conceptId??'concept.unspecified';
    const ev               =validateEvidence({
      id:`${this.config.activityId}.${this.config.question.id}.attempt.${this.state.attempts}`,
      conceptId,
      activityId:this.config.activityId,
      activityVersion:this.config.activityVersion,
      contentVersion:this.config.contentVersion,
      scoringVersion:this.config.scoringVersion,
      createdAt:this.config.now(),
      score:result.score,
      evidenceClass:'trainer-calculation',
      type:'answer',
      questionId:this.config.question.id,
      correct:result.correct,
      independenceKey:this.config.activityId,
    })                  ;
    this.state.evidence.push(ev);

    for(let i=0;i<this.config.attemptPolicy.hintAfterAttempts.length;i++){
      const threshold=this.config.attemptPolicy.hintAfterAttempts[i];
      if(this.state.attempts>=threshold&&this.config.hints[i]&&!this.state.shownHints.includes(this.config.hints[i])) this.state.shownHints.push(this.config.hints[i]);
    }

    if(result.correct){
      this.state.status='correct';
      if(this.config.attemptPolicy.explanationAfter==='success'||(typeof this.config.attemptPolicy.explanationAfter==='number'&&this.state.attempts>=this.config.attemptPolicy.explanationAfter)) this.state.explanationVisible=true;
    } else if(this.config.attemptPolicy.maxAttempts!==undefined&&this.state.attempts>=this.config.attemptPolicy.maxAttempts){
      this.state.status='exhausted';
      if(typeof this.config.attemptPolicy.explanationAfter==='number'&&this.state.attempts>=this.config.attemptPolicy.explanationAfter) this.state.explanationVisible=true;
    }
    return result;
  }

  getCapabilities(){ return completeCapabilities(); }
  getState()              { return clone(this.state); }
  getEvidence()            { return clone(this.state.evidence); }
  serialize()        { return JSON.stringify({activityId:this.config.activityId,questionId:this.config.question.id,state:this.state}); }
  restore(serialized       )      {
    let parsed    ;
    try{ parsed=JSON.parse(serialized); }catch{ throw new Error('TRAINER_STATE_INVALID'); }
    if(!parsed||parsed.activityId!==this.config.activityId||parsed.questionId!==this.config.question.id||!parsed.state||!Array.isArray(parsed.state.evidence)) throw new Error('TRAINER_STATE_INVALID');
    parsed.state.evidence=parsed.state.evidence.map(validateEvidence);
    this.state=clone(parsed.state);
  }
}
