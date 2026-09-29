                                                   
import {validateEvidence} from '../evidence/types.js';
import {computeConceptMastery,                                             } from '../../domain/mastery/mastery.js';

export function migrateConceptSplit(input  
                         
                            
                      
                                      
 ){
  const targets=new Set(input.targetConceptIds);
  const out           =[];
  for(const raw of input.evidence){
    const evidence=validateEvidence(raw);
    if(evidence.conceptId!==input.sourceConceptId) continue;
    const assigned=input.assignments[evidence.id]??[];
    assigned.forEach((target,index)=>{
      if(!targets.has(target)) throw new Error(`CONCEPT_SPLIT_TARGET_UNKNOWN:${target}`);
      out.push({...evidence,id:index===0?evidence.id:`${evidence.id}::${target}`,conceptId:target}            );
    });
  }
  return out;
}

export function migrateConceptMerge(input  
                            
                         
                      
                                                                                            
                         
                                      
                            
 ){
  if(!input.context||typeof input.context.scoringVersion!=='string'||typeof input.context.contentVersion!=='string') throw new Error('MASTERY_CONTEXT_REQUIRED');
  const sources=new Set(input.sourceConceptIds);
  const seen=new Set        ();
  const migrated           =[];
  for(const raw of input.evidence){
    const evidence=validateEvidence(raw);
    if(!sources.has(evidence.conceptId)||seen.has(evidence.id)) continue;
    seen.add(evidence.id);
    migrated.push({...evidence,conceptId:input.targetConceptId}            );
  }
  const mastery=computeConceptMastery({
    conceptId:input.targetConceptId,
    evidence:migrated,
    scoringVersion:input.context.scoringVersion,
    context:input.context,
    versionPolicy:input.versionPolicy,
    transferRequired:input.transferRequired,
  });
  return {evidence:migrated,mastery};
}
