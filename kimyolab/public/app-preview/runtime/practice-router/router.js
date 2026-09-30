                                                                                    
                                                     
import { launchDecision,                                } from '../../domain/readiness/readiness.js';

                                          
                       
                           
 

                                                         
                                                                                   
 

                               
                                           
                                                                                                                                                                               

/**
 * Dispatch only (P1.1 §29): activity + config context + command → engine → domain result. The router owns
 * no progress, attempt, persistence or mastery. With a canonical plan it refuses any activity the plan
 * does not describe; it never picks an engine on its own.
 */

export class PracticeRouter                  {
                   adapters=new Map                                             ();

  register(type             ,adapter                               )      {
    this.adapters.set(type,adapter);
  }

  async run(activity                 ,context        ,plan                                         ,readiness                           )                           {
    if(plan&&(plan.activityId!==activity.id||plan.engine!==activity.type)) return {ok:false,error:{code:'EXECUTION_PLAN_MISMATCH',activityId:activity.id}};
    // P1.2 (C4): with canonical readiness the launch gate decides (fail closed); without it (headless runner,
    // engine unit tests) the activity's own lifecycle must be `ready`. Nothing is ever synthesized as ready.
    if(readiness){
      if(readiness.activityId!==activity.id||!launchDecision(readiness).allowed) return {ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}};
    }else if(activity.lifecycleStatus!=='ready') return {ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}};
    const adapter=this.adapters.get(plan?.engine??activity.type);
    if(!adapter) return {ok:false,error:{code:'ENGINE_NOT_REGISTERED',activityType:activity.type}};
    return {ok:true,value:await adapter.run(activity,context)};
  }
}
