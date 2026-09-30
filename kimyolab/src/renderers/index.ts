// The production renderer registry (P1.4). Only reference renderers approved by the contract are registered;
// activities without a rendererRequirement keep the legacy practice renderer (strangler migration).
import {RendererRegistry} from './registry.ts';
import {atomBuilderRenderer} from './atom-builder/renderer.ts';
import {hydrolysisMediumRenderer} from './hydrolysis-medium/renderer.ts';
import {ionicPrecipitationRenderer} from './ionic-precipitation/renderer.ts';

export function createDefaultRendererRegistry():RendererRegistry{
  const registry=new RendererRegistry();
  registry.register(atomBuilderRenderer);
  registry.register(hydrolysisMediumRenderer);
  registry.register(ionicPrecipitationRenderer);
  return registry;
}
