import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.js';
import {createProgress,reduceProgress} from '../../runtime/progress/reducer.js';
                                                                          
                                                                   

function isComplete(page                         ,result    )        {
  const status=result?.finalState?.status;
  if(status==='complete'||status==='correct') return true;
  if(page.type==='simulation') return (result?.evidence??[]).some((e    )=>e.type==='construction'&&e.achieved===true);
  return false;
}

                                
                        
                           
                                
                                                      
 

                                      
                        
                       
 

function truthyState(value                 ){
  if(!value) return false;
  if(value==='complete') return true;
  try{return Boolean(JSON.parse(value)?.complete);}catch{return false;}
}

export class BrowserProgressService {
                   store                       ;
                   now           ;
  constructor(factory    =(globalThis       ).indexedDB,dbName='kimyolab-runtime',options                  ={}){
    this.store=new IndexedDbProgressStore(factory,dbName); this.now=options.now??(()=>new Date().toISOString());
  }
  async recordPracticeResult(page                         ,result    )                              {
    const at=this.now();
    let progress=await this.store.loadProgress(page.learningUnit.id)??createProgress(page.learningUnit.id,page.contentVersion,page.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    if(typeof result?.serializedState==='string') progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:page.id,serializedState:result.serializedState,at});
    for(const evidence of result?.evidence??[]) await this.store.saveEvidence(evidence);
    if(isComplete(page,result)) progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at});
    await this.store.saveProgress(progress); return progress;
  }
  async markGuideComplete(learningUnitId       ,versions                    )                              {
    const at=this.now();
    let progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:'cycle.guide',serializedState:JSON.stringify({complete:true,completedAt:at}),at});
    await this.store.saveProgress(progress); return progress;
  }
  async recordReinforcement(learningUnitId       ,versions                    ,payload                       )                              {
    const at=this.now();
    let progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:'cycle.reinforcement',serializedState:JSON.stringify({complete:true,completedAt:at,...payload}),at});
    progress=reduceProgress(progress,{type:'ASSESSMENT_COMPLETE',at});
    await this.store.saveProgress(progress); return progress;
  }
  async getCycleSnapshot(learningUnitId       )                       {
    const progress=await this.store.loadProgress(learningUnitId);
    if(!progress) return {guideComplete:false,practiceComplete:false,reinforcementComplete:false,status:'not_started'};
    const practiceComplete=['practice_complete','assessment_complete','mastered','needs_review'].includes(progress.status);
    const reinforcementComplete=['assessment_complete','mastered','needs_review'].includes(progress.status)||truthyState(progress.activityStates['cycle.reinforcement']);
    return {
      guideComplete:truthyState(progress.activityStates['cycle.guide']),
      practiceComplete,
      reinforcementComplete,
      status:progress.status,
    };
  }
  listProgress(){return this.store.listProgress();}
  loadProgress(learningUnitId       ){return this.store.loadProgress(learningUnitId);}
}
