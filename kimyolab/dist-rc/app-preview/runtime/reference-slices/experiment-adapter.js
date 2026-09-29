                                                                      
                                                                                  
                                                                          
                                                                                                             
import { ExperimentEngine } from '../../engines/experiment/engine.js';
                                                                                                                               
                                                                          
                                                                                 

                   
                                  
                                  
                          
                        
                        
                 
 

function stepScenario(config    )                    {
  return {
    id:config.scenario.id,
    version:config.version,
    steps:config.scenario.steps.map((s    )               =>({
      id:s.id,
      dependencies:[...(s.dependencies??[])],
      mode:s.mode,
      allowedActions:[s.actionType],
      completionRule:{actionType:s.actionType},
    })),
  };
}

function metadata(activity                 ,config    ,o        ){
  return {
    conceptId:config.conceptId,
    activityId:activity.id,
    activityVersion:activity.version,
    contentVersion:o.contentVersion,
    scoringVersion:o.scoringVersion,
    createdAt:o.now(),
  };
}

function procedure(activity                 ,config    ,o        ,stepId       )                   {
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

function sameEquation(a       ,b       ){
  return a.replace(/\s+/g,'').replace(/−/g,'-')===b.replace(/\s+/g,'').replace(/−/g,'-');
}

export function createExperimentSliceAdapter(o        )                                                                                                                              {
  return {
    async run(activity,context){
      const config=o.registry[activity.id];
      if(!config||config.type!=='experiment') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
      const scenario=stepScenario(config);
      let matchedReaction    ;
      const evaluator=(_state    ,action          ,step               )                       =>{
        const base=procedure(activity,config,o,step.id);

        if(config.reactionId && action.type==='addAgNO3'){
          const reactants=(action.payload?.reactants         )??config.reactants;
          const match=o.reactionMatcher.match({reactants});
          if(!match.modeled) return {status:'invalid',code:match.code,feedbackKey:`chemistry.${match.code.toLowerCase()}`};
          matchedReaction=match.reaction;
        }

        const evidence           =[base];
        if(!config.reactionId && action.type==='observe'){
          const ev                    ={
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
          const ev                    ={
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
          const ev               ={
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
