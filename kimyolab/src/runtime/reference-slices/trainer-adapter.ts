import type { PracticeActivity } from '../../domain/content/types.ts';
import { parseFormula } from '../../domain/chemistry/formula-parser.ts';
import { TrainerEngine } from '../../engines/trainer/engine.ts';
import type { PracticeEngineAdapter } from '../practice-router/router.ts';
import type { ReferenceSliceContext, ReferenceSliceRegistry } from './config.ts';

interface Options { registry:ReferenceSliceRegistry; contentVersion:string; scoringVersion:string; now:()=>string }
function sameAtoms(a:Record<string,number>,b:Record<string,number>){
  const keys=[...new Set([...Object.keys(a),...Object.keys(b)])]; return keys.every(k=>(a[k]??0)===(b[k]??0));
}
export function createTrainerSliceAdapter(o:Options):PracticeEngineAdapter<ReferenceSliceContext> {
  return {
    async run(activity,context){
      const config=o.registry[activity.id];
      if(!config||config.type!=='trainer') throw new Error(`REFERENCE_SLICE_CONFIG_MISSING:${activity.id}`);
      const expected=parseFormula(config.expectedFormula);
      const engine=new TrainerEngine<string>({
        activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,
        question:{id:config.questionId,promptKey:'trainer.valency.prompt',conceptId:config.conceptId},
        attemptPolicy:{maxAttempts:4,hintAfterAttempts:[1,2,3],explanationAfter:'success'},
        hints:config.hints,explanationKey:'trainer.valency.explanation',now:o.now,
        validator:(answer)=>{
          let parsed;
          try{ parsed=parseFormula(answer); }catch{return {correct:false,score:0,feedbackKey:'trainer.formula.invalid-syntax'};}
          if(parsed.normalized===expected.normalized&&sameAtoms(parsed.atoms,expected.atoms)) return {correct:true,score:1,feedbackKey:'trainer.valency.correct'};
          const sameElements=Object.keys(parsed.atoms).sort().join('|')===Object.keys(expected.atoms).sort().join('|');
          return {correct:false,score:0,feedbackKey:sameElements?'trainer.valency.wrong-index':'trainer.valency.wrong-elements'};
        }
      });
      const attempts=[];
      for(const answer of context.inputs[activity.id]?.trainerAnswers??[]){
        if(engine.getState().status!=='active') break;
        attempts.push(engine.submit(answer));
      }
      return {evidence:engine.getEvidence(),serializedState:engine.serialize(),attempts,finalState:engine.getState()};
    }
  };
}
