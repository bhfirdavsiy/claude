// Command kind for a renderer intent (P1.6 audit of the P1.5 `practiceType` context field).
//
// `practiceType` is GENERIC page context, not renderer-specific leakage: every page has exactly one engine family,
// and the existing command contract (PracticeCommand) is keyed by that family. A renderer that serves one or
// more families wraps its semantic action in the family's command kind here — the third renderer needed no new
// context field, so the contract did not grow.
import type {PracticeCommand} from '../features/practice/session.ts';
import type {RendererMountContext} from './contract.ts';

export function commandFor(practiceType:RendererMountContext['practiceType'],action:Record<string,unknown>):PracticeCommand{
  switch(practiceType){
    case 'experiment': return {kind:'experiment-action',action:{...action}};
    case 'simulation': return {kind:'simulation-action',action:{...action}};
    default: throw new Error('RENDERER_PRACTICE_TYPE_UNSUPPORTED');
  }
}
