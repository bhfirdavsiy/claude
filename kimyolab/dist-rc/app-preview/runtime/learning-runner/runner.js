                                                                                                                 
                                                     
import { validateEvidence } from '../evidence/types.js';
                                                                   
import { scoreAssessment,                       } from '../../domain/assessment/scoring.js';
import { computeConceptMastery,                                         } from '../../domain/mastery/mastery.js';
import { createProgress, reduceProgress } from '../progress/reducer.js';
                                                                 

                                            
                                                    
                                                                 
                                                        
                                                            
 

                                       
                                                                              
                                                            
                                                
                                                               
                                                        
                                                    
 

                                                         
                                       
                                         
                             
                                                                            
                        
                       
                           
                        
                 
                                                
 

                              
                                                          
                                                            
                                                              
                                                                  
                                       

                                   
                    
                        
                            
                      
                              
                           
                                
 

export class LearningRunner                  {
                   options                               ;
  constructor(options                               ){ this.options=options; }

  async run(learningUnitId       ,context        )                                                                            {
    const o=this.options;
    const unit=o.repository.getLearningUnit(learningUnitId);
    if(!unit) return {ok:false,error:{code:'LEARNING_UNIT_NOT_FOUND',learningUnitId}};
    const mapping=o.repository.getPrimaryMapping(learningUnitId);
    if(!mapping) return {ok:false,error:{code:'PRIMARY_MAPPING_NOT_FOUND',learningUnitId}};
    if(!mapping.theoryActivityId) return {ok:false,error:{code:'THEORY_ACTIVITY_NOT_FOUND',theoryActivityId:''}};
    const theory=o.repository.getTheoryActivity(mapping.theoryActivityId);
    if(!theory) return {ok:false,error:{code:'THEORY_ACTIVITY_NOT_FOUND',theoryActivityId:mapping.theoryActivityId}};
    const practice=o.repository.getPracticeActivity(mapping.practiceActivityId);
    if(!practice) return {ok:false,error:{code:'PRACTICE_ACTIVITY_NOT_FOUND',practiceActivityId:mapping.practiceActivityId}};

    const now=o.now();
    let progress=await o.store.loadProgress(learningUnitId)??createProgress(learningUnitId,o.contentVersion,o.schemaVersion,now);
    progress=reduceProgress(progress,{type:'OPEN',at:now});
    await o.store.saveProgress(progress);

    const practiceRun=await o.practiceRouter.run(practice,context);
    if(!practiceRun.ok) return {ok:false,error:practiceRun.error};
    const practiceEvidence=practiceRun.value.evidence.map(validateEvidence);
    for(const evidence of practiceEvidence) await o.store.saveEvidence(evidence);
    if(practiceRun.value.serializedState!==undefined){
      progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:practice.id,serializedState:practiceRun.value.serializedState,at:o.now()});
    }
    progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at:o.now()});
    await o.store.saveProgress(progress);

    const assessmentEvidence=(await o.assessmentRunner(unit,context)).map(validateEvidence);
    for(const evidence of assessmentEvidence) await o.store.saveEvidence(evidence);
    const assessment=scoreAssessment({
      id:`assessment.${learningUnitId}.${o.now()}`,
      learningUnitId,
      evidence:assessmentEvidence,
      assessmentVersion:o.assessmentVersion,
      scoringVersion:o.scoringVersion,
      createdAt:o.now(),
    });
    await o.store.saveAssessment(assessment);
    progress=reduceProgress(progress,{type:'ASSESSMENT_COMPLETE',at:o.now()});

    const mastery                 =[];
    for(const conceptId of unit.conceptIds){
      const allEvidence=await o.store.loadEvidenceForConcept(conceptId);
      const result=computeConceptMastery({
        conceptId,
        evidence:allEvidence,
        scoringVersion:o.scoringVersion,
        transferRequired:o.transferRequired?.(conceptId)??false,
      });
      mastery.push(result);
      await o.store.saveMastery(result);
    }

    let aggregate              ='developing';
    if(mastery.length&&mastery.every(m=>m.status==='mastered')) aggregate='mastered';
    else if(mastery.some(m=>m.status==='needs_review')) aggregate='needs_review';
    progress=reduceProgress(progress,{type:'MASTERY_UPDATED',masteryStatus:aggregate,at:o.now()});
    await o.store.saveProgress(progress);

    return {ok:true,value:{unit,theory,practice,evidence:[...practiceEvidence,...assessmentEvidence],assessment,mastery,progress}};
  }
}
