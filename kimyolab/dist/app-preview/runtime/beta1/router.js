                                                                      
import { ExperimentEngine } from '../../engines/experiment/engine.js';
                                                                                                                               
import { StatefulSimulationEngine } from '../../engines/simulation/engine.js';
import { TrainerEngine } from '../../engines/trainer/engine.js';
import { CalculationEngine } from '../../engines/calculation/engine.js';
import { CaseEngine } from '../../engines/case/engine.js';
                                                                                                         
import { PracticeRouter,                            } from '../practice-router/router.js';
                                                                           
             
                      
                         
                  
                      
                        
                        
                     
                     

                   
                                
                         
                         
                    
 

function metadata(activity                 ,config                    ,o        ){
  return {
    conceptId:config.conceptId,
    activityId:activity.id,
    activityVersion:activity.version,
    contentVersion:o.contentVersion,
    scoringVersion:o.scoringVersion,
    createdAt:o.now(),
  };
}

function experimentAdapter(o        )                                             {
  return {
    async run(activity,context){
      const config=o.registry[activity.id]                                   ;
      if(!config||config.type!=='experiment') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const scenario                   ={
        id:config.scenario.id,
        version:config.version,
        steps:config.scenario.steps.map((step,index)               =>({
          id:step.id,
          dependencies:index===0?[]:[config.scenario.steps[index-1].id],
          mode:'required',
          allowedActions:[step.actionType],
          completionRule:{actionType:step.actionType},
        })),
      };
      const stepById=new Map(config.scenario.steps.map((step)=>[step.id,step]));
      const evaluator=(_state        ,_action          ,step               )                       =>{
        const authored=stepById.get(step.id) ;
        const evidence                                             =[{
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
            observation:observation       ,
            independenceKey:`${activity.id}:${step.id}:observation:${index+1}`,
          });
        });
        return {status:'accepted',evidence};
      };
      const engine=new ExperimentEngine(scenario,evaluator);
      const outcomes=[];
      for(const action of context.inputs[activity.id]?.actions??[]) outcomes.push(engine.dispatch(action));
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,finalState:engine.getState()}       ;
    }
  };
}

function equalTarget(state                       ,target                       )        {
  return Object.entries(target).every(([key,value])=>state[key]===value);
}
function simulationAdapter(o        )                                             {
  return {
    async run(activity,context){
      const config=o.registry[activity.id]                                   ;
      if(!config||config.type!=='simulation') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
                                                      
                                                             
      const engine=new StatefulSimulationEngine              ({
        id:activity.id,version:config.version,seed:0,initialState:config.initialState,
        reducer:(state,action)=>{
          if(!config.controls.includes(action.field)) throw new Error('SIMULATION_CONTROL_INVALID');
          return {...state,[action.field]:action.value};
        },
        evidenceCollector:(state)=>{
          if(!equalTarget(state,config.targetState)) return [];
          const ev                     ={
            ...metadata(activity,config,o),
            id:`${activity.id}.construction.${config.targetId}`,
            score:1,evidenceClass:'practice-observation',type:'construction',
            targetId:config.targetId,achieved:true,independenceKey:`${activity.id}:construction`,
          };
          return [ev];
        }
      });
      for(const action of (context.inputs[activity.id]?.simulationActions??[])            ) engine.dispatch(action);
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),finalState:engine.getState()}       ;
    }
  };
}

function normalizeAnswer(value       )       {
  return value.normalize('NFKC').trim().toLocaleLowerCase('uz').replace(/\s+/g,' ');
}
function trainerAdapter(o        )                                             {
  return {
    async run(activity,context){
      const config=o.registry[activity.id]                                ;
      if(!config||config.type!=='trainer') throw new Error(`BETA1_CONFIG_MISSING:${activity.id}`);
      const accepted=new Set(config.acceptedAnswers.map(normalizeAnswer));
      const engine=new TrainerEngine        ({
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
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),attempts,finalState:engine.getState()}       ;
    }
  };
}

function calculationAdapter(o        )                                             {
  return {
    async run(activity,context){
      const config=o.registry[activity.id]                                    ;
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
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,finalState:engine.getState()}       ;
    }
  };
}

function keywordFraction(text       ,keywords         )       {
  if(!keywords.length) return 1;
  const lower=text.toLowerCase();
  return keywords.filter((keyword)=>lower.includes(keyword.toLowerCase())).length/keywords.length;
}
function caseAdapter(o        )                                             {
  return {
    async run(activity,context){
      const config=o.registry[activity.id]                             ;
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
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),completion,finalState:engine.getState()}       ;
    }
  };
}

export function createBeta1GenericRouter(options        )                                      {
  const router=new PracticeRouter                       ();
  router.register('experiment',experimentAdapter(options));
  router.register('simulation',simulationAdapter(options));
  router.register('trainer',trainerAdapter(options));
  router.register('calculation',calculationAdapter(options));
  router.register('case',caseAdapter(options));
  return router;
}
