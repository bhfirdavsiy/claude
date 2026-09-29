import { validateEvidence,                                      } from '../../runtime/evidence/types.js';
import { completeCapabilities } from '../shared/types.js';

                                    
                     
                            
                   
                         
 
                             
                    
                         
                        
                        
                   
                 
                              
                               
                                
                           
                                                                        
                                                                                  
 
                            
                             
                               
                   
                        
                     
                      
 

function clone   (v  )   { return JSON.parse(JSON.stringify(v)); }
function bounded(n       )        { return Math.max(0,Math.min(1,n)); }

export class CaseEngine {
                   config           ;
          state          ={status:'active',selectedEvidenceIds:[],evidence:[]};
  constructor(config           ){ this.config=config; }

  selectEvidence(id       )      {
    if(!this.config.allowedEvidenceIds.includes(id)) throw new Error('CASE_EVIDENCE_UNKNOWN');
    if(!this.state.selectedEvidenceIds.includes(id)) this.state.selectedEvidenceIds.push(id);
  }
  setDecision(decision       )      { this.state.decision=decision; }
  setJustification(text       )      { this.state.justification=text; }
  setReflection(text       )      { this.state.reflection=text; }

  complete()                                                                 {
    if(this.state.selectedEvidenceIds.length<this.config.minEvidenceSelections) return {status:'blocked',code:'CASE_EVIDENCE_REQUIRED'};
    if(!this.state.decision) return {status:'blocked',code:'CASE_DECISION_REQUIRED'};
    if(!this.state.justification) return {status:'blocked',code:'CASE_JUSTIFICATION_REQUIRED'};
    const justification=this.config.justificationScorer(this.state.justification);
    const justificationMean=(bounded(justification.scientificAccuracy)+bounded(justification.reasoning))/2;
    if(justificationMean<this.config.justificationThreshold) return {status:'blocked',code:'CASE_JUSTIFICATION_INSUFFICIENT'};

    const evidenceUse=bounded(this.state.selectedEvidenceIds.length/Math.max(1,this.config.minEvidenceSelections));
    const decisionQuality=bounded(this.config.decisionScorer(this.state.decision,this.state.selectedEvidenceIds));
    const rubricScores={
      evidenceUse,
      scientificAccuracy:bounded(justification.scientificAccuracy),
      reasoning:bounded(justification.reasoning),
      decisionQuality,
    };
    const weights=this.config.rubric;
    const weightTotal=weights.evidenceUse+weights.scientificAccuracy+weights.reasoning+weights.decisionQuality;
    if(weightTotal<=0) throw new Error('CASE_RUBRIC_INVALID');
    const score=(rubricScores.evidenceUse*weights.evidenceUse+rubricScores.scientificAccuracy*weights.scientificAccuracy+rubricScores.reasoning*weights.reasoning+rubricScores.decisionQuality*weights.decisionQuality)/weightTotal;

    const ev                 =validateEvidence({
      id:`${this.config.activityId}.decision.1`,
      conceptId:this.config.conceptId,
      activityId:this.config.activityId,
      activityVersion:this.config.activityVersion,
      contentVersion:this.config.contentVersion,
      scoringVersion:this.config.scoringVersion,
      createdAt:this.config.now(),
      score,
      evidenceClass:'transfer-case',
      type:'decision',
      rubricScores,
      independenceKey:this.config.activityId,
    })                    ;
    this.state.evidence=[ev];
    this.state.status='complete';
    return {status:'complete',score};
  }

  getCapabilities(){ return completeCapabilities(); }
  getState()           { return clone(this.state); }
  getEvidence()            { return clone(this.state.evidence); }
  serialize()        { return JSON.stringify({activityId:this.config.activityId,state:this.state}); }
  restore(serialized       )      {
    let parsed    ;
    try{ parsed=JSON.parse(serialized); }catch{ throw new Error('CASE_STATE_INVALID'); }
    if(!parsed||parsed.activityId!==this.config.activityId||!parsed.state||!Array.isArray(parsed.state.selectedEvidenceIds)||!Array.isArray(parsed.state.evidence)) throw new Error('CASE_STATE_INVALID');
    for(const id of parsed.state.selectedEvidenceIds) if(!this.config.allowedEvidenceIds.includes(id)) throw new Error('CASE_STATE_INVALID');
    parsed.state.evidence=parsed.state.evidence.map(validateEvidence);
    this.state=clone(parsed.state);
  }
}
