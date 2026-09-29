                                                                                                                 
                                                                                 
import { bindEvidenceToAttempt } from '../evidence/types.js';
import { newUuid } from '../shared/ids.js';
                                                                   
import { scoreAssessment,                       } from '../../domain/assessment/scoring.js';
import { computeConceptMastery,                                                                    } from '../../domain/mastery/mastery.js';
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
    const newId=o.newId??newUuid;
    const versions={contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,...(o.curriculumVersion?{curriculumVersion:o.curriculumVersion}:{})};
    const practiceStartedAt=now;
    const practiceBound=bindEvidenceToAttempt({...versions,learningUnitId,activityId:practice.id,activityVersion:practice.version,startedAt:practiceStartedAt,completedAt:o.now()},practiceRun.value.evidence,newId);
    await o.store.recordAttempt(practiceBound.attempt,practiceBound.evidence);
    if(practiceRun.value.serializedState!==undefined){
      progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:practice.id,serializedState:practiceRun.value.serializedState,at:o.now()});
    }
    progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at:o.now()});
    await o.store.saveProgress(progress);

    const assessmentStartedAt=o.now();
    const assessmentDrafts=await o.assessmentRunner(unit,context);
    const assessmentBound=bindEvidenceToAttempt({...versions,learningUnitId,activityId:`assessment.${learningUnitId}`,activityVersion:o.assessmentVersion,startedAt:assessmentStartedAt,completedAt:o.now()},assessmentDrafts,newId);
    await o.store.recordAttempt(assessmentBound.attempt,assessmentBound.evidence);
    const assessment=scoreAssessment({
      id:`assessment.${learningUnitId}.${assessmentBound.attempt.id}`,
      learningUnitId,
      evidence:assessmentBound.evidence,
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
        context:versions,
        versionPolicy:o.versionPolicy,
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

    return {ok:true,value:{unit,theory,practice,evidence:[...practiceBound.evidence,...assessmentBound.evidence],attempts:[practiceBound.attempt,assessmentBound.attempt],assessment,mastery,progress}};
  }
}
