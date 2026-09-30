// Capability catalog (P1.4): the declarations of every registered renderer, WITHOUT their DOM code, so the
// build (readiness, reports) can check requirements in Node. Each implementation re-exports its declaration
// from here, so the catalog and the runtime registry cannot drift apart (test: p1-4-renderer-registry).
                                                      

export const ATOM_BUILDER_CAPABILITY                   =Object.freeze({
  id:'atom-builder',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.atom-state.v1',
  intents:Object.freeze(['simulation-action']         ),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'}         ),
})                      ;

/** P1.5: hydrolysis medium — choose a salt, predict the medium, reveal it with the indicator (9.14 experiment,
 *  11.11 simulation: the same trial through either engine's command kind). */
export const HYDROLYSIS_MEDIUM_CAPABILITY                   =Object.freeze({
  id:'hydrolysis-medium',
  version:'1.0.0',
  rendererModelSchema:'kimyolab.renderer.hydrolysis-medium.v1',
  intents:Object.freeze(['experiment-action','simulation-action']         ),
  accessibility:Object.freeze({keyboard:true,nonColorCues:true,screenReaderSummary:true,reducedMotion:'static',nonVisualAlternative:'text-state'}         ),
})                      ;

export const RENDERER_CATALOG                              =Object.freeze([ATOM_BUILDER_CAPABILITY,HYDROLYSIS_MEDIUM_CAPABILITY]);
