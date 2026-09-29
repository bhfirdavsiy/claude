import { createBeta1GenericRouter } from '../beta1/router.ts';
import type { Beta1ConfigRegistry } from '../beta1/config.ts';
import type {PracticeActivity} from '../../domain/content/types.ts';
import type {ReferenceSliceContext} from '../reference-slices/config.ts';
import type {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';
import type {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';
import type {ElectrolysisModel} from '../../domain/chemistry/electrolysis-model.ts';
import type {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.ts';
import {createBeta2AdvancedRouter,type Beta2AdvancedRegistry} from './advanced.ts';
import {createBeta2OrganicRouter,type Beta2OrganicRegistry} from './organic.ts';
import type {OrganicKnowledgeBase} from '../../domain/chemistry/organic-knowledge.ts';

export { loadBeta2CapabilityMatrix, summarizeBeta2Capabilities } from './capability.ts';
export { buildBeta2ReadinessReport } from './readiness.ts';
export { loadBeta1ConfigRegistry as loadBeta2SafeConfigRegistry } from '../beta1/config.ts';
export {loadBeta2AdvancedRegistry} from './advanced.ts';
export {loadBeta2OrganicRegistry} from './organic.ts';

export function createBeta2Router(options:{
  registry:Beta1ConfigRegistry;
  advancedRegistry?:Beta2AdvancedRegistry;
  organicRegistry?:Beta2OrganicRegistry;
  organicKnowledge?:OrganicKnowledgeBase;
  ionicEngine?:IonicEngine;
  hydrolysisModel?:HydrolysisModel;
  electrolysisModel?:ElectrolysisModel;
  manganeseModel?:ManganeseRedoxModel;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}){
  const generic=createBeta1GenericRouter({registry:options.registry,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  let advanced:ReturnType<typeof createBeta2AdvancedRouter>|undefined;
  let organic:ReturnType<typeof createBeta2OrganicRouter>|undefined;
  if(options.advancedRegistry&&Object.keys(options.advancedRegistry).length){
    if(!options.ionicEngine||!options.hydrolysisModel||!options.electrolysisModel||!options.manganeseModel) throw new Error('BETA2_ADVANCED_DEPENDENCY_MISSING');
    advanced=createBeta2AdvancedRouter({registry:options.advancedRegistry,ionicEngine:options.ionicEngine,hydrolysisModel:options.hydrolysisModel,electrolysisModel:options.electrolysisModel,manganeseModel:options.manganeseModel,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  }
  if(options.organicRegistry&&Object.keys(options.organicRegistry).length){
    if(!options.organicKnowledge) throw new Error('BETA2_ORGANIC_DEPENDENCY_MISSING');
    organic=createBeta2OrganicRouter({registry:options.organicRegistry,knowledge:options.organicKnowledge,contentVersion:options.contentVersion,scoringVersion:options.scoringVersion,now:options.now});
  }
  return {
    async run(activity:PracticeActivity,context:ReferenceSliceContext){
      if(options.advancedRegistry&&Object.prototype.hasOwnProperty.call(options.advancedRegistry,activity.id)) return advanced!.run(activity,context);
      if(options.organicRegistry&&Object.prototype.hasOwnProperty.call(options.organicRegistry,activity.id)) return organic!.run(activity,context);
      return generic.run(activity,context);
    }
  };
}
