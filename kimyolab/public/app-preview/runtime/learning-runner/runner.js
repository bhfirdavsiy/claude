// LearningRunner — compatibility facade (P1.0). It resolves content from the repository and runs the
// practice engine, then DELEGATES every state change, persistence step and mastery computation to the
// canonical LearningOrchestrator. It holds no progress, attempt or mastery logic of its own.
                                                                                                                 
                                                                                 
                                                                   
                                                                           
                                                                                            
                                                                 
import { LearningOrchestrator } from '../learning-orchestrator/orchestrator.js';
import { beginInputFromActivity } from '../learning-orchestrator/adapters.js';
                                                                                           

                                            
                                                    
                                                                 
                                                        
                                                            
 

/** Persistence port of the canonical runtime (implemented by IndexedDbProgressStore). */
                                                     

                                                         
                                       
                                         
                             
                                                                            
                        
                       
                           
                        
                            
                                                                                                     
                                      
                 
                    
                                                
 

                              
                                                          
                                                            
                                                              
                                                                  
                                       

                                   
                    
                        
                            
                               
                     
                              
                           
                                
 

export class LearningRunner                  {
                   options                               ;
  /** The canonical workflow authority this facade delegates to. */
           orchestrator                     ;
  constructor(options                               ){
    this.options=options;
    this.orchestrator=new LearningOrchestrator(options.store,{now:options.now,newId:options.newId,versionPolicy:options.versionPolicy,transferRequired:options.transferRequired});
  }

          versions()               {
    const o=this.options;
    return {contentVersion:o.contentVersion,contentSchemaVersion:o.schemaVersion,scoringVersion:o.scoringVersion,...(o.curriculumVersion?{curriculumVersion:o.curriculumVersion}:{})};
  }

  completeTheory(learningUnitId       ){ return this.orchestrator.completeTheory(learningUnitId,this.versions()); }
  submitReinforcement(learningUnitId       ,payload                       ){ return this.orchestrator.submitReinforcement(learningUnitId,this.versions(),payload); }

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

    const versions=this.versions();
    const orchestrator=this.orchestrator;
    await orchestrator.openUnit(learningUnitId,versions);

    // The runner contract: one run = one complete practice attempt.
    const session=orchestrator.beginPractice(beginInputFromActivity(learningUnitId,practice,versions,unit.conceptIds));
    const practiceRun=await o.practiceRouter.run(practice,context);
    if(!practiceRun.ok){ await orchestrator.leavePractice(session); return {ok:false,error:practiceRun.error}; }
    const step=await orchestrator.applyPracticeResult(session,practiceRun.value);
    const completed=await orchestrator.completePractice(step.session);

    const assessmentDrafts=await o.assessmentRunner(unit,context);
    const assessed=await orchestrator.submitAssessment({learningUnitId,versions,assessmentVersion:o.assessmentVersion,drafts:assessmentDrafts,conceptIds:unit.conceptIds});

    return {ok:true,value:{
      unit,theory,practice,
      evidence:[...step.evidence,...assessed.evidence],
      attempts:[completed.attempt,assessed.attempt],
      assessment:assessed.assessment,
      mastery:assessed.mastery,
      progress:assessed.progress,
    }};
  }
}
