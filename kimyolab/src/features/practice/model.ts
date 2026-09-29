import type {PracticeActivity} from '../../domain/content/types.ts';
import type {ActivityExecutionPlan} from '../../runtime/practice-router/execution-plan.ts';
import type {LearningActivityReadiness} from '../../domain/readiness/readiness.ts';

export interface StudentPracticePageModel {
  id:string;
  type:PracticeActivity['type'];
  title:string;
  goal:string;
  accessibility:string[];
  /** conceptIds: the unit's concepts — the canonical mastery scope for this unit. */
  learningUnit:{id:string;grade:number;title:string;conceptIds?:string[]};
  /** The ONE canonical route of this activity (compiled into the content pack, P1.1 D8). */
  executionPlan:ActivityExecutionPlan;
  /** Canonical readiness (P1.2): the only input of the launch gate — no synthesized lifecycle. */
  readiness:LearningActivityReadiness;
  referenceConfig:Record<string,any>;
  activityVersion:string;
  contentVersion:string;
  schemaVersion:string;
  scoringVersion:string;
  curriculumVersion?:string;
  legacyContent?:{equipment?:string;materials?:string;safety?:string;steps?:string[];tasks?:string[]};
  chemistry:{
    reactions:any[];
    solutionRules:{version:string;dissociation:any[];insoluble:string[]};
    hydrolysis?:any;
    electrolysis?:any;
    manganeseRedox?:any;
    organic?:any;
    kinetics?:any;
    equilibrium?:any;
  };
}

export function buildPracticePageModel(input:{
  activity:PracticeActivity;
  mapping:{learningUnitId:string};
  unit:{id:string;grade:number;title:string;conceptIds?:string[]};
  executionPlan:ActivityExecutionPlan;
  readiness:LearningActivityReadiness;
  referenceConfig:Record<string,any>;
  contentVersion:string;
  schemaVersion:string;
  scoringVersion:string;
  curriculumVersion?:string;
  reactions:any[];
  solutionRules:any;
  hydrolysis?:any;
  electrolysis?:any;
  manganeseRedox?:any;
  organic?:any;
  kinetics?:any;
  equilibrium?:any;
}):StudentPracticePageModel {
  return {
    id:input.activity.id,
    type:input.activity.type,
    title:input.activity.title,
    goal:input.activity.goal,
    accessibility:[...input.activity.accessibilityProfile],
    learningUnit:{id:input.unit.id,grade:input.unit.grade,title:input.unit.title,...(Array.isArray(input.unit.conceptIds)?{conceptIds:[...input.unit.conceptIds]}:{})},
    executionPlan:(()=>{
      const plan=input.executionPlan;
      if(plan.activityId!==input.activity.id||plan.engine!==input.activity.type) throw new Error('EXECUTION_PLAN_ACTIVITY_MISMATCH');
      return {...plan};
    })(),
    readiness:(()=>{
      if(input.readiness.activityId!==input.activity.id) throw new Error('READINESS_ACTIVITY_MISMATCH');
      return structuredClone(input.readiness);
    })(),
    referenceConfig:structuredClone(input.referenceConfig),
    activityVersion:String(input.activity.version??'0'),
    contentVersion:input.contentVersion,
    schemaVersion:input.schemaVersion,
    scoringVersion:input.scoringVersion,
    ...(input.curriculumVersion?{curriculumVersion:input.curriculumVersion}:{}),
    legacyContent:structuredClone((input.activity as any).legacyContent??{}),
    chemistry:{
      reactions:structuredClone(input.reactions),
      solutionRules:structuredClone(input.solutionRules),
      hydrolysis:input.hydrolysis===undefined?undefined:structuredClone(input.hydrolysis),
      electrolysis:input.electrolysis===undefined?undefined:structuredClone(input.electrolysis),
      manganeseRedox:input.manganeseRedox===undefined?undefined:structuredClone(input.manganeseRedox),
      organic:input.organic===undefined?undefined:structuredClone(input.organic),
      kinetics:input.kinetics===undefined?undefined:structuredClone(input.kinetics),
      equilibrium:input.equilibrium===undefined?undefined:structuredClone(input.equilibrium),
    },
  };
}
