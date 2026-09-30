// The production renderer registry (P1.4). Only reference renderers approved by the contract are registered;
// activities without a rendererRequirement keep the legacy practice renderer (strangler migration).
import {RendererRegistry} from './registry.js';
import {atomBuilderRenderer} from './atom-builder/renderer.js';
import {hydrolysisMediumRenderer} from './hydrolysis-medium/renderer.js';

export function createDefaultRendererRegistry()                 {
  const registry=new RendererRegistry();
  registry.register(atomBuilderRenderer);
  registry.register(hydrolysisMediumRenderer);
  return registry;
}
