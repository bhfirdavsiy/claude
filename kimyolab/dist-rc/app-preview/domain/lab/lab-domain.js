// P2.10 — builds the chemistry authorities a lab runtime orchestrates from the raw pack data, exactly as the
// existing practice session does (features/practice/session.ts): same parsers, same solution-mixing context.
import {ReactionMatcher} from '../chemistry/reaction-matcher.js';
import {IonicEngine} from '../chemistry/ionic-engine.js';
import {SpeciesRegistry} from '../chemistry/species-registry.js';
import {ElectrolysisModel} from '../chemistry/electrolysis-model.js';
import {parseConditionVocabulary} from '../chemistry/condition-vocabulary.js';
                                                

                                                                                                                                                    

export function createLabDomain(data                 )          {
  const species=SpeciesRegistry.from((Array.isArray(data.species)?data.species:(data.species       )?.species)       );
  const vocabulary=data.conditionVocabulary?parseConditionVocabulary(data.conditionVocabulary):undefined;
  const matcher=ReactionMatcher.from(data.reactions       ,vocabulary?{vocabulary}:{});
  const ionicEngine=IonicEngine.from({reactions:data.reactions       ,rules:data.solutionRules       });
  const mixing=vocabulary?.contexts['solution-mixing'];
  return {
    species,ionicEngine,matcher,
    ionic:{species,matcher,ionic:ionicEngine,...(mixing?{mixingConditions:{dimensions:{...mixing.dimensions}}}:{})},
    ...(data.electrolysis?{electrolysis:ElectrolysisModel.from(data.electrolysis)}:{}),
  };
}
