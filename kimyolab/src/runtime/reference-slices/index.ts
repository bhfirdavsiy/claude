import type {ConditionVocabulary} from '../../domain/chemistry/condition-vocabulary.ts';
import type {SpeciesRegistry} from '../../domain/chemistry/species-registry.ts';
export { loadReferenceSliceRegistry } from './config.ts';
export { createExperimentSliceAdapter } from './experiment-adapter.ts';
export { createSimulationSliceAdapter } from './simulation-adapter.ts';
export { createTrainerSliceAdapter } from './trainer-adapter.ts';
export { createCalculationSliceAdapter } from './calculation-adapter.ts';
export { createCaseSliceAdapter } from './case-adapter.ts';

export { createCanonicalContentRepository } from './repository.ts';

import { PracticeRouter } from '../practice-router/router.ts';
import type { ReactionMatcher } from '../../domain/chemistry/reaction-matcher.ts';
import type { IonicEngine } from '../../domain/chemistry/ionic-engine.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from './config.ts';
import { createExperimentSliceAdapter } from './experiment-adapter.ts';
import { createSimulationSliceAdapter } from './simulation-adapter.ts';
import { createTrainerSliceAdapter } from './trainer-adapter.ts';
import { createCalculationSliceAdapter } from './calculation-adapter.ts';
import { createCaseSliceAdapter } from './case-adapter.ts';

export function createReferenceSliceRouter(options:{
  registry:ReferenceSliceRegistry;
  reactionMatcher:ReactionMatcher;
  ionicEngine:IonicEngine;
  /** P1.6: reagent identities for the ionic mixing practice */
  speciesRegistry?:SpeciesRegistry;
  /** P1.7: condition vocabulary (the actual conditions of mixing solutions) */
  conditionVocabulary?:ConditionVocabulary;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}):PracticeRouter<ReferenceSliceContext>{
  const router=new PracticeRouter<ReferenceSliceContext>();
  router.register('experiment',createExperimentSliceAdapter(options));
  router.register('simulation',createSimulationSliceAdapter(options));
  router.register('trainer',createTrainerSliceAdapter(options));
  router.register('calculation',createCalculationSliceAdapter(options));
  router.register('case',createCaseSliceAdapter(options));
  return router;
}
