// BrowserProgressService — browser-facing facade (P1.0). It keeps the API the UI already uses, but owns
// no workflow: every state change, evidence persistence and mastery computation is delegated to the
// canonical LearningOrchestrator. It only translates page models into canonical inputs.
import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.js';
                                                                          
                                                                   
                                                                               
                                                                                                        
import {newUuid} from '../../runtime/shared/ids.js';
import {createWebLocksLiveness} from './liveness.js';
import {LearningOrchestrator} from '../../runtime/learning-orchestrator/orchestrator.js';
import {beginInputFromPage,versionsFromPage,versionsFromRuntime} from '../../runtime/learning-orchestrator/adapters.js';
                                                                                                                                             
import {isPracticeComplete,isReinforcementComplete,isTheoryComplete} from '../../runtime/learning-orchestrator/selectors.js';

                                
                        
                           
                                
                                                      
 

                                      
                        
                       
                         
                            
 

                                       
                                
                   
                               
                           
 

/** One opened practice page = one Attempt (see LearningOrchestrator.beginPractice). */
                                                        

export class BrowserProgressService {
                   store                       ;
                   orchestrator                     ;
  constructor(factory    =(globalThis       ).indexedDB,dbName='kimyolab-runtime',options                                                                                                           ={}){
    const now=options.now??(()=>new Date().toISOString());
    const newId=options.newId??newUuid;
    this.store=new IndexedDbProgressStore(factory,dbName,undefined,{now,newId});
    const liveness=options.liveness===null?undefined:options.liveness??createWebLocksLiveness();
    this.orchestrator=new LearningOrchestrator(this.store,{now,newId,versionPolicy:options.versionPolicy,...(liveness?{liveness}:{})});
  }
  get storage(){return this.store;}
  /** Applies the active pack's declared evidence compatibility (see content manifest `evidenceCompatibility`). */
  setVersionPolicy(policy                               ){this.orchestrator.setVersionPolicy(policy);}

  /** BEGIN_PRACTICE for an opened practice page; pass the engine to route commands through the orchestrator. */
  beginPracticeSession(page                         ,engine                    )                       {
    return this.orchestrator.beginPractice(beginInputFromPage(page,engine));
  }

  /** APPLY_PRACTICE_COMMAND: engine → evidence boundary → progress. Persistence errors come back as `persistError`. */
  applyPracticeCommand(session                       ,command        ){
    return this.orchestrator.applyPracticeCommand(session,command);
  }

  abandonPracticeSession(session                       ){return this.orchestrator.abandonPractice(session);}
  /** The learner left the practice page (route change, back/forward): abandons only an unfinished attempt. */
  leavePracticeSession(session                       ){return this.orchestrator.leavePractice(session);}
  /** Boot-time recovery for page lifetimes that ended without a leave (refresh, tab/window close). */
  recoverOrphanedAttempts(){return this.orchestrator.recoverOrphanedAttempts();}
  retryPracticeSession(session                       ,engine                    ){return this.orchestrator.retryPractice(session,engine);}

  async recordPracticeResult(page                         ,result    ,session                        )                              {
    return (await this.recordPracticeAttempt(page,result,session)).progress;
  }

  /**
   * With a session: one more result of the same attempt (evidence de-duplicated by the orchestrator).
   * Without a session: the result is one complete, independent attempt (legacy single-call contract).
   */
  async recordPracticeAttempt(page                         ,result    ,session                        )                              {
    if(session&&session.activityId!==page.id) throw new Error('PRACTICE_SESSION_ACTIVITY_MISMATCH');
    const active=session??this.orchestrator.beginPractice(beginInputFromPage(page));
    const step=await this.orchestrator.applyPracticeResult(active,result);
    // Single-call contract: the call is a final submission, so its attempt is closed right away.
    const attempt=session?undefined:await this.orchestrator.closePractice(step.session);
    return {progress:step.progress,...(attempt?{attempt}:{}),evidence:step.evidence,mastery:step.mastery};
  }

  /** RECOMPUTE_MASTERY under an explicit version context (delegated). */
  recomputeMastery(conceptIds         ,context                                                                                                          )                          {
    return this.orchestrator.recomputeMastery(conceptIds,context);
  }

  markGuideComplete(learningUnitId       ,versions                    )                              {
    return this.orchestrator.completeTheory(learningUnitId,versionsFromRuntime(versions));
  }

  /** SUBMIT_REINFORCEMENT: records reflection/reinforcement completion. It is not an assessment (C5). */
  recordReinforcement(learningUnitId       ,versions                    ,payload                       )                              {
    return this.orchestrator.submitReinforcement(learningUnitId,versionsFromRuntime(versions),payload);
  }

  /** SUBMIT_ASSESSMENT boundary (P1.2 will wire it to the UI; not used by the browser flow yet — C2). */
  submitAssessment(learningUnitId       ,versions               ,input                                                                ){
    return this.orchestrator.submitAssessment({learningUnitId,versions,...input});
  }

  async getCycleSnapshot(learningUnitId       )                       {
    const progress=await this.store.loadProgress(learningUnitId);
    return {
      guideComplete:isTheoryComplete(progress),
      practiceComplete:isPracticeComplete(progress),
      reinforcementComplete:isReinforcementComplete(progress),
      status:progress?.status??'not_started',
    };
  }
  listProgress(){return this.store.listProgress();}
  loadProgress(learningUnitId       ){return this.store.loadProgress(learningUnitId);}
}

export {versionsFromPage};
