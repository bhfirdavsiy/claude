import { createBeta1GenericRouter } from '../beta1/router.js';
                                                              
                                                                    
                                                                         
                                                                        
                                                                                
                                                                                    
                                                                                         
import {createBeta2AdvancedRouter,                          } from './advanced.js';
import {createBeta2OrganicRouter,                         } from './organic.js';
                                                                                      

export { loadBeta2CapabilityMatrix, summarizeBeta2Capabilities } from './capability.js';
export { buildBeta2ReadinessReport } from './readiness.js';
export { loadBeta1ConfigRegistry as loadBeta2SafeConfigRegistry } from '../beta1/config.js';
export {loadBeta2AdvancedRegistry} from './advanced.js';
export {loadBeta2OrganicRegistry} from './organic.js';

export function createBeta2Router(options  
                               
                                          
                                        
                                         
                           
                                   
                                       
                                      
                        
                        
                 
 ){
  const generic=createBeta1GenericRouter({registry:options.registry,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  let advanced                                                       ;
  let organic                                                      ;
  if(options.advancedRegistry&&Object.keys(options.advancedRegistry).length){
    if(!options.ionicEngine||!options.hydrolysisModel||!options.electrolysisModel||!options.manganeseModel) throw new Error('BETA2_ADVANCED_DEPENDENCY_MISSING');
    advanced=createBeta2AdvancedRouter({registry:options.advancedRegistry,ionicEngine:options.ionicEngine,hydrolysisModel:options.hydrolysisModel,electrolysisModel:options.electrolysisModel,manganeseModel:options.manganeseModel,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  }
  if(options.organicRegistry&&Object.keys(options.organicRegistry).length){
    if(!options.organicKnowledge) throw new Error('BETA2_ORGANIC_DEPENDENCY_MISSING');
    organic=createBeta2OrganicRouter({registry:options.organicRegistry,knowledge:options.organicKnowledge,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  }
  return {
    async run(activity                 ,context                      ){
      if(options.advancedRegistry&&Object.prototype.hasOwnProperty.call(options.advancedRegistry,activity.id)) return advanced .run(activity,context);
      if(options.organicRegistry&&Object.prototype.hasOwnProperty.call(options.organicRegistry,activity.id)) return organic .run(activity,context);
      return generic.run(activity,context);
    }
  };
}
