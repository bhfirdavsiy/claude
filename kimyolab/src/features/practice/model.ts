import type {PracticeActivity} from '../../domain/content/types.ts';

export type StudentPracticeConfigFamily=
  | 'reference'
  | 'guided'
  | 'beta1'
  | 'beta2'
  | 'beta2-advanced'
  | 'beta2-organic'
  | 'beta3'
  | 'beta3-advanced';

export interface StudentPracticePageModel {
  id:string;
  type:PracticeActivity['type'];
  title:string;
  goal:string;
  accessibility:string[];
  /** conceptIds: the unit's concepts — the canonical mastery scope for this unit. */
  learningUnit:{id:string;grade:number;title:string;conceptIds?:string[]};
  configFamily:StudentPracticeConfigFamily;
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
  configFamily:StudentPracticeConfigFamily;
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
    configFamily:input.configFamily,
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
