import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';
import {createProgress,reduceProgress} from '../../runtime/progress/reducer.ts';
import type {LearningUnitProgress} from '../../runtime/progress/types.ts';
import type {StudentPracticePageModel} from '../practice/model.ts';
import {bindEvidenceToAttempt,bindDraftsToAttempt,draftSignature,validateEvidence,type Attempt,type PersistedEvidence} from '../../runtime/evidence/types.ts';
import {computeConceptMastery,type ConceptMastery,type MasteryContext,type MasteryVersionPolicy} from '../../domain/mastery/mastery.ts';
import {newUuid} from '../../runtime/shared/ids.ts';

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

export interface PracticeRecordResult {
  progress:LearningUnitProgress;
  attempt?:Attempt;
  evidence:PersistedEvidence[];
  mastery:ConceptMastery[];
}

/**
 * One practice page session = one learner Attempt. The engine re-runs over the whole accumulated input
 * on every UI command, so the same evidence is emitted again and again; only drafts that are new or
 * changed (ignoring their run timestamp) are appended to the session's attempt.
 */
export interface PracticeAttemptSession {
  readonly activityId:string;
  readonly startedAt:string;
  attempt?:Attempt;
  readonly recorded:Map<string,string>;
}

function truthyState(value:string|undefined){
  if(!value) return false;
  if(value==='complete') return true;
  try{return Boolean(JSON.parse(value)?.complete);}catch{return false;}
}

/**
 * Storage adapter used by the browser UI. Every practice submission is an
 * independent Attempt; evidence is appended (never overwritten) and mastery is
 * recomputed only from evidence compatible with the active content version.
 */
export class BrowserProgressService {
  private readonly store:IndexedDbProgressStore;
  private readonly now:()=>string;
  private readonly newId:()=>string;
  private versionPolicy?:MasteryVersionPolicy;
  constructor(factory:any=(globalThis as any).indexedDB,dbName='kimyolab-runtime',options:{now?:()=>string;newId?:()=>string;versionPolicy?:MasteryVersionPolicy}={}){
    this.now=options.now??(()=>new Date().toISOString());
    this.newId=options.newId??newUuid;
    this.versionPolicy=options.versionPolicy;
    this.store=new IndexedDbProgressStore(factory,dbName,undefined,{now:this.now,newId:this.newId});
  }
  get storage(){return this.store;}
  /** Applies the active pack's declared evidence compatibility (see content manifest `evidenceCompatibility`). */
  setVersionPolicy(policy:MasteryVersionPolicy|undefined){this.versionPolicy=policy;}

  /** Starts the attempt boundary for one opened practice page (see PracticeAttemptSession). */
  beginPracticeSession(page:StudentPracticePageModel):PracticeAttemptSession{
    return {activityId:page.id,startedAt:this.now(),recorded:new Map()};
  }

  async recordPracticeResult(page:StudentPracticePageModel,result:any,session?:PracticeAttemptSession):Promise<LearningUnitProgress>{
    return (await this.recordPracticeAttempt(page,result,session)).progress;
  }

  /**
   * Without a session every call is one complete, independent attempt (e.g. a submitted run).
   * With a session, calls are UI commands of the same attempt and evidence is de-duplicated.
   */
  async recordPracticeAttempt(page:StudentPracticePageModel,result:any,session?:PracticeAttemptSession):Promise<PracticeRecordResult>{
    if(session&&session.activityId!==page.id) throw new Error('PRACTICE_SESSION_ACTIVITY_MISMATCH');
    const at=this.now();
    let progress=await this.store.loadProgress(page.learningUnit.id)??createProgress(page.learningUnit.id,page.contentVersion,page.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    if(typeof result?.serializedState==='string') progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:page.id,serializedState:result.serializedState,at});
    const allDrafts:unknown[]=Array.isArray(result?.evidence)?result.evidence:[];
    const drafts=session?allDrafts.filter(raw=>{const d=validateEvidence(raw);return session.recorded.get(d.id)!==draftSignature(d);}):allDrafts;
    let attempt:Attempt|undefined=session?.attempt;
    let evidence:PersistedEvidence[]=[];
    let mastery:ConceptMastery[]=[];
    if(drafts.length){
      if(attempt){
        evidence=bindDraftsToAttempt(attempt,drafts,this.newId);
        await this.store.appendAttemptEvidence(attempt.id,evidence);
      }else{
        const bound=bindEvidenceToAttempt({
          learningUnitId:page.learningUnit.id,
          activityId:page.id,
          activityVersion:page.activityVersion??'0',
          contentVersion:page.contentVersion,
          scoringVersion:page.scoringVersion,
          ...(page.curriculumVersion?{curriculumVersion:page.curriculumVersion}:{}),
          startedAt:session?.startedAt??at,
          completedAt:at,
        },drafts,this.newId);
        await this.store.recordAttempt(bound.attempt,bound.evidence);
        attempt=bound.attempt; evidence=bound.evidence;
        if(session) session.attempt=bound.attempt;
      }
      if(session) for(const raw of drafts){const d=validateEvidence(raw);session.recorded.set(d.id,draftSignature(d));}
      const context:MasteryContext={contentVersion:page.contentVersion,scoringVersion:page.scoringVersion,...(page.curriculumVersion?{curriculumVersion:page.curriculumVersion}:{})};
      mastery=await this.recomputeMastery([...new Set(evidence.map(e=>e.conceptId))],context);
    }
    if(isComplete(page,result)) progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at});
    progress={...progress,contentVersion:page.contentVersion};
    await this.store.saveProgress(progress);
    return {progress,attempt,evidence,mastery};
  }

  /** Recomputes and caches mastery for the given concepts under an explicit version context. */
  async recomputeMastery(conceptIds:string[],context:MasteryContext):Promise<ConceptMastery[]>{
    const out:ConceptMastery[]=[];
    for(const conceptId of conceptIds){
      const all=await this.store.loadEvidenceForConcept(conceptId);
      const mastery=computeConceptMastery({conceptId,evidence:all,scoringVersion:context.scoringVersion,context,versionPolicy:this.versionPolicy});
      await this.store.saveMastery(mastery);
      out.push(mastery);
    }
    return out;
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
