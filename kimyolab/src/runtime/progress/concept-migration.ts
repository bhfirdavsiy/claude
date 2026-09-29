import type {Evidence} from '../evidence/types.ts';
import {validateEvidence} from '../evidence/types.ts';
import {computeConceptMastery,type MasteryContext,type MasteryVersionPolicy} from '../../domain/mastery/mastery.ts';

export function migrateConceptSplit(input:{
  sourceConceptId:string;
  targetConceptIds:string[];
  evidence:Evidence[];
  assignments:Record<string,string[]>;
}){
  const targets=new Set(input.targetConceptIds);
  const out:Evidence[]=[];
  for(const raw of input.evidence){
    const evidence=validateEvidence(raw);
    if(evidence.conceptId!==input.sourceConceptId) continue;
    const assigned=input.assignments[evidence.id]??[];
    assigned.forEach((target,index)=>{
      if(!targets.has(target)) throw new Error(`CONCEPT_SPLIT_TARGET_UNKNOWN:${target}`);
      out.push({...evidence,id:index===0?evidence.id:`${evidence.id}::${target}`,conceptId:target} as Evidence);
    });
  }
  return out;
}

export function migrateConceptMerge(input:{
  sourceConceptIds:string[];
  targetConceptId:string;
  evidence:Evidence[];
  /** Explicit versions the merged mastery is computed for (P1.0, baseline C7). Required. */
  context:MasteryContext;
  versionPolicy?:MasteryVersionPolicy;
  transferRequired?:boolean;
}){
  if(!input.context||typeof input.context.scoringVersion!=='string'||typeof input.context.contentVersion!=='string') throw new Error('MASTERY_CONTEXT_REQUIRED');
  const sources=new Set(input.sourceConceptIds);
  const seen=new Set<string>();
  const migrated:Evidence[]=[];
  for(const raw of input.evidence){
    const evidence=validateEvidence(raw);
    if(!sources.has(evidence.conceptId)||seen.has(evidence.id)) continue;
    seen.add(evidence.id);
    migrated.push({...evidence,conceptId:input.targetConceptId} as Evidence);
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
