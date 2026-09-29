                                                                      
import { parseFormula } from '../../domain/chemistry/formula-parser.js';
import { CalculationEngine } from '../../engines/calculation/engine.js';
                                                                          
                                                                                 

                                                                                                                   
export function createCalculationSliceAdapter(o        )                                              {
  return {
    async run(activity,context){
      const config=o.registry[activity.id];
      if(!config||config.type!=='calculation') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
      const parsedFormula=parseFormula(config.formula);
      const steps=config.steps.map((step    )=>({
        id:step.id,
        validator:(response                           )=>{
          if(response.unit!==step.unit) return {accepted:false,score:0,feedbackKey:'calculation.unit-incorrect'};
          const accepted=Math.abs(response.value-step.value)<=1e-9;
          return {accepted,score:accepted?1:0,feedbackKey:accepted?'calculation.correct':'calculation.value-incorrect'};
        }
      }));
      const engine=new CalculationEngine({activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:config.conceptId,now:o.now,steps});
      const outcomes=[];
      for(const response of context.inputs[activity.id]?.calculationResponses??[]) outcomes.push(engine.submit(response.stepId,{value:response.value,unit:response.unit}));
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),outcomes,finalState:engine.getState(),parsedFormula};
    }
  };
}
