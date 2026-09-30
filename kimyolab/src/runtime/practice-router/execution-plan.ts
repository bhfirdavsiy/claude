// Canonical activity routing (P1.1 — D8).
//
// Before P1.1 an activity was dispatched on two independent keys: `activity.type` (engine) and a
// `configFamily` guessed at runtime from WHICH config file happened to contain the activity (first match
// wins). ActivityExecutionPlan replaces both with one descriptor that is compiled and validated when the
// content pack is built:
//
//     content ─ compileExecutionPlans() ─▶ ActivityExecutionPlan ─▶ runtime ▶ engine
//
// Exactly one valid route per activity, or the build fails. The runtime never guesses.
import type {PracticeType} from '../../domain/content/types.ts';
import {BETA2_ADVANCED_CAPABILITIES} from '../beta2/advanced.ts';
import {BETA2_ORGANIC_CAPABILITIES} from '../beta2/organic.ts';
import {BETA3_ADVANCED_TASKS} from '../beta3/advanced.ts';
import {isVersionRange} from '../compatibility/version-range.ts';
import type {RendererRequirement} from '../../renderers/contract.ts';

export type ExecutionEngine=PracticeType;
/** Engine families with their own interpreter of a config (one factory per runtime in the browser session). */
export type ExecutionRuntime='reference-slice'|'generic'|'beta2-advanced'|'beta2-organic'|'beta3-advanced';

export interface ActivityExecutionPlan {
  activityId:string;
  /** Which practice engine interprets learner commands. */
  engine:ExecutionEngine;
  /** Which runtime family executes the config. */
  runtime:ExecutionRuntime;
  /** What the config asks the runtime to do (slice id, capability or task). */
  capability:string;
  /** Pack file (activity-configs/<configSource>.json) that holds the config — the ONLY place it is read from. */
  configSource:ConfigSource;
  configVersion:string;
  /**
   * P1.4: the renderer this activity needs (capability + semver range), compiled from the content config.
   * Only activities migrated to the RendererRegistry carry it; the rest keep the legacy renderer.
   */
  rendererRequirement?:RendererRequirement;
}

export const EXECUTION_PLAN_PACK_PATH='execution-plans.json';
export const EXECUTION_PLAN_SCHEMA='kimyolab.execution-plans.v1';

export const ENGINES:ReadonlySet<ExecutionEngine>=new Set(['experiment','simulation','trainer','calculation','case']);

/** Legacy config files (the source of the former `configFamily`) → runtime that executes them. */
export const CONFIG_SOURCES={
  'reference-slices':'reference-slice',
  'guided-labs':'generic',
  'beta1':'generic',
  'beta2-safe':'generic',
  'beta3-safe':'generic',
  'beta2-advanced':'beta2-advanced',
  'beta2-organic':'beta2-organic',
  'beta3-advanced':'beta3-advanced',
} as const satisfies Record<string,ExecutionRuntime>;
export type ConfigSource=keyof typeof CONFIG_SOURCES;
export const CONFIG_SOURCE_NAMES=Object.keys(CONFIG_SOURCES) as ConfigSource[];

export type RoutingErrorCode=
  |'ROUTE_NONE'|'ROUTE_CONFLICT'|'ENGINE_UNKNOWN'|'CAPABILITY_UNKNOWN'|'CONFIG_ENGINE_MISMATCH'|'CONFIG_INVALID';
export interface RoutingError { code:RoutingErrorCode; activityId:string; detail:string }
export type RouteResult={ok:true;plan:ActivityExecutionPlan}|{ok:false;error:RoutingError};

const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;

/** Capability of a config under a runtime, or an error. Each runtime declares what it can execute. */
function capabilityOf(runtime:ExecutionRuntime,engine:ExecutionEngine,config:any):{ok:true;capability:string}|{ok:false;code:RoutingErrorCode;detail:string}{
  switch(runtime){
    case 'reference-slice':
      return text(config.sliceId)&&/^slice\./.test(config.sliceId)?{ok:true,capability:config.sliceId}:{ok:false,code:'CAPABILITY_UNKNOWN',detail:`sliceId ${String(config.sliceId)}`};
    case 'generic':
      // The generic interpreter executes every engine by its declarative config (no capability key).
      return config.capability===undefined?{ok:true,capability:`generic.${engine}`}:{ok:false,code:'CAPABILITY_UNKNOWN',detail:`generic runtime has no capability ${String(config.capability)}`};
    case 'beta2-advanced':{
      const byCapability:Record<string,ExecutionEngine>={'ionic-equation-trainer':'trainer','hydrolysis-experiment':'experiment','electrolysis-experiment':'experiment','manganese-redox-simulation':'simulation'};
      if(!BETA2_ADVANCED_CAPABILITIES.has(config.capability)) return {ok:false,code:'CAPABILITY_UNKNOWN',detail:String(config.capability)};
      return byCapability[config.capability]===engine?{ok:true,capability:config.capability}:{ok:false,code:'CONFIG_ENGINE_MISMATCH',detail:`${config.capability} is a ${byCapability[config.capability]} capability, activity engine is ${engine}`};
    }
    case 'beta2-organic':
      if(!BETA2_ORGANIC_CAPABILITIES.has(config.capability)) return {ok:false,code:'CAPABILITY_UNKNOWN',detail:String(config.capability)};
      return ['simulation','trainer','experiment'].includes(engine)?{ok:true,capability:config.capability}:{ok:false,code:'CONFIG_ENGINE_MISMATCH',detail:`organic runtime cannot run ${engine}`};
    case 'beta3-advanced':{
      const tasks=BETA3_ADVANCED_TASKS[engine];
      if(!tasks) return {ok:false,code:'CONFIG_ENGINE_MISMATCH',detail:`beta3 runtime cannot run ${engine}`};
      return tasks.has(config.task)?{ok:true,capability:String(config.task)}:{ok:false,code:'CAPABILITY_UNKNOWN',detail:`${engine}:${String(config.task)}`};
    }
  }
}

/**
 * Legacy adapter: derives the ONE canonical plan of an activity from the legacy `type` + config files.
 * `configs` maps every config source to its file content. Conflicts are errors, never "first match".
 */
export function deriveActivityExecutionPlan(activity:{id:string;type:string},configs:Partial<Record<ConfigSource,Record<string,unknown>|undefined>>):RouteResult{
  const fail=(code:RoutingErrorCode,detail:string):RouteResult=>({ok:false,error:{code,activityId:activity.id,detail}});
  if(!ENGINES.has(activity.type as ExecutionEngine)) return fail('ENGINE_UNKNOWN',String(activity.type));
  const engine=activity.type as ExecutionEngine;
  const sources=CONFIG_SOURCE_NAMES.filter(source=>configs[source]&&Object.prototype.hasOwnProperty.call(configs[source],activity.id));
  if(!sources.length) return fail('ROUTE_NONE','no config source declares this activity');
  if(sources.length>1) return fail('ROUTE_CONFLICT',`declared in ${sources.join(', ')}`);
  const configSource=sources[0]!;
  const config=(configs[configSource] as Record<string,any>)[activity.id];
  if(!config||typeof config!=='object'||!text(config.version)) return fail('CONFIG_INVALID',`${configSource}: config object with version required`);
  if(config.type!==engine) return fail('CONFIG_ENGINE_MISMATCH',`config type ${String(config.type)} != activity type ${engine}`);
  const runtime=CONFIG_SOURCES[configSource];
  const capability=capabilityOf(runtime,engine,config);
  if(!capability.ok) return fail(capability.code,capability.detail);
  const plan:ActivityExecutionPlan={activityId:activity.id,engine,runtime,capability:capability.capability,configSource,configVersion:config.version};
  if(config.rendererRequirement!==undefined){
    const r=config.rendererRequirement;
    if(!isRendererRequirement(r)) return fail('CONFIG_INVALID',`${configSource}: rendererRequirement needs {capability, range}`);
    plan.rendererRequirement={capability:r.capability,range:r.range};
  }
  return {ok:true,plan};
}

export interface ExecutionPlanPack {
  schema:typeof EXECUTION_PLAN_SCHEMA;
  plans:ActivityExecutionPlan[];
}

export interface RoutingReport {
  total:number;
  /** lifecycle ready + exactly one valid route */
  ready:number;
  /** valid route, but the activity is not released (planned/in review) */
  pending:number;
  /** no valid route — cannot be executed (only allowed while not released) */
  disabled:number;
  errors:RoutingError[];
  byRuntime:Record<string,number>;
}

/**
 * Build-time compiler: every activity resolves to exactly one plan. A released (`ready`) activity without a
 * valid route is a hard error; an unreleased one is reported as disabled.
 */
export function compileExecutionPlans(activities:Array<{id:string;type:string;lifecycleStatus?:string}>,configs:Partial<Record<ConfigSource,Record<string,unknown>>>):{pack:ExecutionPlanPack;report:RoutingReport;fatal:RoutingError[]}{
  const plans:ActivityExecutionPlan[]=[];
  const errors:RoutingError[]=[];
  const fatal:RoutingError[]=[];
  let ready=0,pending=0,disabled=0;
  const byRuntime:Record<string,number>={};
  const known=new Set(activities.map(a=>a.id));
  for(const source of CONFIG_SOURCE_NAMES) for(const id of Object.keys(configs[source]??{}))
    if(!known.has(id)) fatal.push({code:'CONFIG_INVALID',activityId:id,detail:`${source} declares an unknown activity`});
  for(const activity of activities){
    const route=deriveActivityExecutionPlan(activity,configs);
    if(!route.ok){
      errors.push(route.error);
      disabled++;
      // Conflicts and invalid configs are never acceptable; a missing route only for unreleased activities.
      if(activity.lifecycleStatus==='ready'||route.error.code!=='ROUTE_NONE') fatal.push(route.error);
      continue;
    }
    plans.push(route.plan);
    byRuntime[route.plan.runtime]=(byRuntime[route.plan.runtime]??0)+1;
    if(activity.lifecycleStatus==='ready') ready++; else pending++;
  }
  plans.sort((a,b)=>a.activityId.localeCompare(b.activityId));
  return {pack:{schema:EXECUTION_PLAN_SCHEMA,plans},report:{total:activities.length,ready,pending,disabled,errors,byRuntime},fatal};
}

export function isRendererRequirement(r:unknown):r is RendererRequirement{
  const x=r as RendererRequirement;
  return Boolean(x)&&typeof x==='object'&&text(x.capability)&&isVersionRange(x.range)&&Object.keys(x).every(k=>k==='capability'||k==='range');
}

/** Runtime lookup: the plan is read, never derived. Unknown or malformed → fail closed. */
export function resolveExecutionPlan(pack:unknown,activityId:string):ActivityExecutionPlan{
  const p=pack as ExecutionPlanPack;
  if(!p||p.schema!==EXECUTION_PLAN_SCHEMA||!Array.isArray(p.plans)) throw new Error('EXECUTION_PLAN_PACK_INVALID');
  const matches=p.plans.filter(x=>x?.activityId===activityId);
  if(matches.length!==1) throw new Error(matches.length?'EXECUTION_PLAN_CONFLICT':'EXECUTION_PLAN_NOT_FOUND');
  const plan=matches[0]!;
  if(!ENGINES.has(plan.engine)||!(plan.configSource in CONFIG_SOURCES)||CONFIG_SOURCES[plan.configSource]!==plan.runtime||!text(plan.capability)) throw new Error('EXECUTION_PLAN_INVALID');
  if(plan.rendererRequirement!==undefined&&!isRendererRequirement(plan.rendererRequirement)) throw new Error('EXECUTION_PLAN_INVALID');
  return plan;
}
