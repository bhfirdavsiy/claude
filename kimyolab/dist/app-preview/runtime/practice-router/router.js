                                                                                    
                                                     

                                          
                       
                           
 

                                                         
                                                                                   
 

                               
                                           
                                                                                                                            

export class PracticeRouter                  {
                   adapters=new Map                                             ();

  register(type             ,adapter                               )      {
    this.adapters.set(type,adapter);
  }

  async run(activity                 ,context        )                           {
    if(activity.lifecycleStatus!=='ready') return {ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}};
    const adapter=this.adapters.get(activity.type);
    if(!adapter) return {ok:false,error:{code:'ENGINE_NOT_REGISTERED',activityType:activity.type}};
    return {ok:true,value:await adapter.run(activity,context)};
  }
}
