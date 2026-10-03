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

// P2.9 — learner feedback taxonomy. One NAME for every learner-visible feedback state, derived only from the engine
// result contract that already exists (no engine judges anything new here, and nothing here reads chemistry):
//
//   CORRECT             — the engine accepted the answer (evidence achieved / score > 0) or completed the activity
//   INCORRECT           — the engine judged a well-formed answer wrong (evidence achieved:false / score 0, or a
//                         rejected attempt). Only an engine with canonical semantics for "wrong" ever produces this.
//   VALID_INTERMEDIATE  — the input was recorded and the activity is not finished; the engine made NO verdict.
//                         A generic target-state simulation only knows its target, so a non-target state is
//                         intermediate, never "wrong" (ADR-P2-010: no verdict is inferred from labels).
//   UNSUPPORTED_INPUT   — the input is outside the activity's answer domain, or the model has no record for it
//                         (LEARNER_INPUT_INVALID / MODEL_NOT_SUPPORTED); no evidence is written.
//   PROCEDURE_BLOCKED   — a procedure step whose declared prerequisite steps are not done (experiment engine
//                         reason STEP_DEPENDENCY_UNMET); not an answer verdict, the step stays open for a retry.
//   SYSTEM_ERROR        — the platform failed (thrown error); learner input never reaches this category.
//
// The render layer maps each category to catalog text (`ui.*`); evidence and scoring are untouched.

export const FEEDBACK_CATEGORIES=['CORRECT','INCORRECT','VALID_INTERMEDIATE','UNSUPPORTED_INPUT','PROCEDURE_BLOCKED','SYSTEM_ERROR']         ;
                                                                
/** experiment engine: an action that matches a step whose dependencies are not completed yet */
export const STEP_DEPENDENCY_UNMET='STEP_DEPENDENCY_UNMET';

                                
                            
                                                                   
                   
                                                                                                           
                      
 

/** Feedback state of one engine result (the result returned after a learner action). */
export function feedbackState(result    )              {
  const r=result??{};
  const last=r.outcomes?.at?.(-1)??r.attempts?.at?.(-1)??r.completion;
  if(r.outcomes?.at?.(-1)?.status==='invalid'&&r.outcomes.at(-1).reason===STEP_DEPENDENCY_UNMET) return {category:'PROCEDURE_BLOCKED',complete:false};
  const learner=classifyLearnerOutcome(r);
  if(learner===LEARNER_INPUT_INVALID) return {category:'UNSUPPORTED_INPUT',complete:false};
  if(learner===MODEL_NOT_SUPPORTED) return {category:'UNSUPPORTED_INPUT',complete:false,notModeled:true};
  if(last?.status==='invalid'||last?.status==='rejected'||last?.status==='blocked') return {category:'INCORRECT',complete:false};
  if(r.finalState?.status==='complete'||r.finalState?.status==='correct') return {category:'CORRECT',complete:true};
  if(learner===LEARNER_INCORRECT) return {category:'INCORRECT',complete:false};
  if(learner==='LEARNER_CORRECT') return {category:'CORRECT',complete:false};
  return {category:'VALID_INTERMEDIATE',complete:false};
}
