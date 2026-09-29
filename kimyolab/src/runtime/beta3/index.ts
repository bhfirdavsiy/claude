import type {PracticeActivity} from '../../domain/content/types.ts';
import type {ReferenceSliceContext} from '../reference-slices/config.ts';
import {createBeta1GenericRouter} from '../beta1/router.ts';
import type {Beta1ConfigRegistry} from '../beta1/config.ts';
import type {IonicEngine} from '../../domain/chemistry/ionic-engine.ts';
import type {HydrolysisModel} from '../../domain/chemistry/hydrolysis-model.ts';
import type {ElectrolysisModel} from '../../domain/chemistry/electrolysis-model.ts';
import type {ManganeseRedoxModel} from '../../domain/chemistry/manganese-redox-model.ts';
import type {KineticsModel} from '../../domain/chemistry/kinetics-model.ts';
import type {EquilibriumModel} from '../../domain/chemistry/equilibrium-model.ts';
import {createBeta3AdvancedRouter,type Beta3AdvancedRegistry} from './advanced.ts';

export {loadBeta1ConfigRegistry as loadBeta3SafeConfigRegistry} from '../beta1/config.ts';
export {loadBeta3AdvancedRegistry} from './advanced.ts';
export {buildBeta3ReadinessReport} from './readiness.ts';

export function createBeta3Router(options:{
  safeRegistry:Beta1ConfigRegistry;
  advancedRegistry:Beta3AdvancedRegistry;
  ionicEngine:IonicEngine;
  hydrolysisModel:HydrolysisModel;
  electrolysisModel:ElectrolysisModel;
  manganeseModel:ManganeseRedoxModel;
  kineticsModel:KineticsModel;
  equilibriumModel:EquilibriumModel;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}){
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
    async run(activity:PracticeActivity,context:ReferenceSliceContext){
      if(Object.prototype.hasOwnProperty.call(options.advancedRegistry,activity.id)) return advanced.run(activity,context);
      return generic.run(activity,context);
    }
  };
}
