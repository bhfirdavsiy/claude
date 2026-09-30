// P2.1 — learner-input outcome taxonomy. NOT a new taxonomy: each category is a name for a shape that already
// exists in the engine result contract, so the render layer and evidence pipeline need no parallel path.
//
//   LEARNER_INCORRECT        — a well-formed answer that is wrong → evidence with score 0 / achieved false
//   LEARNER_INPUT_INVALID    — input outside the activity's answer domain (e.g. a medium the model does not know)
//                              → outcome {status:'invalid', code:LEARNER_INPUT_INVALID}; no evidence, no crash
//   MODEL_NOT_SUPPORTED      — the chemistry model has no record for this case → the existing `*_NOT_MODELED`
//                              invalid codes (e.g. ELECTROLYSIS_NOT_MODELED)
//   SYSTEM_INVARIANT_FAILED  — a broken invariant inside the platform (corrupt content, bug) → throw; the UI shows
//                              a generic failure message. Learner input must NEVER reach this category.
export const LEARNER_INCORRECT='LEARNER_INCORRECT';
export const LEARNER_INPUT_INVALID='LEARNER_INPUT_INVALID';
export const MODEL_NOT_SUPPORTED='MODEL_NOT_SUPPORTED';
export const SYSTEM_INVARIANT_FAILED='SYSTEM_INVARIANT_FAILED';
                                                                                                                                                 

/** Classifies an engine step result into the taxonomy (used by reports and tests, never by chemistry logic). */
export function classifyLearnerOutcome(result                                                                                                    )                                                 {
  const last=result.outcomes?.at(-1);
  if(last?.status==='invalid') return /_NOT_MODELED$/.test(last.code??'')?MODEL_NOT_SUPPORTED:LEARNER_INPUT_INVALID;
  const ev=result.evidence??[];
  if(!ev.length) return 'NEUTRAL';
  return ev.some(e=>e.achieved===false||e.score===0)?LEARNER_INCORRECT:'LEARNER_CORRECT';
}
