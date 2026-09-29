import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';
import {createProgress,reduceProgress} from '../../runtime/progress/reducer.ts';
import type {LearningUnitProgress} from '../../runtime/progress/types.ts';
import type {StudentPracticePageModel} from '../practice/model.ts';

function isComplete(page:StudentPracticePageModel,result:any):boolean{
  const status=result?.finalState?.status;
  if(status==='complete'||status==='correct') return true;
  if(page.type==='simulation') return (result?.evidence??[]).some((e:any)=>e.type==='construction'&&e.achieved===true);
  return false;
}

export interface CycleSnapshot {
  guideComplete:boolean;
  practiceComplete:boolean;
  reinforcementComplete:boolean;
  status:LearningUnitProgress['status']|'not_started';
}

export interface RuntimeVersionsLike {
  contentVersion:string;
  schemaVersion:string;
}

function truthyState(value:string|undefined){
  if(!value) return false;
  if(value==='complete') return true;
  try{return Boolean(JSON.parse(value)?.complete);}catch{return false;}
}

export class BrowserProgressService {
  private readonly store:IndexedDbProgressStore;
  private readonly now:()=>string;
  constructor(factory:any=(globalThis as any).indexedDB,dbName='kimyolab-runtime',options:{now?:()=>string}={}){
    this.store=new IndexedDbProgressStore(factory,dbName); this.now=options.now??(()=>new Date().toISOString());
  }
  async recordPracticeResult(page:StudentPracticePageModel,result:any):Promise<LearningUnitProgress>{
    const at=this.now();
    let progress=await this.store.loadProgress(page.learningUnit.id)??createProgress(page.learningUnit.id,page.contentVersion,page.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    if(typeof result?.serializedState==='string') progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:page.id,serializedState:result.serializedState,at});
    for(const evidence of result?.evidence??[]) await this.store.saveEvidence(evidence);
    if(isComplete(page,result)) progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at});
    await this.store.saveProgress(progress); return progress;
  }
  async markGuideComplete(learningUnitId:string,versions:RuntimeVersionsLike):Promise<LearningUnitProgress>{
    const at=this.now();
    let progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:'cycle.guide',serializedState:JSON.stringify({complete:true,completedAt:at}),at});
    await this.store.saveProgress(progress); return progress;
  }
  async recordReinforcement(learningUnitId:string,versions:RuntimeVersionsLike,payload:Record<string,unknown>):Promise<LearningUnitProgress>{
    const at=this.now();
    let progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:'cycle.reinforcement',serializedState:JSON.stringify({complete:true,completedAt:at,...payload}),at});
    progress=reduceProgress(progress,{type:'ASSESSMENT_COMPLETE',at});
    await this.store.saveProgress(progress); return progress;
  }
  async getCycleSnapshot(learningUnitId:string):Promise<CycleSnapshot>{
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
  loadProgress(learningUnitId:string){return this.store.loadProgress(learningUnitId);}
}
