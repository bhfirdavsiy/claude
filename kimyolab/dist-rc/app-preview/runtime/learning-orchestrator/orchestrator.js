// LearningOrchestrator (P1.0) — the single workflow authority for a LearningUnit.
//
// It owns: unit lifecycle, progress transitions (via the pure reducer), practice attempt lifecycle,
// evidence acceptance and the persistence request, mastery recomputation and snapshots.
// It does NOT render, fetch content, compute chemistry, implement engines or touch IndexedDB APIs:
// engines are reached through PracticeEnginePort and persistence through LearningStorePort.
                                                               
import {createProgress,reduceProgress,                  } from '../progress/reducer.js';
import {bindDraftsToAttempt,draftSignature,validateAttempt,validateEvidence,                                   } from '../evidence/types.js';
import {computeConceptMastery,                                                                 } from '../../domain/mastery/mastery.js';
import {scoreAssessment,                     } from '../../domain/assessment/scoring.js';
import {newUuid} from '../shared/ids.js';
                                                                
                                                
                                                                                                                                              
import {aggregateMasteryStatus,buildSnapshot,sessionView,                  } from './state.js';
import {isPracticeResultComplete} from './selectors.js';

                                     
                        
                    
                         
                            
                          
                             
                                                                                        
                       
 

                                     
                               
                                
                                                                                 
                               
                           
                   
 

                                       
                  
                               
                              
                           
                                
 

function masteryContext(v                                                                           )               {
  return {contentVersion:v.contentVersion,scoringVersion:v.scoringVersion,...(v.curriculumVersion?{curriculumVersion:v.curriculumVersion}:{})};
}

function unique(ids         ){return [...new Set(ids)];}

export class LearningOrchestrator {
                   store                  ;
                   now           ;
                   newId           ;
                   transferRequired                             ;
          versionPolicy                      ;
                   sessions=new Map                      ();

  constructor(store                  ,options                    ={}){
    this.store=store;
    this.now=options.now??(()=>new Date().toISOString());
    this.newId=options.newId??newUuid;
    this.versionPolicy=options.versionPolicy;
    this.transferRequired=options.transferRequired;
  }

  setVersionPolicy(policy                               ){this.versionPolicy=policy;}

  /** Generic intent entry point; the typed methods below are the same operations. */
  async dispatch(intent               )                 {
    switch(intent.type){
      case 'OPEN_UNIT': return this.openUnit(intent.learningUnitId,intent.versions);
      case 'COMPLETE_THEORY': return this.completeTheory(intent.learningUnitId,intent.versions);
      case 'BEGIN_PRACTICE': return this.beginPractice(intent);
      case 'APPLY_PRACTICE_COMMAND': return this.applyPracticeCommand(intent.session,intent.command);
      case 'APPLY_PRACTICE_RESULT': return this.applyPracticeResult(intent.session,intent.result);
      case 'COMPLETE_PRACTICE': return this.completePractice(intent.session);
      case 'ABANDON_PRACTICE': return this.abandonPractice(intent.session);
      case 'RETRY_PRACTICE': return this.retryPractice(intent.session);
      case 'SUBMIT_REINFORCEMENT': return this.submitReinforcement(intent.learningUnitId,intent.versions,intent.payload);
      case 'SUBMIT_ASSESSMENT': return this.submitAssessment(intent);
      case 'RECOMPUTE_MASTERY': return this.recomputeMastery(intent.conceptIds,intent.versions);
    }
  }

  // ---------------------------------------------------------------- progress (single write path)

  /** The only way progress changes: canonical events → pure reducer → one atomic store transaction. */
          transition(learningUnitId       ,versions               ,events                             )                              {
    const at=this.now();
    const planned=events(at);
    return this.store.updateProgress(learningUnitId,current=>{
      let progress=current??createProgress(learningUnitId,versions.contentVersion,versions.contentSchemaVersion,at);
      for(const event of planned) progress=reduceProgress(progress,event);
      return {...progress,contentVersion:versions.contentVersion};
    });
  }

  openUnit(learningUnitId       ,versions               ){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at}]);
  }

  completeTheory(learningUnitId       ,versions               ){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at},{type:'THEORY_COMPLETE',at}]);
  }

  submitReinforcement(learningUnitId       ,versions               ,payload                       ){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at},{type:'REINFORCEMENT_COMPLETE',payload,at}]);
  }

  // ---------------------------------------------------------------- practice attempt lifecycle

  /** BEGIN_PRACTICE: fixes attempt identity and versions once. The attempt record is persisted lazily. */
  beginPractice(input                   )                     {
    const attempt=validateAttempt({
      id:this.newId(),
      learningUnitId:input.learningUnitId,
      activityId:input.activityId,
      activityVersion:input.activityVersion,
      contentVersion:input.versions.contentVersion,
      scoringVersion:input.versions.scoringVersion,
      ...(input.versions.curriculumVersion?{curriculumVersion:input.versions.curriculumVersion}:{}),
      startedAt:this.now(),
      status:'in_progress',
    });
    const record              ={
      id:attempt.id,attempt,practiceType:input.practiceType,versions:input.versions,engine:input.engine,
      conceptIds:unique(input.conceptIds??[]),status:'active',persisted:false,recorded:new Map(),evidenceCount:0,
    };
    this.sessions.set(record.id,record);
    return sessionView(record);
  }

          session(view                     )              {
    const record=this.sessions.get(view.id);
    if(!record) throw new Error('PRACTICE_SESSION_UNKNOWN');
    return record;
  }

  /** APPLY_PRACTICE_COMMAND: run the engine, then the canonical result path. Persistence failures are reported, not thrown. */
  async applyPracticeCommand(view                     ,command        )                                                                     {
    const record=this.session(view);
    if(!record.engine) throw new Error('PRACTICE_ENGINE_MISSING');
    if(record.status==='abandoned') throw new Error('PRACTICE_SESSION_CLOSED');
    const result=await record.engine.apply(command);
    try{ return {result,step:await this.applyPracticeResult(view,result)}; }
    catch(error){ return {result,persistError:error}; }
  }

  /**
   * Evidence persistence boundary. Only evidence that is new or changed within this attempt
   * (engine id + content, ignoring run timestamp) is persisted; the engine's cumulative re-emission
   * of earlier evidence is intermediate state, not new evidence.
   */
  async applyPracticeResult(view                     ,result    )                            {
    const record=this.session(view);
    if(record.status==='abandoned') throw new Error('PRACTICE_SESSION_CLOSED');
    const drafts=(Array.isArray(result?.evidence)?result.evidence:[]).map(validateEvidence);
    const fresh=drafts.filter((d    )=>record.recorded.get(d.id)!==draftSignature(d));
    let evidence                    =[];
    if(fresh.length){
      evidence=bindDraftsToAttempt(record.attempt,fresh,this.newId);
      if(record.persisted) await this.store.appendAttemptEvidence(record.attempt.id,evidence);
      else{ await this.store.recordAttempt(record.attempt,evidence); record.persisted=true; }
      for(const d of fresh) record.recorded.set(d.id,draftSignature(d));
      record.evidenceCount+=evidence.length;
    }
    const complete=isPracticeResultComplete(record.practiceType,result);
    const serializedState=typeof result?.serializedState==='string'?result.serializedState:undefined;
    const progress=await this.transition(record.attempt.learningUnitId,record.versions,at=>[
      {type:'OPEN',at},
      ...(serializedState!==undefined?[{type:'SAVE_ACTIVITY_STATE'         ,activityId:record.attempt.activityId,serializedState,at}]:[]),
      ...(complete?[{type:'PRACTICE_COMPLETE'         ,at}]:[]),
    ]);
    if(complete&&record.status==='active') await this.finishSession(record,'completed');
    const mastery=evidence.length?await this.recomputeMastery(unique(evidence.map(e=>e.conceptId)),record.versions):[];
    return {session:sessionView(record),progress,evidence,mastery,complete};
  }

          async finishSession(record              ,status                        ){
    const at=this.now();
    if(record.persisted) record.attempt=await this.store.finishAttempt(record.attempt.id,status,at);
    else if(status==='completed'){
      // A completed attempt is a real learner attempt even without evidence (e.g. a runner step).
      record.attempt=validateAttempt({...record.attempt,status,completedAt:at});
      await this.store.recordAttempt(record.attempt,[]);
      record.persisted=true;
    }else record.attempt=validateAttempt({...record.attempt,status,completedAt:at});
    record.status=status;
  }

  /** COMPLETE_PRACTICE: explicit completion (runner contract). Idempotent for an already completed session. */
  async completePractice(view                     )                                                                                      {
    const record=this.session(view);
    if(record.status==='abandoned') throw new Error('PRACTICE_SESSION_CLOSED');
    if(record.status==='active') await this.finishSession(record,'completed');
    const progress=await this.transition(record.attempt.learningUnitId,record.versions,at=>[{type:'OPEN',at},{type:'PRACTICE_COMPLETE',at}]);
    return {session:sessionView(record),attempt:{...record.attempt},progress};
  }

  /**
   * Ends a session whose submission is final (single-call contract): the attempt is closed as completed
   * — it ended normally — WITHOUT a PRACTICE_COMPLETE achievement unless the result itself was complete.
   * A session that never produced evidence leaves no attempt behind.
   */
  async closePractice(view                     )                           {
    const record=this.session(view);
    if(record.status==='active'){
      if(record.persisted) await this.finishSession(record,'completed');
      else record.status='abandoned';
    }
    this.sessions.delete(record.id);
    return record.persisted?{...record.attempt}:undefined;
  }

  /** ABANDON_PRACTICE: an unfinished attempt is closed as abandoned (never shown as a success). */
  async abandonPractice(view                     )                              {
    const record=this.session(view);
    if(record.status==='active') await this.finishSession(record,'abandoned');
    this.sessions.delete(record.id);
    return sessionView(record);
  }

  /** RETRY_PRACTICE: always a NEW attempt; the previous one is left as it was (or abandoned if unfinished). */
  async retryPractice(view                     ,engine                    )                              {
    const record=this.session(view);
    await this.abandonPractice(view);
    return this.beginPractice({
      learningUnitId:record.attempt.learningUnitId,activityId:record.attempt.activityId,activityVersion:record.attempt.activityVersion,
      practiceType:record.practiceType,versions:record.versions,engine:engine??record.engine,conceptIds:record.conceptIds,
    });
  }

  // ---------------------------------------------------------------- assessment (boundary only in P1.0)

  /** SUBMIT_ASSESSMENT: scored evidence → assessment result → unit mastery → MASTERY_UPDATED. Not wired to the UI (C2). */
  async submitAssessment(input                                                                                                              )                              {
    const at=this.now();
    const attempt=validateAttempt({
      id:this.newId(),learningUnitId:input.learningUnitId,activityId:`assessment.${input.learningUnitId}`,activityVersion:input.assessmentVersion,
      contentVersion:input.versions.contentVersion,scoringVersion:input.versions.scoringVersion,
      ...(input.versions.curriculumVersion?{curriculumVersion:input.versions.curriculumVersion}:{}),
      startedAt:at,completedAt:this.now(),status:'completed',
    });
    const evidence=bindDraftsToAttempt(attempt,input.drafts,this.newId);
    await this.store.recordAttempt(attempt,evidence);
    const assessment=scoreAssessment({
      id:`assessment.${input.learningUnitId}.${attempt.id}`,learningUnitId:input.learningUnitId,evidence,
      assessmentVersion:input.assessmentVersion,scoringVersion:input.versions.scoringVersion,createdAt:this.now(),
    });
    await this.store.saveAssessment(assessment);
    await this.transition(input.learningUnitId,input.versions,a=>[{type:'ASSESSMENT_COMPLETE',at:a}]);
    const mastery=await this.recomputeMastery(unique([...input.conceptIds,...evidence.map(e=>e.conceptId)]),input.versions);
    const unitMastery=mastery.filter(m=>input.conceptIds.includes(m.conceptId));
    const progress=await this.transition(input.learningUnitId,input.versions,a=>[{type:'MASTERY_UPDATED',masteryStatus:aggregateMasteryStatus(unitMastery),at:a}]);
    return {attempt,evidence,assessment,mastery:unitMastery,progress};
  }

  // ---------------------------------------------------------------- mastery (derived state)

  /**
   * The ONLY mastery recomputation path. Mastery is derived from immutable evidence under an explicit
   * version context; the stored mastery record is a cache that can always be rebuilt from evidence.
   */
  async recomputeMastery(conceptIds         ,versions                                                                           )                          {
    const context=masteryContext(versions);
    const out                 =[];
    for(const conceptId of unique(conceptIds)){
      const evidence=await this.store.loadEvidenceForConcept(conceptId);
      const mastery=computeConceptMastery({conceptId,evidence,scoringVersion:context.scoringVersion,context,versionPolicy:this.versionPolicy,transferRequired:this.transferRequired?.(conceptId)??false});
      await this.store.saveMastery(mastery);
      out.push(mastery);
    }
    return out;
  }

  // ---------------------------------------------------------------- snapshot

  async getSnapshot(learningUnitId       ,versions               ,options                                                     ={})                          {
    const at=this.now();
    const progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.contentSchemaVersion,at);
    const mastery                 =[];
    for(const conceptId of unique(options.conceptIds??[])){const m=await this.store.loadMastery(conceptId);if(m)mastery.push(m);}
    const record=options.session?this.sessions.get(options.session.id):undefined;
    return buildSnapshot({progress,session:record,mastery,at});
  }
}
