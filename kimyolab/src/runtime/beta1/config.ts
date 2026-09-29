export type Beta1ActivityType='experiment'|'simulation'|'trainer'|'calculation'|'case';

export interface Beta1BaseConfig { type:Beta1ActivityType; version:string; conceptId:string }
export interface Beta1ExperimentConfig extends Beta1BaseConfig {
  type:'experiment';
  scenario:{id:string;steps:Array<{id:string;actionType:string;label:string;reactionId?:string;reactionIds?:string[];observation?:Record<string,unknown>;observations?:Record<string,unknown>[]}>};
  safetyNotes?:string[];
  virtualOnly?:boolean;
}
export interface Beta1SimulationConfig extends Beta1BaseConfig {
  type:'simulation';
  initialState:Record<string,string|number|boolean>;
  targetState:Record<string,string|number|boolean>;
  targetId:string;
  controls:string[];
}
export interface Beta1TrainerConfig extends Beta1BaseConfig {
  type:'trainer';
  questionId:string;
  prompt:string;
  acceptedAnswers:string[];
  hints?:string[];
}
export interface Beta1CalculationConfig extends Beta1BaseConfig {
  type:'calculation';
  steps:Array<{id:string;value:number;unit:string;tolerance?:number}>;
}
export interface Beta1CaseConfig extends Beta1BaseConfig {
  type:'case';
  allowedEvidenceIds:string[];
  minEvidenceSelections:number;
  decisionKeywords:string[];
  scientificKeywords:string[];
  reasoningKeywords:string[];
  rubric:{evidenceUse:number;scientificAccuracy:number;reasoning:number;decisionQuality:number};
}
export type Beta1ActivityConfig=Beta1ExperimentConfig|Beta1SimulationConfig|Beta1TrainerConfig|Beta1CalculationConfig|Beta1CaseConfig;
export type Beta1ConfigRegistry=Record<string,Beta1ActivityConfig>;

function obj(v:unknown):v is Record<string,unknown>{ return !!v&&typeof v==='object'&&!Array.isArray(v); }
function nonempty(v:unknown):v is string { return typeof v==='string'&&v.length>0; }
function fail(id:string,reason:string):never { throw new Error(`BETA1_CONFIG_INVALID:${id}:${reason}`); }

function validateBase(id:string,v:Record<string,unknown>):void{
  if(!['experiment','simulation','trainer','calculation','case'].includes(String(v.type))) fail(id,'type');
  if(!nonempty(v.version)) fail(id,'version');
  if(!nonempty(v.conceptId)) fail(id,'conceptId');
}

function validateConfig(id:string,v:Record<string,unknown>):void{
  validateBase(id,v);
  switch(v.type){
    case 'experiment': {
      if(!obj(v.scenario)||!nonempty(v.scenario.id)||!Array.isArray(v.scenario.steps)||!v.scenario.steps.length) fail(id,'scenario');
      for(const step of v.scenario.steps){
        if(!obj(step)||!nonempty(step.id)||!nonempty(step.actionType)||!nonempty(step.label)) fail(id,'experiment-step');
      }
      break;
    }
    case 'simulation':
      if(!obj(v.initialState)||!obj(v.targetState)||!nonempty(v.targetId)||!Array.isArray(v.controls)||!v.controls.length) fail(id,'simulation');
      break;
    case 'trainer':
      if(!nonempty(v.questionId)||!nonempty(v.prompt)||!Array.isArray(v.acceptedAnswers)||!v.acceptedAnswers.length||v.acceptedAnswers.some(x=>!nonempty(x))) fail(id,'trainer');
      break;
    case 'calculation':
      if(!Array.isArray(v.steps)||!v.steps.length) fail(id,'calculation');
      for(const step of v.steps){
        if(!obj(step)||!nonempty(step.id)||typeof step.value!=='number'||!Number.isFinite(step.value)||!nonempty(step.unit)) fail(id,'calculation-step');
      }
      break;
    case 'case':
      if(!Array.isArray(v.allowedEvidenceIds)||!v.allowedEvidenceIds.length||typeof v.minEvidenceSelections!=='number'||v.minEvidenceSelections<1||!obj(v.rubric)) fail(id,'case');
      for(const key of ['decisionKeywords','scientificKeywords','reasoningKeywords']) if(!Array.isArray(v[key])) fail(id,`case-${key}`);
      break;
  }
}

export function loadBeta1ConfigRegistry(raw:unknown):Beta1ConfigRegistry{
  if(!obj(raw)) throw new Error('BETA1_CONFIG_INVALID:root');
  const out:Beta1ConfigRegistry={};
  for(const [id,value] of Object.entries(raw)){
    if(!obj(value)) fail(id,'record');
    validateConfig(id,value);
    out[id]=value as unknown as Beta1ActivityConfig;
  }
  return out;
}
