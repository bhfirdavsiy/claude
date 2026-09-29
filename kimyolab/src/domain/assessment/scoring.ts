import type { Evidence } from '../../runtime/evidence/types.ts';
import { validateEvidence } from '../../runtime/evidence/types.ts';

export interface AssessmentResult {
  id:string;
  learningUnitId:string;
  score:number;
  conceptEvidenceIds:string[];
  misconceptionIds:string[];
  weakConceptIds:string[];
  recommendedRemediationIds:string[];
  assessmentVersion:string;
  scoringVersion:string;
  createdAt:string;
}

export interface ScoreAssessmentInput {
  id:string;
  learningUnitId:string;
  evidence:Evidence[];
  assessmentVersion:string;
  scoringVersion:string;
  weakThreshold?:number;
  misconceptionIds?:string[];
  createdAt?:string;
}

function round2(n:number){return Math.round((n+Number.EPSILON)*100)/100;}

export function scoreAssessment(input:ScoreAssessmentInput):AssessmentResult {
  if(!input.evidence.length) throw new Error('ASSESSMENT_EVIDENCE_REQUIRED');
  const evidence=input.evidence.map(validateEvidence);
  const score=round2(evidence.reduce((sum,e)=>sum+e.score,0)/evidence.length*100);
  const byConcept=new Map<string,number[]>();
  for(const e of evidence){
    const arr=byConcept.get(e.conceptId)??[]; arr.push(e.score); byConcept.set(e.conceptId,arr);
  }
  const threshold=input.weakThreshold??0.75;
  const weakConceptIds=[...byConcept.entries()]
    .filter(([,scores])=>scores.reduce((a,b)=>a+b,0)/scores.length<threshold)
    .map(([id])=>id)
    .sort();
  return {
    id:input.id,
    learningUnitId:input.learningUnitId,
    score,
    conceptEvidenceIds:evidence.map(e=>e.id),
    misconceptionIds:[...(input.misconceptionIds??[])],
    weakConceptIds,
    recommendedRemediationIds:weakConceptIds.map(id=>`remediation.${id}`),
    assessmentVersion:input.assessmentVersion,
    scoringVersion:input.scoringVersion,
    createdAt:input.createdAt??new Date().toISOString(),
  };
}
