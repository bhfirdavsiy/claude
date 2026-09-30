// Renderer contract (P1.4, docs/plans/p1.4-renderer-foundation-contract.md — approved for implementation).
//
//   Chemistry Domain → Engine/Adapter → RendererModel → Renderer → Learner Intent → ReferencePracticeSession
//
// A renderer receives a RendererModel and emits intents. It never computes chemistry, mastery, progress,
// readiness or scores and never touches persistence (architecture guard, src/renderers/**).
import type {PracticeCommand} from '../features/practice/session.ts';

/** The five accessibility commitments every capability must declare to be registered (contract §7). */
export interface RendererAccessibility {
  /** every intent is reachable and operable with the keyboard alone */
  keyboard:true;
  /** status is never conveyed by colour only (text + icon/shape) */
  nonColorCues:true;
  /** a live, plain-language summary of the state for screen readers */
  screenReaderSummary:true;
  /** behaviour under prefers-reduced-motion: 'static' = the renderer has no motion at all */
  reducedMotion:'static'|'reduced';
  /** the full state is available without visuals */
  nonVisualAlternative:'text-state'|'table'|'steps';
}

export interface RendererCapability {
  /** capability id, e.g. 'atom-builder' — content asks for it via rendererRequirement.capability */
  id:string;
  /** semver of the renderer implementation */
  version:string;
  /** schema of the RendererModel it draws, e.g. 'kimyolab.renderer.atom-state.v1' */
  rendererModelSchema:string;
  /** PracticeCommand kinds it may emit (the existing command contract — no second event bus) */
  intents:ReadonlyArray<PracticeCommand['kind']>;
  accessibility:RendererAccessibility;
}

/** What content asks for (compiled into the ActivityExecutionPlan at build time). */
export interface RendererRequirement { capability:string; range:string }

/** The page services a renderer may use: send an intent, read the current result. Nothing else. */
export interface RendererHost {
  /** sends the intent through ReferencePracticeSession (and the orchestrator); resolves with the engine result */
  dispatch(intent:PracticeCommand):Promise<unknown>;
  /** the engine result for the current inputs (no new input, no persistence) */
  current():Promise<unknown>;
}

export interface RendererInstance {
  /** draw a new model (after every engine result) */
  update(result:unknown):void;
  destroy():void;
}

/** Page context handed to a renderer at mount: display text only (never chemistry input). */
export interface RendererMountContext {
  title:string;
  goal:string;
  /** localized element display name for a symbol (content-backed presentation mapper); defaults to the symbol */
  elementName?:(symbol:string)=>string;
  /**
   * Engine family of the page (P1.5; required since the P1.6 audit). Generic page context: it selects the
   * command kind of the existing PracticeCommand contract (see renderers/intent.ts), nothing renderer-specific.
   */
  practiceType:'experiment'|'simulation'|'trainer'|'calculation'|'case';
}

export interface RendererImplementation {
  capability:RendererCapability;
  mount(root:HTMLElement,host:RendererHost,context:RendererMountContext):RendererInstance;
}

/** Machine codes of renderer resolution. They are logged, never shown to the learner. */
export type RendererErrorCode='RENDERER_DUPLICATE'|'RENDERER_UNAVAILABLE'|'RENDERER_ACCESSIBILITY_INCOMPLETE'|'RENDERER_CAPABILITY_INVALID'|'RENDERER_REQUIREMENT_INVALID';
export class RendererError extends Error {
  readonly code:RendererErrorCode;
  constructor(code:RendererErrorCode,detail=''){ super(detail?`${code}:${detail}`:code); this.name='RendererError'; this.code=code; }
}
