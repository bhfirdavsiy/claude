// Ionic precipitation practice result (P1.6): turns the domain mixing state (src/domain/chemistry/ionic-mixing.ts)
// into evidence and an engine result. Evidence is MEANINGFUL, never per click:
//   - one observation per distinct modeled pair mixed (reaction or explicit no-reaction) — a not-modeled pair is a
//     model-coverage event in the state only, never chemistry evidence about the learner;
//   - one answer per net ionic equation the learner submits (syntax errors are not submissions);
//   - one construction record for the activity goal (target reaction observed + its equation correct).
import {evaluateIonicMixing,type IonicDomain,type IonicMixingState} from '../../domain/chemistry/ionic-mixing.ts';
import type {ConstructionEvidence,IonicMixingObservationEvidence,NetIonicAnswerEvidence} from '../evidence/types.ts';

type Meta={conceptId:string;activityId:string;activityVersion:string;contentVersion:string;scoringVersion:string;createdAt:string};

export interface IonicPracticeResult {
  evidence:Array<IonicMixingObservationEvidence|NetIonicAnswerEvidence|ConstructionEvidence>;
  serializedState:string;
  finalState:{status:'complete'|'in_progress';ionic:IonicMixingState};
}

export function ionicPracticeResult(input:{domain:IonicDomain;shelf:readonly string[];targetReactionId:string;actions:readonly unknown[];meta:Meta}):IonicPracticeResult{
  const state=evaluateIonicMixing(input.domain,{shelf:input.shelf,targetReactionId:input.targetReactionId,actions:input.actions});
  const id=input.meta.activityId;
  const observations:IonicMixingObservationEvidence[]=state.mixes.filter(m=>m.outcome!=='not-modeled').map(m=>({
    ...input.meta,id:`${id}.mix.${[...m.reagents].sort().join('+')}`,score:1,evidenceClass:'practice-observation',type:'observation',
    observationKind:'ionic-mixing',observation:m.observations?.[0]??{type:'no-visible-change'},
    reagents:[...m.reagents],outcome:m.outcome as 'reaction'|'no-reaction',reactionId:m.reactionId!,
    independenceKey:`${id}:ionic-observation`,
  }));
  const answers:NetIonicAnswerEvidence[]=state.equations.map(e=>({
    ...input.meta,id:`${id}.equation.${e.n}`,score:e.correct?1:0,evidenceClass:'practice-observation',type:'answer',
    answerKind:'net-ionic-equation',questionId:`net-ionic:${e.reactionId}`,correct:e.correct,response:e.response,
    reactionId:e.reactionId,canonicalExpected:input.domain.ionic.netIonicEquation(e.reactionId).equation,
    independenceKey:`${id}:net-ionic`,
  }));
  const construction:ConstructionEvidence={...input.meta,id:`${id}.ionic`,score:state.achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`ionic-${input.targetReactionId}`,achieved:state.achieved,independenceKey:`${id}:ionic`};
  return {
    evidence:[...observations,...answers,construction],
    serializedState:JSON.stringify({selected:state.selected,mixes:state.mixes,equations:state.equations,achieved:state.achieved}),
    finalState:{status:state.achieved?'complete':'in_progress',ionic:state},
  };
}
