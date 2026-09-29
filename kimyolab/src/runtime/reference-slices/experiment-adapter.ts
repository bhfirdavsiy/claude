import type { PracticeActivity } from '../../domain/content/types.ts';
import type { ReactionMatcher } from '../../domain/chemistry/reaction-matcher.ts';
import type { IonicEngine } from '../../domain/chemistry/ionic-engine.ts';
import type { Evidence, ObservationEvidence, AnswerEvidence, ProcedureEvidence } from '../evidence/types.ts';
import { ExperimentEngine } from '../../engines/experiment/engine.ts';
import type { ExperimentScenario, ExperimentStep, LabAction, ExperimentActionResult } from '../../engines/experiment/types.ts';
import type { PracticeEngineAdapter } from '../practice-router/router.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from './config.ts';

interface Options {
  registry:ReferenceSliceRegistry;
  reactionMatcher:ReactionMatcher;
  ionicEngine:IonicEngine;
  contentVersion:string;
  scoringVersion:string;
  now:()=>string;
}

function stepScenario(config:any):ExperimentScenario {
  return {
    id:config.scenario.id,
    version:config.version,
    steps:config.scenario.steps.map((s:any):ExperimentStep=>({
      id:s.id,
      dependencies:[...(s.dependencies??[])],
      mode:s.mode,
      allowedActions:[s.actionType],
      completionRule:{actionType:s.actionType},
    })),
  };
}

function metadata(activity:PracticeActivity,config:any,o:Options){
  return {
    conceptId:config.conceptId,
    activityId:activity.id,
    activityVersion:activity.version,
    contentVersion:o.contentVersion,
    scoringVersion:o.scoringVersion,
    createdAt:o.now(),
  };
}

function procedure(activity:PracticeActivity,config:any,o:Options,stepId:string):ProcedureEvidence {
  return {
    ...metadata(activity,config,o),
    id:`${activity.id}.procedure.${stepId}`,
    score:1,
    evidenceClass:'practice-observation',
    type:'procedure',
    stepId,
    accepted:true,
    independenceKey:`${activity.id}:${stepId}`,
  };
}

function sameEquation(a:string,b:string){
  return a.replace(/\s+/g,'').replace(/−/g,'-')===b.replace(/\s+/g,'').replace(/−/g,'-');
}

export function createExperimentSliceAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext> & {run:(activity:PracticeActivity,context:ReferenceSliceContext)=>Promise<any>} {
  return {
    async run(activity,context){
      const config=o.registry[activity.id];
      if(!config||config.type!=='experiment') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
      const scenario=stepScenario(config);
      let matchedReaction:any;
      const evaluator=(_state:any,action:LabAction,step:ExperimentStep):ExperimentActionResult=>{
        const base=procedure(activity,config,o,step.id);

        if(config.reactionId && action.type==='addAgNO3'){
          const reactants=(action.payload?.reactants as any[])??config.reactants;
          const match=o.reactionMatcher.match({reactants});
          if(!match.modeled) return {status:'invalid',code:match.code,feedbackKey:`chemistry.${match.code.toLowerCase()}`};
          matchedReaction=match.reaction;
        }

        const evidence:Evidence[]=[base];
        if(!config.reactionId && action.type==='observe'){
          const ev:ObservationEvidence={
            ...metadata(activity,config,o),
            id:`${activity.id}.observation.crystals`,
            score:1,
            evidenceClass:'practice-observation',
            type:'observation',
            observation:{type:'state-change',from:'filtrate',to:'crystals'},
            independenceKey:`${activity.id}:observation`,
          };
          evidence.push(ev);
        }
        if(config.reactionId && action.type==='observe'){
          if(!matchedReaction) return {status:'invalid',code:'REACTION_NOT_MODELED',feedbackKey:'chemistry.reaction_not_modeled'};
          const observation=matchedReaction.observations?.[0]??{type:'no-visible-change'};
          const ev:ObservationEvidence={
            ...metadata(activity,config,o),
            id:`${activity.id}.observation.reaction`,
            score:1,
            evidenceClass:'practice-observation',
            type:'observation',
            observation,
            independenceKey:`${activity.id}:observation`,
          };
          evidence.push(ev);
        }
        if(config.reactionId && action.type==='record'){
          if(!matchedReaction) return {status:'invalid',code:'REACTION_NOT_MODELED',feedbackKey:'chemistry.reaction_not_modeled'};
          const canonical=o.ionicEngine.netIonicEquation(config.reactionId).equation;
          const answer=String(action.payload?.netIonicEquation??'');
          const correct=sameEquation(answer,canonical);
          const ev:AnswerEvidence={
            ...metadata(activity,config,o),
            id:`${activity.id}.answer.net-ionic`,
            score:correct?1:0,
            evidenceClass:'practice-observation',
            type:'answer',
            questionId:'net-ionic-equation',
            correct,
            independenceKey:`${activity.id}:symbolic`,
          };
          evidence.push(ev);
        }
        return {status:'accepted',evidence};
      };

      const engine=new ExperimentEngine(scenario,evaluator);
      const actions=context.inputs[activity.id]?.actions??[];
      const outcomes=[];
      for(const action of actions) outcomes.push(engine.dispatch(action));
      return {
        evidence:engine.getEvidence(),
        serializedState:engine.serialize(),
        outcomes,
        finalState:engine.getState(),
      };
    }
  };
}
