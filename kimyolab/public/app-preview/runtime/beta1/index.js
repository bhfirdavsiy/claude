                                                                      
                                                                                  
                                                                          
                                                                                  
                                                                                                   
import { createReferenceSliceRouter } from '../reference-slices/index.js';
                                                       
import { createBeta1GenericRouter } from './router.js';

export { buildBeta1ReadinessReport } from './readiness.js';
export { loadBeta1ConfigRegistry } from './config.js';

export function createBeta1Router(options  
                                           
                                    
                                  
                          
                                   
                        
                        
                 
 ){
  const reference=createReferenceSliceRouter({
    registry:options.referenceRegistry,
    reactionMatcher:options.reactionMatcher,
    ionicEngine:options.ionicEngine,
    ...(options.speciesRegistry?{speciesRegistry:options.speciesRegistry}:{}),
    contentVersion:options.contentVersion,
    scoringVersion:options.scoringVersion,
    now:options.now,
  });
  const generic=createBeta1GenericRouter({
    registry:options.beta1Registry,
    contentVersion:options.contentVersion,
    scoringVersion:options.scoringVersion,
    now:options.now,
  });
  return {
    async run(activity                 ,context                      ){
      if(Object.prototype.hasOwnProperty.call(options.referenceRegistry,activity.id)) return reference.run(activity,context);
      return generic.run(activity,context);
    }
  };
}
