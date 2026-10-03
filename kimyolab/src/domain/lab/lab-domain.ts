// P2.10 — builds the chemistry authorities a lab runtime orchestrates from the raw pack data, exactly as the
// existing practice session does (features/practice/session.ts): same parsers, same solution-mixing context.
import {ReactionMatcher} from '../chemistry/reaction-matcher.ts';
import {IonicEngine} from '../chemistry/ionic-engine.ts';
import {SpeciesRegistry} from '../chemistry/species-registry.ts';
import {ElectrolysisModel} from '../chemistry/electrolysis-model.ts';
import {parseConditionVocabulary} from '../chemistry/condition-vocabulary.ts';
import type {LabDomain} from './lab-runtime.ts';

export interface LabChemistryData { reactions:unknown; solutionRules:unknown; species:unknown; electrolysis?:unknown; conditionVocabulary?:unknown }

export function createLabDomain(data:LabChemistryData):LabDomain{
  const species=SpeciesRegistry.from((Array.isArray(data.species)?data.species:(data.species as any)?.species) as any);
  const vocabulary=data.conditionVocabulary?parseConditionVocabulary(data.conditionVocabulary):undefined;
  const matcher=ReactionMatcher.from(data.reactions as any,vocabulary?{vocabulary}:{});
  const ionicEngine=IonicEngine.from({reactions:data.reactions as any,rules:data.solutionRules as any});
  const mixing=vocabulary?.contexts['solution-mixing'];
  return {
    species,ionicEngine,matcher,
    ionic:{species,matcher,ionic:ionicEngine,...(mixing?{mixingConditions:{dimensions:{...mixing.dimensions}}}:{})},
    ...(data.electrolysis?{electrolysis:ElectrolysisModel.from(data.electrolysis)}:{}),
  };
}
