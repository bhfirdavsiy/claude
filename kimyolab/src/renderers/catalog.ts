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

export const RENDERER_CATALOG:readonly RendererCapability[]=Object.freeze([ATOM_BUILDER_CAPABILITY]);
