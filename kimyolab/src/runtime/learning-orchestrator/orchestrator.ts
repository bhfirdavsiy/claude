// LearningOrchestrator (P1.0) — the single workflow authority for a LearningUnit.
//
// It owns: unit lifecycle, progress transitions (via the pure reducer), practice attempt lifecycle,
// evidence acceptance and the persistence request, mastery recomputation and snapshots.
// It does NOT render, fetch content, compute chemistry, implement engines or touch IndexedDB APIs:
// engines are reached through PracticeEnginePort and persistence through LearningStorePort.
import type {LearningUnitProgress} from '../progress/types.ts';
import {createProgress,reduceProgress,type ProgressEvent} from '../progress/reducer.ts';
import {bindDraftsToAttempt,draftSignature,validateAttempt,validateEvidence,type Attempt,type PersistedEvidence} from '../evidence/types.ts';
import {computeConceptMastery,type ConceptMastery,type MasteryContext,type MasteryVersionPolicy} from '../../domain/mastery/mastery.ts';
import {scoreAssessment,type AssessmentResult} from '../../domain/assessment/scoring.ts';
import {evaluateAssessment,evaluationToEvidenceDrafts,type AssessmentEvaluation,type AssessmentResponse} from '../../domain/assessment/evaluator.ts';
import {assessmentIdFor} from '../../domain/assessment/model.ts';
import {newUuid} from '../shared/ids.ts';
import type {PracticeType} from '../../domain/content/types.ts';
import type {LearningIntent} from './events.ts';
import type {AssessmentContentSource,AssessmentSessionState,LearningSnapshot,LearningStorePort,OrchestratorOptions,PracticeEnginePort,PracticeSessionState,SessionLivenessPort,VersionContext} from './types.ts';
import {aggregateMasteryStatus,assessmentView,buildSnapshot,sessionView,type AssessmentSessionRecord,type SessionRecord} from './state.ts';
import {isPracticeResultComplete} from './selectors.ts';

export interface BeginPracticeInput {
  learningUnitId:string;
  activityId:string;
  activityVersion:string;
  practiceType:PracticeType;
  versions:VersionContext;
  engine?:PracticeEnginePort;
  /** LearningUnit concepts; mastery for these is part of the unit's canonical state. */
  conceptIds?:string[];
}

export interface PracticeStepResult {
  session:PracticeSessionState;
  progress:LearningUnitProgress;
  /** Evidence persisted by THIS step (new or changed semantic evidence only). */
  evidence:PersistedEvidence[];
  mastery:ConceptMastery[];
  complete:boolean;
}

export interface AssessmentStepResult {
  attempt:Attempt;
  evidence:PersistedEvidence[];
  assessment:AssessmentResult;
  mastery:ConceptMastery[];
  progress:LearningUnitProgress;
}

function masteryContext(v:Pick<VersionContext,'contentVersion'|'scoringVersion'|'curriculumVersion'>):MasteryContext{
  return {contentVersion:v.contentVersion,scoringVersion:v.scoringVersion,...(v.curriculumVersion?{curriculumVersion:v.curriculumVersion}:{})};
}

function unique(ids:string[]){return [...new Set(ids)];}

export class LearningOrchestrator {
  private readonly store:LearningStorePort;
  private readonly now:()=>string;
  private readonly newId:()=>string;
  private readonly transferRequired?:(conceptId:string)=>boolean;
  private versionPolicy?:MasteryVersionPolicy;
  private readonly sessions=new Map<string,SessionRecord>();
  private readonly liveness?:SessionLivenessPort;
  private readonly assessmentContent?:AssessmentContentSource;
  private readonly assessments=new Map<string,AssessmentSessionRecord>();

  constructor(store:LearningStorePort,options:OrchestratorOptions={}){
    this.store=store;
    this.now=options.now??(()=>new Date().toISOString());
    this.newId=options.newId??newUuid;
    this.versionPolicy=options.versionPolicy;
    this.transferRequired=options.transferRequired;
    this.liveness=options.liveness;
    this.assessmentContent=options.assessmentContent;
  }

  setVersionPolicy(policy:MasteryVersionPolicy|undefined){this.versionPolicy=policy;}

  /** Generic intent entry point; the typed methods below are the same operations. */
  async dispatch(intent:LearningIntent):Promise<unknown>{
    switch(intent.type){
      case 'OPEN_UNIT': return this.openUnit(intent.learningUnitId,intent.versions);
      case 'COMPLETE_THEORY': return this.completeTheory(intent.learningUnitId,intent.versions);
      case 'BEGIN_PRACTICE': return this.beginPractice(intent);
      case 'APPLY_PRACTICE_COMMAND': return this.applyPracticeCommand(intent.session,intent.command);
      case 'APPLY_PRACTICE_RESULT': return this.applyPracticeResult(intent.session,intent.result);
      case 'COMPLETE_PRACTICE': return this.completePractice(intent.session);
      case 'ABANDON_PRACTICE': return this.abandonPractice(intent.session);
      case 'LEAVE_PRACTICE': return this.leavePractice(intent.session);
      case 'RETRY_PRACTICE': return this.retryPractice(intent.session);
      case 'SUBMIT_REINFORCEMENT': return this.submitReinforcement(intent.learningUnitId,intent.versions,intent.payload);
      case 'BEGIN_ASSESSMENT': return this.beginAssessment(intent);
      case 'SUBMIT_ASSESSMENT': return this.submitAssessment(intent.session,intent.responses);
      case 'RETRY_ASSESSMENT': return this.retryAssessment(intent.session);
      case 'SUBMIT_ASSESSMENT_EVIDENCE': return this.submitAssessmentEvidence(intent);
      case 'RECOMPUTE_MASTERY': return this.recomputeMastery(intent.conceptIds,intent.versions);
    }
  }

  // ---------------------------------------------------------------- progress (single write path)

  /** The only way progress changes: canonical events → pure reducer → one atomic store transaction. */
  private transition(learningUnitId:string,versions:VersionContext,events:(at:string)=>ProgressEvent[]):Promise<LearningUnitProgress>{
    const at=this.now();
    const planned=events(at);
    return this.store.updateProgress(learningUnitId,current=>{
      let progress=current??createProgress(learningUnitId,versions.contentVersion,versions.contentSchemaVersion,at);
      if(current&&current.contentVersion!==versions.contentVersion){
        // Monotonic achievement holds inside ONE compatibility context (same policy as evidence, P0.5).
        const compatibility=this.versionPolicy?.content?.[current.contentVersion]??'incompatible';
        progress=reduceProgress(progress,{type:'ACHIEVEMENT_CONTEXT_CHANGED',fromContentVersion:current.contentVersion,toContentVersion:versions.contentVersion,compatibility,at});
      }
      for(const event of planned) progress=reduceProgress(progress,event);
      return {...progress,contentVersion:versions.contentVersion};
    });
  }

  openUnit(learningUnitId:string,versions:VersionContext){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at}]);
  }

  completeTheory(learningUnitId:string,versions:VersionContext){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at},{type:'THEORY_COMPLETED',at}]);
  }

  submitReinforcement(learningUnitId:string,versions:VersionContext,payload:Record<string,unknown>){
    return this.transition(learningUnitId,versions,at=>[{type:'OPEN',at},{type:'REINFORCEMENT_COMPLETED',payload,at}]);
  }

  // ---------------------------------------------------------------- practice attempt lifecycle

  /** BEGIN_PRACTICE: fixes attempt identity and versions once. The attempt record is persisted lazily. */
  beginPractice(input:BeginPracticeInput):PracticeSessionState{
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
    const record:SessionRecord={
      id:attempt.id,attempt,practiceType:input.practiceType,versions:input.versions,engine:input.engine,
      conceptIds:unique(input.conceptIds??[]),status:'active',persisted:false,recorded:new Map(),evidenceCount:0,
    };
    this.sessions.set(record.id,record);
    this.liveness?.claim(attempt.id);
    return sessionView(record);
  }

  private session(view:PracticeSessionState):SessionRecord{
    const record=this.sessions.get(view.id);
    if(!record) throw new Error('PRACTICE_SESSION_UNKNOWN');
    return record;
  }

  /** APPLY_PRACTICE_COMMAND: run the engine, then the canonical result path. Persistence failures are reported, not thrown. */
  async applyPracticeCommand(view:PracticeSessionState,command:unknown):Promise<{result:any;step?:PracticeStepResult;persistError?:unknown}>{
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
  async applyPracticeResult(view:PracticeSessionState,result:any):Promise<PracticeStepResult>{
    const record=this.session(view);
    if(record.status==='abandoned') throw new Error('PRACTICE_SESSION_CLOSED');
    const drafts=(Array.isArray(result?.evidence)?result.evidence:[]).map(validateEvidence);
    const fresh=drafts.filter((d:any)=>record.recorded.get(d.id)!==draftSignature(d));
    let evidence:PersistedEvidence[]=[];
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
      ...(serializedState!==undefined?[{type:'SAVE_ACTIVITY_STATE' as const,activityId:record.attempt.activityId,serializedState,at}]:[]),
      ...(complete?[{type:'PRACTICE_COMPLETED' as const,at}]:[]),
    ]);
    if(complete&&record.status==='active') await this.finishSession(record,'completed');
    const mastery=evidence.length?await this.recomputeMastery(unique(evidence.map(e=>e.conceptId)),record.versions):[];
    return {session:sessionView(record),progress,evidence,mastery,complete};
  }

  private async finishSession(record:SessionRecord,status:'completed'|'abandoned'){
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
  async completePractice(view:PracticeSessionState):Promise<{session:PracticeSessionState;attempt:Attempt;progress:LearningUnitProgress}>{
    const record=this.session(view);
    if(record.status==='abandoned') throw new Error('PRACTICE_SESSION_CLOSED');
    if(record.status==='active') await this.finishSession(record,'completed');
    const progress=await this.transition(record.attempt.learningUnitId,record.versions,at=>[{type:'OPEN',at},{type:'PRACTICE_COMPLETED',at}]);
    return {session:sessionView(record),attempt:{...record.attempt},progress};
  }

  /**
   * Ends a session whose submission is final (single-call contract): the attempt is closed as completed
   * — it ended normally — WITHOUT a PRACTICE_COMPLETE achievement unless the result itself was complete.
   * A session that never produced evidence leaves no attempt behind.
   */
  async closePractice(view:PracticeSessionState):Promise<Attempt|undefined>{
    const record=this.session(view);
    if(record.status==='active'){
      if(record.persisted) await this.finishSession(record,'completed');
      else record.status='abandoned';
    }
    this.sessions.delete(record.id);
    this.liveness?.release(record.attempt.id);
    return record.persisted?{...record.attempt}:undefined;
  }

  /**
   * ABANDON_PRACTICE: an unfinished attempt is closed as abandoned (never shown as a success).
   * A terminal attempt takes exactly one terminal transition: abandoning a completed or already
   * abandoned attempt is rejected (ATTEMPT_ALREADY_FINISHED).
   */
  async abandonPractice(view:PracticeSessionState):Promise<PracticeSessionState>{
    const record=this.session(view);
    if(record.status!=='active') throw new Error('ATTEMPT_ALREADY_FINISHED');
    await this.finishSession(record,'abandoned');
    this.liveness?.release(record.attempt.id);
    return sessionView(record);
  }

  /**
   * LEAVE_PRACTICE: the learner left the page. An active attempt becomes abandoned; a finished one is
   * left exactly as it is. The session is released either way.
   */
  async leavePractice(view:PracticeSessionState):Promise<PracticeSessionState>{
    const record=this.session(view);
    if(record.status==='active') await this.finishSession(record,'abandoned');
    this.sessions.delete(record.id);
    this.liveness?.release(record.attempt.id);
    return sessionView(record);
  }

  /**
   * Recovery for page lifetimes that ended without LEAVE_PRACTICE (refresh, tab/window close, crash).
   * Browsers do not guarantee async IndexedDB writes during unload, so the canonical contract is:
   * an `in_progress` attempt that no live page owns is abandoned on the next boot.
   * Ownership comes from the liveness port (Web Locks in the browser). Without one, only attempts
   * older than `staleAfterMs` are considered orphaned.
   */
  async recoverOrphanedAttempts(options:{staleAfterMs?:number}={}):Promise<Attempt[]>{
    const live=await this.liveness?.liveAttemptIds();
    const now=Date.parse(this.now());
    const staleAfter=options.staleAfterMs??24*60*60*1000;
    const recovered:Attempt[]=[];
    for(const attempt of await this.store.listAttempts()){
      if(attempt.status!=='in_progress'||this.sessions.has(attempt.id)) continue;
      const orphaned=live?!live.has(attempt.id):now-Date.parse(attempt.startedAt)>staleAfter;
      if(!orphaned) continue;
      try{ recovered.push(await this.store.finishAttempt(attempt.id,'abandoned',this.now())); }
      catch(error){ if((error as any)?.code!=='ATTEMPT_ALREADY_FINISHED'&&(error as any)?.message!=='ATTEMPT_ALREADY_FINISHED') throw error; }
    }
    return recovered;
  }

  /** RETRY_PRACTICE: always a NEW attempt; the previous one is left as it was (or abandoned if unfinished). */
  async retryPractice(view:PracticeSessionState,engine?:PracticeEnginePort):Promise<PracticeSessionState>{
    const record=this.session(view);
    await this.leavePractice(view);
    return this.beginPractice({
      learningUnitId:record.attempt.learningUnitId,activityId:record.attempt.activityId,activityVersion:record.attempt.activityVersion,
      practiceType:record.practiceType,versions:record.versions,engine:engine??record.engine,conceptIds:record.conceptIds,
    });
  }

  // ---------------------------------------------------------------- assessment (boundary only in P1.0)

  /**
   * BEGIN_ASSESSMENT: one opened objective assessment = one assessment attempt. Identity, startedAt and
   * versions are fixed here; nothing is persisted until the learner submits (responses are the evidence).
   */
  beginAssessment(input:{learningUnitId:string;versions:VersionContext;conceptIds:string[]}):AssessmentSessionState{
    const record:AssessmentSessionRecord={
      id:this.newId(),learningUnitId:input.learningUnitId,versions:input.versions,conceptIds:unique(input.conceptIds),
      startedAt:this.now(),status:'open',
    };
    this.assessments.set(record.id,record);
    return assessmentView(record);
  }

  private assessmentSession(view:AssessmentSessionState):AssessmentSessionRecord{
    const record=this.assessments.get(view.id);
    if(!record) throw new Error('ASSESSMENT_SESSION_UNKNOWN');
    return record;
  }

  /**
   * SUBMIT_ASSESSMENT (canonical, C2): responses → AssessmentEvaluator (with the answer key, which only this
   * path reads) → objective evidence drafts → immutable attempt + evidence → ASSESSMENT_SUBMITTED /
   * ASSESSMENT_EVALUATED → recomputeMastery → MASTERY_UPDATED. The UI sends responses only.
   */
  async submitAssessment(view:AssessmentSessionState,responses:AssessmentResponse[]):Promise<AssessmentStepResult&{evaluation:AssessmentEvaluation;session:AssessmentSessionState}>{
    const record=this.assessmentSession(view);
    if(record.status!=='open') throw new Error('ASSESSMENT_ALREADY_SUBMITTED');
    if(!this.assessmentContent) throw new Error('ASSESSMENT_CONTENT_SOURCE_MISSING');
    const content=await this.assessmentContent.loadAssessmentForEvaluation(record.learningUnitId);
    const submittedAt=this.now();
    const assessmentId=assessmentIdFor(record.learningUnitId);
    const evaluation=evaluateAssessment({prompts:content.prompts,keys:content.keys,submission:{assessmentId,learningUnitId:record.learningUnitId,assessmentVersion:content.version,responses}});
    const drafts=evaluationToEvidenceDrafts(evaluation,{contentVersion:record.versions.contentVersion,scoringVersion:record.versions.scoringVersion,createdAt:submittedAt});
    const attempt=validateAttempt({
      id:this.newId(),learningUnitId:record.learningUnitId,activityId:assessmentId,activityVersion:content.version,
      contentVersion:record.versions.contentVersion,scoringVersion:record.versions.scoringVersion,
      ...(record.versions.curriculumVersion?{curriculumVersion:record.versions.curriculumVersion}:{}),
      startedAt:record.startedAt,completedAt:submittedAt,status:'completed',attemptType:'assessment',
    });
    record.status='submitted';
    const conceptIds=unique([...record.conceptIds,...content.prompts.flatMap(p=>p.conceptIds)]);
    const result=await this.recordEvaluatedAssessment({attempt,drafts,objectiveItems:evaluation.objectiveItems,assessmentVersion:content.version,versions:record.versions,conceptIds:record.conceptIds.length?record.conceptIds:conceptIds});
    return {...result,evaluation,session:assessmentView(record)};
  }

  /** RETRY_ASSESSMENT: a new assessment attempt. The submitted one is never changed. */
  retryAssessment(view:AssessmentSessionState):AssessmentSessionState{
    const record=this.assessmentSession(view);
    this.assessments.delete(record.id);
    return this.beginAssessment({learningUnitId:record.learningUnitId,versions:record.versions,conceptIds:record.conceptIds});
  }

  /** LEAVE_ASSESSMENT: an unsubmitted assessment leaves no attempt (no responses = no evidence). */
  leaveAssessment(view:AssessmentSessionState){
    const record=this.assessments.get(view.id);
    if(record&&record.status==='open') record.status='abandoned';
    this.assessments.delete(view.id);
  }

  /**
   * Headless adapter (LearningRunner): an assessment whose items were already evaluated by an engine arrives as
   * objective evidence drafts. Fails closed without at least one `concept-assessment` item: reflection,
   * practice or transfer evidence alone never makes a unit `assessment_complete`.
   */
  async submitAssessmentEvidence(input:{learningUnitId:string;versions:VersionContext;assessmentVersion:string;drafts:unknown[];conceptIds:string[]}):Promise<AssessmentStepResult>{
    const drafts=input.drafts.map(validateEvidence);
    const objectiveItems=drafts.filter(d=>d.evidenceClass==='concept-assessment').length;
    if(objectiveItems<1) throw new Error('ASSESSMENT_NO_OBJECTIVE_ITEMS');
    const startedAt=this.now();
    const attempt=validateAttempt({
      id:this.newId(),learningUnitId:input.learningUnitId,activityId:assessmentIdFor(input.learningUnitId),activityVersion:input.assessmentVersion,
      contentVersion:input.versions.contentVersion,scoringVersion:input.versions.scoringVersion,
      ...(input.versions.curriculumVersion?{curriculumVersion:input.versions.curriculumVersion}:{}),
      startedAt,completedAt:this.now(),status:'completed',attemptType:'assessment',
    });
    return this.recordEvaluatedAssessment({attempt,drafts,objectiveItems,assessmentVersion:input.assessmentVersion,versions:input.versions,conceptIds:input.conceptIds});
  }

  /** The single persistence path of an evaluated assessment (both entry points above end here). */
  private async recordEvaluatedAssessment(input:{attempt:Attempt;drafts:unknown[];objectiveItems:number;assessmentVersion:string;versions:VersionContext;conceptIds:string[]}):Promise<AssessmentStepResult>{
    const {attempt}=input;
    const evidence=bindDraftsToAttempt(attempt,input.drafts,this.newId);
    await this.store.recordAttempt(attempt,evidence);
    await this.transition(attempt.learningUnitId,input.versions,at=>[{type:'ASSESSMENT_SUBMITTED',attemptId:attempt.id,at}]);
    const assessment=scoreAssessment({
      id:`assessment.${attempt.learningUnitId}.${attempt.id}`,learningUnitId:attempt.learningUnitId,evidence,
      assessmentVersion:input.assessmentVersion,scoringVersion:input.versions.scoringVersion,createdAt:this.now(),
    });
    await this.store.saveAssessment(assessment);
    await this.transition(attempt.learningUnitId,input.versions,at=>[{type:'ASSESSMENT_EVALUATED',attemptId:attempt.id,objectiveItems:input.objectiveItems,score:assessment.score,at}]);
    const mastery=await this.recomputeMastery(unique([...input.conceptIds,...evidence.map(e=>e.conceptId)]),input.versions);
    const unitMastery=mastery.filter(m=>input.conceptIds.includes(m.conceptId));
    const progress=await this.transition(attempt.learningUnitId,input.versions,at=>[{type:'MASTERY_UPDATED',masteryStatus:aggregateMasteryStatus(unitMastery),at}]);
    return {attempt,evidence,assessment,mastery:unitMastery,progress};
  }

  // ---------------------------------------------------------------- mastery (derived state)

  /**
   * The ONLY mastery recomputation path. Mastery is derived from immutable evidence under an explicit
   * version context; the stored mastery record is a cache that can always be rebuilt from evidence.
   */
  async recomputeMastery(conceptIds:string[],versions:Pick<VersionContext,'contentVersion'|'scoringVersion'|'curriculumVersion'>):Promise<ConceptMastery[]>{
    const context=masteryContext(versions);
    const out:ConceptMastery[]=[];
    for(const conceptId of unique(conceptIds)){
      const evidence=await this.store.loadEvidenceForConcept(conceptId);
      const mastery=computeConceptMastery({conceptId,evidence,scoringVersion:context.scoringVersion,context,versionPolicy:this.versionPolicy,transferRequired:this.transferRequired?.(conceptId)??false});
      await this.store.saveMastery(mastery);
      out.push(mastery);
    }
    return out;
  }

  // ---------------------------------------------------------------- snapshot

  async getSnapshot(learningUnitId:string,versions:VersionContext,options:{conceptIds?:string[];session?:PracticeSessionState}={}):Promise<LearningSnapshot>{
    const at=this.now();
    const progress=await this.store.loadProgress(learningUnitId)??createProgress(learningUnitId,versions.contentVersion,versions.contentSchemaVersion,at);
    const mastery:ConceptMastery[]=[];
    for(const conceptId of unique(options.conceptIds??[])){const m=await this.store.loadMastery(conceptId);if(m)mastery.push(m);}
    const record=options.session?this.sessions.get(options.session.id):undefined;
    return buildSnapshot({progress,session:record,mastery,at});
  }
}
