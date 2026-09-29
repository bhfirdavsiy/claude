                                                                                    
                                                     

                                          
                       
                           
 

                                                         
                                                                                   
 

                               
                                           
                                                                                                                                                                               

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

  async run(activity                 ,context        ,plan                                         )                           {
    if(plan&&(plan.activityId!==activity.id||plan.engine!==activity.type)) return {ok:false,error:{code:'EXECUTION_PLAN_MISMATCH',activityId:activity.id}};
    if(activity.lifecycleStatus!=='ready') return {ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}};
    const adapter=this.adapters.get(plan?.engine??activity.type);
    if(!adapter) return {ok:false,error:{code:'ENGINE_NOT_REGISTERED',activityType:activity.type}};
    return {ok:true,value:await adapter.run(activity,context)};
  }
}
