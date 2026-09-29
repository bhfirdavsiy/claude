import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.js';
import {createProgress,reduceProgress} from '../../runtime/progress/reducer.js';
                                                                          
                                                                   
import {bindEvidenceToAttempt,bindDraftsToAttempt,draftSignature,validateEvidence,                                   } from '../../runtime/evidence/types.js';
import {computeConceptMastery,                                                                 } from '../../domain/mastery/mastery.js';
import {newUuid} from '../../runtime/shared/ids.js';

function isComplete(page                         ,result    )        {
  const status=result?.finalState?.status;
  if(status==='complete'||status==='correct') return true;
  if(page.type==='simulation') return (result?.evidence??[]).some((e    )=>e.type==='construction'&&e.achieved===true);
  return false;
}

                                
                        
                           
                                
                                                      
 

                                      
                        
                       
 

                                       
                                
                   
                               
                           
 

/**
 * One practice page session = one learner Attempt. The engine re-runs over the whole accumulated input
 * on every UI command, so the same evidence is emitted again and again; only drafts that are new or
 * changed (ignoring their run timestamp) are appended to the session's attempt.
 */
                                         
                             
                            
                   
                                       
 

function truthyState(value                 ){
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
                   store                       ;
                   now           ;
                   newId           ;
          versionPolicy                      ;
  constructor(factory    =(globalThis       ).indexedDB,dbName='kimyolab-runtime',options                                                                        ={}){
    this.now=options.now??(()=>new Date().toISOString());
    this.newId=options.newId??newUuid;
    this.versionPolicy=options.versionPolicy;
    this.store=new IndexedDbProgressStore(factory,dbName,undefined,{now:this.now,newId:this.newId});
  }
  get storage(){return this.store;}
  /** Applies the active pack's declared evidence compatibility (see content manifest `evidenceCompatibility`). */
  setVersionPolicy(policy                               ){this.versionPolicy=policy;}

  /** Starts the attempt boundary for one opened practice page (see PracticeAttemptSession). */
  beginPracticeSession(page                         )                       {
    return {activityId:page.id,startedAt:this.now(),recorded:new Map()};
  }

  async recordPracticeResult(page                         ,result    ,session                        )                              {
    return (await this.recordPracticeAttempt(page,result,session)).progress;
  }

  /**
   * Without a session every call is one complete, independent attempt (e.g. a submitted run).
   * With a session, calls are UI commands of the same attempt and evidence is de-duplicated.
   */
  async recordPracticeAttempt(page                         ,result    ,session                        )                              {
    if(session&&session.activityId!==page.id) throw new Error('PRACTICE_SESSION_ACTIVITY_MISMATCH');
    const at=this.now();
    let progress=await this.store.loadProgress(page.learningUnit.id)??createProgress(page.learningUnit.id,page.contentVersion,page.schemaVersion,at);
    progress=reduceProgress(progress,{type:'OPEN',at});
    if(typeof result?.serializedState==='string') progress=reduceProgress(progress,{type:'SAVE_ACTIVITY_STATE',activityId:page.id,serializedState:result.serializedState,at});
    const allDrafts          =Array.isArray(result?.evidence)?result.evidence:[];
    const drafts=session?allDrafts.filter(raw=>{const d=validateEvidence(raw);return session.recorded.get(d.id)!==draftSignature(d);}):allDrafts;
    let attempt                  =session?.attempt;
    let evidence                    =[];
    let mastery                 =[];
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
      const context               ={contentVersion:page.contentVersion,scoringVersion:page.scoringVersion,...(page.curriculumVersion?{curriculumVersion:page.curriculumVersion}:{})};
      mastery=await this.recomputeMastery([...new Set(evidence.map(e=>e.conceptId))],context);
    }
    if(isComplete(page,result)) progress=reduceProgress(progress,{type:'PRACTICE_COMPLETE',at});
    progress={...progress,contentVersion:page.contentVersion};
    await this.store.saveProgress(progress);
    return {progress,attempt,evidence,mastery};
  }

  /** Recomputes and caches mastery for the given concepts under an explicit version context. */
  async recomputeMastery(conceptIds         ,context               )                          {
    const out                 =[];
    for(const conceptId of conceptIds){
      const all=await this.store.loadEvidenceForConcept(conceptId);
      const mastery=computeConceptMastery({conceptId,evidence:all,scoringVersion:context.scoringVersion,context,versionPolicy:this.versionPolicy});
      await this.store.saveMastery(mastery);
      out.push(mastery);
    }
    return out;
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
