                                                                    
                                                                         
import {createBeta1GenericRouter} from '../beta1/router.js';
                                                            
                                                                        
                                                                                
                                                                                    
                                                                                         
                                                                            
                                                                                  
import {createBeta3AdvancedRouter,                          } from './advanced.js';

export {loadBeta1ConfigRegistry as loadBeta3SafeConfigRegistry} from '../beta1/config.js';
export {loadBeta3AdvancedRegistry} from './advanced.js';
export {buildBeta3ReadinessReport} from './readiness.js';

export function createBeta3Router(options  
                                   
                                         
                          
                                  
                                      
                                     
                              
                                    
                        
                        
                 
 ){
  const generic=createBeta1GenericRouter({
    registry:options.safeRegistry,
    contentVersion:options.contentVersion,
    scoringVersion:options.scoringVersion,
    now:options.now,
  });
  const advanced=createBeta3AdvancedRouter({
    registry:options.advancedRegistry,
    ionicEngine:options.ionicEngine,
    hydrolysisModel:options.hydrolysisModel,
    electrolysisModel:options.electrolysisModel,
    manganeseModel:options.manganeseModel,
    kineticsModel:options.kineticsModel,
    equilibriumModel:options.equilibriumModel,
    contentVersion:options.contentVersion,
    scoringVersion:options.scoringVersion,
    now:options.now,
  });
  return {
    async run(activity                 ,context                      ){
      if(Object.prototype.hasOwnProperty.call(options.advancedRegistry,activity.id)) return advanced.run(activity,context);
      return generic.run(activity,context);
    }
  };
}
