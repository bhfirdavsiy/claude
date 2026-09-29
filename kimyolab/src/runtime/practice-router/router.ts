import type { PracticeActivity, PracticeType } from '../../domain/content/types.ts';
import type { Evidence } from '../evidence/types.ts';

export interface PracticeExecutionResult {
  evidence: Evidence[];
  serializedState?: string;
}

export interface PracticeEngineAdapter<Context=unknown> {
  run(activity:PracticeActivity, context:Context):Promise<PracticeExecutionResult>;
}

export type PracticeRunResult =
  | {ok:true;value:PracticeExecutionResult}
  | {ok:false;error:{code:'ACTIVITY_NOT_READY';activityId:string}|{code:'ENGINE_NOT_REGISTERED';activityType:PracticeType}};

export class PracticeRouter<Context=unknown> {
  private readonly adapters=new Map<PracticeType,PracticeEngineAdapter<Context>>();

  register(type:PracticeType,adapter:PracticeEngineAdapter<Context>):void {
    this.adapters.set(type,adapter);
  }

  async run(activity:PracticeActivity,context:Context):Promise<PracticeRunResult>{
    if(activity.lifecycleStatus!=='ready') return {ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}};
    const adapter=this.adapters.get(activity.type);
    if(!adapter) return {ok:false,error:{code:'ENGINE_NOT_REGISTERED',activityType:activity.type}};
    return {ok:true,value:await adapter.run(activity,context)};
  }
}
