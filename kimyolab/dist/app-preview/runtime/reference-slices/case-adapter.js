                                                                      
import { CaseEngine } from '../../engines/case/engine.js';
                                                                          
                                                                                 

                                                                                                                   
function keywordFraction(text       ,keywords         )       {
  if(!keywords.length)return 1; const lower=text.toLowerCase(); const hits=keywords.filter(k=>lower.includes(k.toLowerCase())).length; return hits/keywords.length;
}
export function createCaseSliceAdapter(o        )                                              {
  return {
    async run(activity,context){
      const config=o.registry[activity.id];
      if(!config||config.type!=='case') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
      const engine=new CaseEngine({
        activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,conceptId:config.conceptId,now:o.now,
        allowedEvidenceIds:config.allowedEvidenceIds,minEvidenceSelections:config.minEvidenceSelections,justificationThreshold:config.justificationThreshold,rubric:config.rubric,
        decisionScorer:(decision)=>Math.min(1,keywordFraction(decision,config.decisionKeywords??[])*1.25),
        justificationScorer:(text)=>({
          scientificAccuracy:Math.min(1,keywordFraction(text,config.scientificKeywords??[])*1.25),
          reasoning:Math.min(1,keywordFraction(text,config.reasoningKeywords??[])*1.5),
        }),
      });
      const input=context.inputs[activity.id]?.case;
      if(input){
        for(const id of input.evidenceIds) engine.selectEvidence(id);
        engine.setDecision(input.decision); engine.setJustification(input.justification); if(input.reflection) engine.setReflection(input.reflection);
      }
      const completion=engine.complete();
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),completion,finalState:engine.getState()};
    }
  };
}
