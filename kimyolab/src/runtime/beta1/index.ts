import type { PracticeActivity } from '../../domain/content/types.ts';
import type { ReactionMatcher } from '../../domain/chemistry/reaction-matcher.ts';
import type { IonicEngine } from '../../domain/chemistry/ionic-engine.ts';
import type { SpeciesRegistry } from '../../domain/chemistry/species-registry.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from '../reference-slices/config.ts';
import { createReferenceSliceRouter } from '../reference-slices/index.ts';
import type { Beta1ConfigRegistry } from './config.ts';
import { createBeta1GenericRouter } from './router.ts';

export { buildBeta1ReadinessReport } from './readiness.ts';
export { loadBeta1ConfigRegistry } from './config.ts';

export function createBeta1Router(options:{
  referenceRegistry:ReferenceSliceRegistry;
  beta1Registry:Beta1ConfigRegistry;
  reactionMatcher:ReactionMatcher;
  ionicEngine:IonicEngine;
  speciesRegistry?:SpeciesRegistry;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}){
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
    async run(activity:PracticeActivity,context:ReferenceSliceContext){
      if(Object.prototype.hasOwnProperty.call(options.referenceRegistry,activity.id)) return reference.run(activity,context);
      return generic.run(activity,context);
    }
  };
}
