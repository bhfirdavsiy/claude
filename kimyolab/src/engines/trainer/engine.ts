import { validateEvidence, type AnswerEvidence, type Evidence } from '../../runtime/evidence/types.ts';
import { completeCapabilities } from '../shared/types.ts';

export interface TrainerAttemptPolicy {
  maxAttempts?:number;
  hintAfterAttempts:number[];
  explanationAfter:number|'success';
}
export interface TrainerValidationResult { correct:boolean; score:number; feedbackKey:string }
export interface TrainerConfig<Answer=unknown> {
  activityId:string;
  activityVersion:string;
  contentVersion:string;
  scoringVersion:string;
  question:{id:string;promptKey:string;conceptId?:string};
  attemptPolicy:TrainerAttemptPolicy;
  hints:string[];
  explanationKey:string;
  validator:(answer:Answer)=>TrainerValidationResult;
  now:()=>string;
}
export interface TrainerState {
  attempts:number;
  shownHints:string[];
  lastFeedbackKey?:string;
  status:'active'|'correct'|'exhausted';
  explanationVisible:boolean;
  evidence:Evidence[];
}

function clone<T>(v:T):T { return JSON.parse(JSON.stringify(v)); }

export class TrainerEngine<Answer=unknown> {
  private readonly config:TrainerConfig<Answer>;
  private state:TrainerState={attempts:0,shownHints:[],status:'active',explanationVisible:false,evidence:[]};
  constructor(config:TrainerConfig<Answer>){ this.config=config; }

  submit(answer:Answer):TrainerValidationResult {
    if(this.state.status!=='active') throw new Error('TRAINER_SESSION_COMPLETE');
    const result=this.config.validator(answer);
    if(!Number.isFinite(result.score)||result.score<0||result.score>1) throw new Error('TRAINER_SCORE_INVALID');
    this.state.attempts++;
    this.state.lastFeedbackKey=result.feedbackKey;

    const conceptId=this.config.question.conceptId??'concept.unspecified';
    const ev:AnswerEvidence=validateEvidence({
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
    }) as AnswerEvidence;
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
  getState():TrainerState { return clone(this.state); }
  getEvidence():Evidence[] { return clone(this.state.evidence); }
  serialize():string { return JSON.stringify({activityId:this.config.activityId,questionId:this.config.question.id,state:this.state}); }
  restore(serialized:string):void {
    let parsed:any;
    try{ parsed=JSON.parse(serialized); }catch{ throw new Error('TRAINER_STATE_INVALID'); }
    if(!parsed||parsed.activityId!==this.config.activityId||parsed.questionId!==this.config.question.id||!parsed.state||!Array.isArray(parsed.state.evidence)) throw new Error('TRAINER_STATE_INVALID');
    parsed.state.evidence=parsed.state.evidence.map(validateEvidence);
    this.state=clone(parsed.state);
  }
}
