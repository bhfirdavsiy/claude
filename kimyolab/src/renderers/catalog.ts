// Capability catalog (P1.4): the declarations of every registered renderer, WITHOUT their DOM code, so the
// build (readiness, reports) can check requirements in Node. Each implementation re-exports its declaration
// from here, so the catalog and the runtime registry cannot drift apart (test: p1-4-renderer-registry).
import type {RendererCapability} from './contract.ts';

export const ATOM_BUILDER_CAPABILITY:RendererCapability=Object.freeze({
  id:'atom-builder',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.atom-state.v1',
  intents:Object.freeze(['simulation-action'] as const),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'} as const),
}) as RendererCapability;

/** P1.5: hydrolysis medium — choose a salt, predict the medium, reveal it with the indicator (9.14 experiment,
 *  11.11 simulation: the same trial through either engine's command kind). */
export const HYDROLYSIS_MEDIUM_CAPABILITY:RendererCapability=Object.freeze({
  id:'hydrolysis-medium',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.hydrolysis-medium.v1',
  intents:Object.freeze(['experiment-action','simulation-action'] as const),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'} as const),
}) as RendererCapability;

/** P1.6: ionic precipitation — the learner chooses two reagents, mixes them and writes the net ionic equation. */
export const IONIC_PRECIPITATION_CAPABILITY:RendererCapability=Object.freeze({
  id:'ionic-precipitation',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.ionic-precipitation.v1',
  intents:Object.freeze(['experiment-action'] as const),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'} as const),
}) as RendererCapability;

/** P2.6: condition prediction — choose a modeled condition, predict its outcome, reveal the domain's result (9.23 and
 *  11.20 manganese medium → product, 11.18 equilibrium perturbation → shift). A reusable primitive: no chemistry. */
export const CONDITION_PREDICTION_CAPABILITY:RendererCapability=Object.freeze({
  id:'condition-prediction',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.condition-prediction.v1',
  intents:Object.freeze(['simulation-action'] as const),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'} as const),
}) as RendererCapability;

export const RENDERER_CATALOG:readonly RendererCapability[]=Object.freeze([ATOM_BUILDER_CAPABILITY,HYDROLYSIS_MEDIUM_CAPABILITY,IONIC_PRECIPITATION_CAPABILITY,CONDITION_PREDICTION_CAPABILITY]);
