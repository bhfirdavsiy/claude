import type { PracticeActivity } from '../../domain/content/types.ts';
import { ExperimentEngine } from '../../engines/experiment/engine.ts';
import type { ExperimentScenario, ExperimentStep, LabAction, ExperimentActionResult } from '../../engines/experiment/types.ts';
import { StatefulSimulationEngine } from '../../engines/simulation/engine.ts';
import { TrainerEngine } from '../../engines/trainer/engine.ts';
import { CalculationEngine } from '../../engines/calculation/engine.ts';
import { CaseEngine } from '../../engines/case/engine.ts';
import type { ConstructionEvidence, ObservationEvidence, ProcedureEvidence } from '../evidence/types.ts';
import { PracticeRouter, type PracticeEngineAdapter } from '../practice-router/router.ts';
import type { ReferenceSliceContext } from '../reference-slices/config.ts';
import type {
  Beta1ActivityConfig,
  Beta1CalculationConfig,
  Beta1CaseConfig,
  Beta1ConfigRegistry,
  Beta1ExperimentConfig,
  Beta1SimulationConfig,
  Beta1TrainerConfig,
} from './config.ts';

interface Options {
  registry: Beta1ConfigRegistry;
  contentVersion: string;
  scoringVersion: string;
  now: () => string;
}

function metadata(activity:PracticeActivity,config:Beta1ActivityConfig,o:Options){
  return {
    conceptId:config.conceptId,
    activityId:activity.id,
    activityVersion:activity.version,
    contentVersion:o.contentVersion,
    scoringVersion:o.scoringVersion,
    createdAt:o.now(),
  };
}

function experimentAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext>{
  return {
    async run(activity,context){
      const config=o.registry[activity.id] as Beta1ExperimentConfig|undefined;
      if(!config||config.type!=='experiment') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const scenario:ExperimentScenario={
        id:config.scenario.id,
        version:config.version,
        steps:config.scenario.steps.map((step,index):ExperimentStep=>({
          id:step.id,
          dependencies:index===0?[]:[config.scenario.steps[index-1].id],
          mode:'required',
          allowedActions:[step.actionType],
          completionRule:{actionType:step.actionType},
        })),
      };
      const stepById=new Map(config.scenario.steps.map((step)=>[step.id,step]));
      const evaluator=(_state:unknown,_action:LabAction,step:ExperimentStep):ExperimentActionResult=>{
        const authored=stepById.get(step.id)!;
        const evidence:Array<ProcedureEvidence|ObservationEvidence>=[{
          ...metadata(activity,config,o),
          id:`${activity.id}.procedure.${step.id}`,
          score:1,evidenceClass:'practice-observation',type:'procedure',stepId:step.id,accepted:true,
          independenceKey:`${activity.id}:${step.id}`,
        }];
        const observations=authored.observations?.length?authored.observations:(authored.observation?[authored.observation]:[]);
        observations.forEach((observation,index)=>{
          evidence.push({
            ...metadata(activity,config,o),
            id:`${activity.id}.observation.${step.id}.${index+1}`,
            score:1,evidenceClass:'practice-observation',type:'observation',
            observation:observation as any,
            independenceKey:`${activity.id}:${step.id}:observation:${index+1}`,
          });
        });
        return {status:'accepted',evidence};
      };
      const engine=new ExperimentEngine(scenario,evaluator);
      const outcomes=[];
      for(const action of context.inputs[activity.id]?.actions??[]) outcomes.push(engine.dispatch(action));
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,finalState:engine.getState()} as any;
    }
  };
}

function equalTarget(state:Record<string,unknown>,target:Record<string,unknown>):boolean{
  return Object.entries(target).every(([key,value])=>state[key]===value);
}
function simulationAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext>{
  return {
    async run(activity,context){
      const config=o.registry[activity.id] as Beta1SimulationConfig|undefined;
      if(!config||config.type!=='simulation') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      type State=Record<string,string|number|boolean>;
      type Action={field:string;value:string|number|boolean};
      const engine=new StatefulSimulationEngine<State,Action>({
        id:activity.id,version:config.version,seed:0,initialState:config.initialState,
        reducer:(state,action)=>{
          if(!config.controls.includes(action.field)) throw new Error('SIMULATION_CONTROL_INVALID');
          return {...state,[action.field]:action.value};
        },
        evidenceCollector:(state)=>{
          if(!equalTarget(state,config.targetState)) return [];
          const ev:ConstructionEvidence={
            ...metadata(activity,config,o),
            id:`${activity.id}.construction.${config.targetId}`,
            score:1,evidenceClass:'practice-observation',type:'construction',
            targetId:config.targetId,achieved:true,independenceKey:`${activity.id}:construction`,
          };
          return [ev];
        }
      });
      for(const action of (context.inputs[activity.id]?.simulationActions??[]) as Action[]) engine.dispatch(action);
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),finalState:engine.getState()} as any;
    }
  };
}

function normalizeAnswer(value:string):string{
  return value.normalize('NFKC').trim().toLocaleLowerCase('uz').replace(/\s+/g,' ');
}
function trainerAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext>{
  return {
    async run(activity,context){
      const config=o.registry[activity.id] as Beta1TrainerConfig|undefined;
      if(!config||config.type!=='trainer') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const accepted=new Set(config.acceptedAnswers.map(normalizeAnswer));
      const engine=new TrainerEngine<string>({
        activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,
        question:{id:config.questionId,promptKey:config.prompt,conceptId:config.conceptId},
        attemptPolicy:{maxAttempts:4,hintAfterAttempts:[1,2,3],explanationAfter:'success'},
        hints:config.hints??[],explanationKey:`${config.questionId}.explanation`,now:o.now,
        validator:(answer)=>{
          const correct=accepted.has(normalizeAnswer(String(answer)));
          return {correct,score:correct?1:0,feedbackKey:correct?'trainer.correct':'trainer.incorrect'};
        },
      });
      const attempts=[];
      for(const answer of context.inputs[activity.id]?.trainerAnswers??[]){
        if(engine.getState().status!=='active') break;
        attempts.push(engine.submit(answer));
      }
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),attempts,finalState:engine.getState()} as any;
    }
  };
}

function calculationAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext>{
  return {
    async run(activity,context){
      const config=o.registry[activity.id] as Beta1CalculationConfig|undefined;
      if(!config||config.type!=='calculation') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const engine=new CalculationEngine({
        activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:config.conceptId,now:o.now,
        steps:config.steps.map((step)=>({
          id:step.id,
          validator:(response)=>{
            if(response.unit!==step.unit) return {accepted:false,score:0,feedbackKey:'calculation.unit-incorrect'};
            const tolerance=step.tolerance??1e-9;
            const accepted=Math.abs(response.value-step.value)<=tolerance;
            return {accepted,score:accepted?1:0,feedbackKey:accepted?'calculation.correct':'calculation.value-incorrect'};
          }
        }))
      });
      const outcomes=[];
      for(const response of context.inputs[activity.id]?.calculationResponses??[]) outcomes.push(engine.submit(response.stepId,{value:response.value,unit:response.unit}));
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,finalState:engine.getState()} as any;
    }
  };
}

function keywordFraction(text:string,keywords:string[]):number{
  if(!keywords.length) return 1;
  const lower=text.toLowerCase();
  return keywords.filter((keyword)=>lower.includes(keyword.toLowerCase())).length/keywords.length;
}
function caseAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext>{
  return {
    async run(activity,context){
      const config=o.registry[activity.id] as Beta1CaseConfig|undefined;
      if(!config||config.type!=='case') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const engine=new CaseEngine({
        activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:config.conceptId,now:o.now,
        allowedEvidenceIds:config.allowedEvidenceIds,minEvidenceSelections:config.minEvidenceSelections,justificationThreshold:0.5,rubric:config.rubric,
        decisionScorer:(decision)=>Math.min(1,keywordFraction(decision,config.decisionKeywords)*1.5),
        justificationScorer:(text)=>({scientificAccuracy:Math.min(1,keywordFraction(text,config.scientificKeywords)*1.5),reasoning:Math.min(1,keywordFraction(text,config.reasoningKeywords)*1.5)}),
      });
      const input=context.inputs[activity.id]?.case;
      if(input){
        for(const id of input.evidenceIds) engine.selectEvidence(id);
        engine.setDecision(input.decision); engine.setJustification(input.justification); if(input.reflection) engine.setReflection(input.reflection);
      }
      const completion=engine.complete();
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),completion,finalState:engine.getState()} as any;
    }
  };
}

export function createBeta1GenericRouter(options:Options):PracticeRouter<ReferenceSliceContext>{
  const router=new PracticeRouter<ReferenceSliceContext>();
  router.register('experiment',experimentAdapter(options));
  router.register('simulation',simulationAdapter(options));
  router.register('trainer',trainerAdapter(options));
  router.register('calculation',calculationAdapter(options));
  router.register('case',caseAdapter(options));
  return router;
}
