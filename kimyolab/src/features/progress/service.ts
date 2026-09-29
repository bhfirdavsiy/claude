// BrowserProgressService — browser-facing facade (P1.0). It keeps the API the UI already uses, but owns
// no workflow: every state change, evidence persistence and mastery computation is delegated to the
// canonical LearningOrchestrator. It only translates page models into canonical inputs.
import {IndexedDbProgressStore} from '../../runtime/progress/indexeddb-store.ts';
import type {LearningUnitProgress} from '../../runtime/progress/types.ts';
import type {StudentPracticePageModel} from '../practice/model.ts';
import type {Attempt,PersistedEvidence} from '../../runtime/evidence/types.ts';
import type {ConceptMastery,MasteryContext,MasteryVersionPolicy} from '../../domain/mastery/mastery.ts';
import {newUuid} from '../../runtime/shared/ids.ts';
import {createWebLocksLiveness} from './liveness.ts';
import {LearningOrchestrator} from '../../runtime/learning-orchestrator/orchestrator.ts';
import {beginInputFromPage,versionsFromPage,versionsFromRuntime} from '../../runtime/learning-orchestrator/adapters.ts';
import type {PracticeEnginePort,PracticeSessionState,SessionLivenessPort,VersionContext} from '../../runtime/learning-orchestrator/types.ts';
import {isPracticeComplete,isReinforcementComplete,isTheoryComplete} from '../../runtime/learning-orchestrator/selectors.ts';

export interface CycleSnapshot {
  guideComplete:boolean;
  practiceComplete:boolean;
  reinforcementComplete:boolean;
  status:LearningUnitProgress['status']|'not_started';
}

export interface RuntimeVersionsLike {
  contentVersion:string;
  schemaVersion:string;
  scoringVersion?:string;
  curriculumVersion?:string;
}

export interface PracticeRecordResult {
  progress:LearningUnitProgress;
  attempt?:Attempt;
  evidence:PersistedEvidence[];
  mastery:ConceptMastery[];
}

/** One opened practice page = one Attempt (see LearningOrchestrator.beginPractice). */
export type PracticeAttemptSession=PracticeSessionState;

export class BrowserProgressService {
  private readonly store:IndexedDbProgressStore;
  private readonly orchestrator:LearningOrchestrator;
  constructor(factory:any=(globalThis as any).indexedDB,dbName='kimyolab-runtime',options:{now?:()=>string;newId?:()=>string;versionPolicy?:MasteryVersionPolicy;liveness?:SessionLivenessPort|null}={}){
    const now=options.now??(()=>new Date().toISOString());
    const newId=options.newId??newUuid;
    this.store=new IndexedDbProgressStore(factory,dbName,undefined,{now,newId});
    const liveness=options.liveness===null?undefined:options.liveness??createWebLocksLiveness();
    this.orchestrator=new LearningOrchestrator(this.store,{now,newId,versionPolicy:options.versionPolicy,...(liveness?{liveness}:{})});
  }
  get storage(){return this.store;}
  /** Applies the active pack's declared evidence compatibility (see content manifest `evidenceCompatibility`). */
  setVersionPolicy(policy:MasteryVersionPolicy|undefined){this.orchestrator.setVersionPolicy(policy);}

  /** BEGIN_PRACTICE for an opened practice page; pass the engine to route commands through the orchestrator. */
  beginPracticeSession(page:StudentPracticePageModel,engine?:PracticeEnginePort):PracticeAttemptSession{
    return this.orchestrator.beginPractice(beginInputFromPage(page,engine));
  }

  /** APPLY_PRACTICE_COMMAND: engine → evidence boundary → progress. Persistence errors come back as `persistError`. */
  applyPracticeCommand(session:PracticeAttemptSession,command:unknown){
    return this.orchestrator.applyPracticeCommand(session,command);
  }

  abandonPracticeSession(session:PracticeAttemptSession){return this.orchestrator.abandonPractice(session);}
  /** The learner left the practice page (route change, back/forward): abandons only an unfinished attempt. */
  leavePracticeSession(session:PracticeAttemptSession){return this.orchestrator.leavePractice(session);}
  /** Boot-time recovery for page lifetimes that ended without a leave (refresh, tab/window close). */
  recoverOrphanedAttempts(){return this.orchestrator.recoverOrphanedAttempts();}
  retryPracticeSession(session:PracticeAttemptSession,engine?:PracticeEnginePort){return this.orchestrator.retryPractice(session,engine);}

  async recordPracticeResult(page:StudentPracticePageModel,result:any,session?:PracticeAttemptSession):Promise<LearningUnitProgress>{
    return (await this.recordPracticeAttempt(page,result,session)).progress;
  }

  /**
   * With a session: one more result of the same attempt (evidence de-duplicated by the orchestrator).
   * Without a session: the result is one complete, independent attempt (legacy single-call contract).
   */
  async recordPracticeAttempt(page:StudentPracticePageModel,result:any,session?:PracticeAttemptSession):Promise<PracticeRecordResult>{
    if(session&&session.activityId!==page.id) throw new Error('PRACTICE_SESSION_ACTIVITY_MISMATCH');
    const active=session??this.orchestrator.beginPractice(beginInputFromPage(page));
    const step=await this.orchestrator.applyPracticeResult(active,result);
    // Single-call contract: the call is a final submission, so its attempt is closed right away.
    const attempt=session?undefined:await this.orchestrator.closePractice(step.session);
    return {progress:step.progress,...(attempt?{attempt}:{}),evidence:step.evidence,mastery:step.mastery};
  }

  /** RECOMPUTE_MASTERY under an explicit version context (delegated). */
  recomputeMastery(conceptIds:string[],context:Required<Pick<MasteryContext,'contentVersion'|'scoringVersion'>>&Pick<MasteryContext,'curriculumVersion'>):Promise<ConceptMastery[]>{
    return this.orchestrator.recomputeMastery(conceptIds,context);
  }

  markGuideComplete(learningUnitId:string,versions:RuntimeVersionsLike):Promise<LearningUnitProgress>{
    return this.orchestrator.completeTheory(learningUnitId,versionsFromRuntime(versions));
  }

  /** SUBMIT_REINFORCEMENT: records reflection/reinforcement completion. It is not an assessment (C5). */
  recordReinforcement(learningUnitId:string,versions:RuntimeVersionsLike,payload:Record<string,unknown>):Promise<LearningUnitProgress>{
    return this.orchestrator.submitReinforcement(learningUnitId,versionsFromRuntime(versions),payload);
  }

  /** SUBMIT_ASSESSMENT boundary (P1.2 will wire it to the UI; not used by the browser flow yet — C2). */
  submitAssessment(learningUnitId:string,versions:VersionContext,input:{assessmentVersion:string;drafts:unknown[];conceptIds:string[]}){
    return this.orchestrator.submitAssessment({learningUnitId,versions,...input});
  }

  async getCycleSnapshot(learningUnitId:string):Promise<CycleSnapshot>{
    const progress=await this.store.loadProgress(learningUnitId);
    return {
      guideComplete:isTheoryComplete(progress),
      practiceComplete:isPracticeComplete(progress),
      reinforcementComplete:isReinforcementComplete(progress),
      status:progress?.status??'not_started',
    };
  }
  listProgress(){return this.store.listProgress();}
  loadProgress(learningUnitId:string){return this.store.loadProgress(learningUnitId);}
}

export {versionsFromPage};
