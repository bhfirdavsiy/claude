// LearningRunner — compatibility facade (P1.0). It resolves content from the repository and runs the
// practice engine, then DELEGATES every state change, persistence step and mastery computation to the
// canonical LearningOrchestrator. It holds no progress, attempt or mastery logic of its own.
import type { LearningUnit, MappingLink, PracticeActivity, TheoryActivity } from '../../domain/content/types.ts';
import type { Attempt, Evidence, PersistedEvidence } from '../evidence/types.ts';
import type { PracticeRouter } from '../practice-router/router.ts';
import type { AssessmentResult } from '../../domain/assessment/scoring.ts';
import type { ConceptMastery, MasteryVersionPolicy } from '../../domain/mastery/mastery.ts';
import type { LearningUnitProgress } from '../progress/types.ts';
import { LearningOrchestrator } from '../learning-orchestrator/orchestrator.ts';
import { beginInputFromActivity } from '../learning-orchestrator/adapters.ts';
import type { LearningStorePort, VersionContext } from '../learning-orchestrator/types.ts';

export interface LearningContentRepository {
  getLearningUnit(id:string):LearningUnit|undefined;
  getPrimaryMapping(learningUnitId:string):MappingLink|undefined;
  getTheoryActivity(id:string):TheoryActivity|undefined;
  getPracticeActivity(id:string):PracticeActivity|undefined;
}

/** Persistence port of the canonical runtime (implemented by IndexedDbProgressStore). */
export type LearningRuntimeStore = LearningStorePort;

export interface LearningRunnerOptions<Context=unknown> {
  repository:LearningContentRepository;
  practiceRouter:PracticeRouter<Context>;
  store:LearningRuntimeStore;
  assessmentRunner:(unit:LearningUnit,context:Context)=>Promise<Evidence[]>;
  contentVersion:string;
  schemaVersion:string;
  assessmentVersion:string;
  scoringVersion:string;
  curriculumVersion?:string;
  /** Declared evidence compatibility for older content/scoring versions (defaults: incompatible). */
  versionPolicy?:MasteryVersionPolicy;
  now:()=>string;
  newId?:()=>string;
  transferRequired?:(conceptId:string)=>boolean;
}

export type LearningRunError =
  | {code:'LEARNING_UNIT_NOT_FOUND';learningUnitId:string}
  | {code:'PRIMARY_MAPPING_NOT_FOUND';learningUnitId:string}
  | {code:'THEORY_ACTIVITY_NOT_FOUND';theoryActivityId:string}
  | {code:'PRACTICE_ACTIVITY_NOT_FOUND';practiceActivityId:string}
  | {code:string;[key:string]:unknown};

export interface LearningRunValue {
  unit:LearningUnit;
  theory:TheoryActivity;
  practice:PracticeActivity;
  evidence:PersistedEvidence[];
  attempts:Attempt[];
  assessment:AssessmentResult;
  mastery:ConceptMastery[];
  progress:LearningUnitProgress;
}

export class LearningRunner<Context=unknown> {
  private readonly options:LearningRunnerOptions<Context>;
  /** The canonical workflow authority this facade delegates to. */
  readonly orchestrator:LearningOrchestrator;
  constructor(options:LearningRunnerOptions<Context>){
    this.options=options;
    this.orchestrator=new LearningOrchestrator(options.store,{now:options.now,newId:options.newId,versionPolicy:options.versionPolicy,transferRequired:options.transferRequired});
  }

  private versions():VersionContext{
    const o=this.options;
    return {contentVersion:o.contentVersion,contentSchemaVersion:o.schemaVersion,scoringVersion:o.scoringVersion,...(o.curriculumVersion?{curriculumVersion:o.curriculumVersion}:{})};
  }

  completeTheory(learningUnitId:string){ return this.orchestrator.completeTheory(learningUnitId,this.versions()); }
  submitReinforcement(learningUnitId:string,payload:Record<string,unknown>){ return this.orchestrator.submitReinforcement(learningUnitId,this.versions(),payload); }

  async run(learningUnitId:string,context:Context):Promise<{ok:true;value:LearningRunValue}|{ok:false;error:LearningRunError}>{
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
    const assessed=await orchestrator.submitAssessmentEvidence({learningUnitId,versions,assessmentVersion:o.assessmentVersion,drafts:assessmentDrafts,conceptIds:unit.conceptIds});

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
