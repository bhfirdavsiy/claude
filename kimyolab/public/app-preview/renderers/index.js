// The production renderer registry (P1.4). Only reference renderers approved by the contract are registered;
// activities without a rendererRequirement keep the legacy practice renderer (strangler migration).
import {RendererRegistry} from './registry.js';
import {atomBuilderRenderer} from './atom-builder/renderer.js';
import {hydrolysisMediumRenderer} from './hydrolysis-medium/renderer.js';
import {ionicPrecipitationRenderer} from './ionic-precipitation/renderer.js';
import {conditionPredictionRenderer} from './condition-prediction/renderer.js';

export function createDefaultRendererRegistry()                 {
  const registry=new RendererRegistry();
  registry.register(atomBuilderRenderer);
  registry.register(hydrolysisMediumRenderer);
  registry.register(ionicPrecipitationRenderer);
  registry.register(conditionPredictionRenderer);
  return registry;
}
