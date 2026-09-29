import type {PracticeActivity,PracticeType} from '../../domain/content/types.ts';
import type {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';
import type {HydrolysisModel,HydrolysisMedium} from '../../domain/chemistry/hydrolysis-model.ts';
import type {ElectrolysisModel,ElectrolysisQuery} from '../../domain/chemistry/electrolysis-model.ts';
import type {ManganeseRedoxModel,ManganeseMedium} from '../../domain/chemistry/manganese-redox-model.ts';
import type {AnswerEvidence,ConstructionEvidence,ObservationEvidence,ProcedureEvidence,Evidence} from '../evidence/types.ts';
import {PracticeRouter,type PracticeEngineAdapter} from '../practice-router/router.ts';
import type {ReferenceSliceContext} from '../reference-slices/config.ts';

type Capability='ionic-equation-trainer'|'hydrolysis-experiment'|'electrolysis-experiment'|'manganese-redox-simulation';
interface Base {capability:Capability;type:PracticeType;version:string;conceptId:string}
export interface IonicTrainerConfig extends Base {capability:'ionic-equation-trainer';type:'trainer';reactionId:string;prompt:string}
export interface HydrolysisConfig extends Base {capability:'hydrolysis-experiment';type:'experiment';salt:string;expectedMedium:HydrolysisMedium}
export interface ElectrolysisConfig extends Base {capability:'electrolysis-experiment';type:'experiment';query:ElectrolysisQuery}
export interface ManganeseConfig extends Base {capability:'manganese-redox-simulation';type:'simulation';targetMedium:ManganeseMedium}
export type Beta2AdvancedConfig=IonicTrainerConfig|HydrolysisConfig|ElectrolysisConfig|ManganeseConfig;
export type Beta2AdvancedRegistry=Record<string,Beta2AdvancedConfig>;

const capabilities=new Set<Capability>(['ionic-equation-trainer','hydrolysis-experiment','electrolysis-experiment','manganese-redox-simulation']);
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v:unknown):v is string{return typeof v==='string'&&v.length>0}
export function loadBeta2AdvancedRegistry(raw:unknown):Beta2AdvancedRegistry{
  if(!obj(raw)) throw new Error('BETA2_ADVANCED_INVALID:root');
  const out:Beta2AdvancedRegistry={};
  for(const [id,value] of Object.entries(raw)){
    if(!obj(value)||!capabilities.has(value.capability as Capability)||!text(value.type)||!text(value.version)||!text(value.conceptId)) throw new Error(`BETA2_ADVANCED_INVALID:${id}`);
    const c=value as unknown as Beta2AdvancedConfig;
    if(c.capability==='ionic-equation-trainer'&&(!text(c.reactionId)||!text(c.prompt))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:ionic`);
    if(c.capability==='hydrolysis-experiment'&&(!text(c.salt)||!['acidic','basic','neutral'].includes(c.expectedMedium))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:hydrolysis`);
    if(c.capability==='electrolysis-experiment'&&(!obj(c.query)||!text(c.query.electrolyte))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:electrolysis`);
    if(c.capability==='manganese-redox-simulation'&&!['acidic','neutral','basic'].includes(c.targetMedium)) throw new Error(`BETA2_ADVANCED_INVALID:${id}:manganese`);
    out[id]=c;
  }
  return out;
}

interface Options{
  registry:Beta2AdvancedRegistry;
  ionicEngine:IonicEngine;
  hydrolysisModel:HydrolysisModel;
  electrolysisModel:ElectrolysisModel;
  manganeseModel:ManganeseRedoxModel;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}
function meta(activity:PracticeActivity,config:Beta2AdvancedConfig,o:Options){return {conceptId:config.conceptId,activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now()};}
function normalizeEquation(v:string){return v.normalize('NFKC').replace(/->|=>/g,'→').replace(/\s+/g,'').replace(/⇌/g,'→');}

export function createBeta2AdvancedRouter(o:Options):PracticeRouter<ReferenceSliceContext>{
  const router=new PracticeRouter<ReferenceSliceContext>();
  const trainer:PracticeEngineAdapter<ReferenceSliceContext>={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.capability!=='ionic-equation-trainer')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const expected=o.ionicEngine.netIonicEquation(config.reactionId).equation;
    const answers=context.inputs[activity.id]?.trainerAnswers??[];const answer=answers.at(-1)??'';const correct=normalizeEquation(answer)===normalizeEquation(expected);
    const evidence:AnswerEvidence={...meta(activity,config,o),id:`${activity.id}.ionic-answer.${answers.length||1}`,score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:config.reactionId,correct,independenceKey:`${activity.id}:ionic-equation`};
    return {evidence:[evidence],serializedState:JSON.stringify({answer,expected,correct})};
  }};
  const simulation:PracticeEngineAdapter<ReferenceSliceContext>={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.capability!=='manganese-redox-simulation')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const actions=context.inputs[activity.id]?.simulationActions??[];const medium=(actions.findLast?.((x:any)=>x.field==='medium')??[...actions].reverse().find((x:any)=>x.field==='medium'))?.value as ManganeseMedium|undefined;
    if(!medium)return {evidence:[],serializedState:JSON.stringify({medium:null})};
    const model=o.manganeseModel.resolve(medium);const achieved=medium===config.targetMedium;
    const evidence:ConstructionEvidence={...meta(activity,config,o),id:`${activity.id}.manganese.${medium}`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`manganese-${config.targetMedium}`,achieved,independenceKey:`${activity.id}:manganese`};
    return {evidence:[evidence],serializedState:JSON.stringify({medium,model}),model} as any;
  }};
  const experiment:PracticeEngineAdapter<ReferenceSliceContext>={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.type!=='experiment')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const actions=context.inputs[activity.id]?.actions??[];
    if(config.capability==='hydrolysis-experiment'){
      const selected=actions.find((a:any)=>a.type==='selectSalt')?.payload?.salt as string|undefined;
      const recorded=[...actions].reverse().find((a:any)=>a.type==='recordMedium')?.payload?.medium as HydrolysisMedium|undefined;
      const model=selected?o.hydrolysisModel.classify(selected):{modeled:false,code:'HYDROLYSIS_NOT_MODELED' as const};
      const achieved=!!selected&&model.modeled&&selected===config.salt&&recorded===model.medium&&recorded===config.expectedMedium;
      const evidence:ConstructionEvidence={...meta(activity,config,o),id:`${activity.id}.hydrolysis`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`hydrolysis-${config.salt}-${config.expectedMedium}`,achieved,independenceKey:`${activity.id}:hydrolysis`};
      return {evidence:[evidence],serializedState:JSON.stringify({selected,recorded,model}),model} as any;
    }
    if(config.capability==='electrolysis-experiment'){
      const model=o.electrolysisModel.resolve(config.query);if(!model.modeled)throw new Error(model.code);
      const types=new Set(actions.map(a=>a.type));const completed=['connectCurrent','observeCathode','observeAnode'].every(x=>types.has(x));
      const evidence:Evidence[]=[];
      if(completed){
        for(const stepId of ['connectCurrent','observeCathode','observeAnode']) evidence.push({...meta(activity,config,o),id:`${activity.id}.procedure.${stepId}`,score:1,evidenceClass:'practice-observation',type:'procedure',stepId,accepted:true,independenceKey:`${activity.id}:${stepId}`} as ProcedureEvidence);
        evidence.push({...meta(activity,config,o),id:`${activity.id}.cathode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'state-change',from:`${config.query.electrolyte}(aq)`,to:`${model.cathode.product}(s)`},independenceKey:`${activity.id}:cathode`} as ObservationEvidence);
        evidence.push({...meta(activity,config,o),id:`${activity.id}.anode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'gas',descriptionKey:model.anode.observation},independenceKey:`${activity.id}:anode`} as ObservationEvidence);
      }
      return {evidence,serializedState:JSON.stringify({completed,model}),model} as any;
    }
    throw new Error(`BETA2_ADVANCED_CAPABILITY_INVALID:${activity.id}`);
  }};
  router.register('trainer',trainer);router.register('simulation',simulation);router.register('experiment',experiment);
  return router;
}
