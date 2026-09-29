export { loadReferenceSliceRegistry } from './config.js';
export { createExperimentSliceAdapter } from './experiment-adapter.js';
export { createSimulationSliceAdapter } from './simulation-adapter.js';
export { createTrainerSliceAdapter } from './trainer-adapter.js';
export { createCalculationSliceAdapter } from './calculation-adapter.js';
export { createCaseSliceAdapter } from './case-adapter.js';

export { createCanonicalContentRepository } from './repository.js';

import { PracticeRouter } from '../practice-router/router.js';
                                                                                  
                                                                          
                                                                                 
import { createExperimentSliceAdapter } from './experiment-adapter.js';
import { createSimulationSliceAdapter } from './simulation-adapter.js';
import { createTrainerSliceAdapter } from './trainer-adapter.js';
import { createCalculationSliceAdapter } from './calculation-adapter.js';
import { createCaseSliceAdapter } from './case-adapter.js';

export function createReferenceSliceRouter(options  
                                  
                                  
                          
                        
                        
                 
 )                                      {
  const router=new PracticeRouter                       ();
  router.register('experiment',createExperimentSliceAdapter(options));
  router.register('simulation',createSimulationSliceAdapter(options));
  router.register('trainer',createTrainerSliceAdapter(options));
  router.register('calculation',createCalculationSliceAdapter(options));
  router.register('case',createCaseSliceAdapter(options));
  return router;
}
