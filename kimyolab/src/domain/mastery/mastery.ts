import type { Evidence, EvidenceClass } from '../../runtime/evidence/types.ts';
import { validateEvidence } from '../../runtime/evidence/types.ts';

export type MasteryStatus='not_started'|'developing'|'mastered'|'needs_review';

export interface ConceptMastery {
  conceptId:string;
  evidenceIds:string[];
  confidence:number;
  status:MasteryStatus;
  scoringVersion:string;
  lastEvidenceAt?:string;
  reviewDueAt?:string;
}

export interface ComputeMasteryInput {
  conceptId:string;
  evidence:Evidence[];
  scoringVersion:string;
  transferRequired?:boolean;
  reviewDueAt?:string;
}

const CLASS_WEIGHTS:Record<EvidenceClass,number>={
  'practice-observation':0.15,
  'trainer-calculation':0.20,
  'concept-assessment':0.35,
  'transfer-case':0.30,
};

function round4(n:number){return Math.round((n+Number.EPSILON)*10000)/10000;}

export function computeConceptMastery(input:ComputeMasteryInput):ConceptMastery {
  const evidence=input.evidence.map(validateEvidence).filter(e=>e.conceptId===input.conceptId);
  if(!evidence.length) return {conceptId:input.conceptId,evidenceIds:[],confidence:0,status:'not_started',scoringVersion:input.scoringVersion};

  const sorted=[...evidence].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  let weighted=0,totalWeight=0;
  const denom=Math.max(1,sorted.length-1);
  for(let i=0;i<sorted.length;i++){
    const e=sorted[i];
    const recency=1+(i/denom)*0.2;
    const w=CLASS_WEIGHTS[e.evidenceClass]*recency;
    weighted+=e.score*w;
    totalWeight+=w;
  }
  const confidence=round4(weighted/totalWeight);
  const independence=new Set(sorted.map(e=>e.independenceKey??e.activityId));
  const hasAssessment=sorted.some(e=>e.evidenceClass==='concept-assessment');
  const hasTransfer=sorted.some(e=>e.evidenceClass==='transfer-case');
  const minimumMet=independence.size>=3&&hasAssessment&&(!input.transferRequired||hasTransfer);

  let status:MasteryStatus;
  if(confidence<0.45) status='needs_review';
  else if(confidence>=0.75&&minimumMet) status='mastered';
  else status='developing';

  return {
    conceptId:input.conceptId,
    evidenceIds:sorted.map(e=>e.id),
    confidence,
    status,
    scoringVersion:input.scoringVersion,
    lastEvidenceAt:sorted.at(-1)?.createdAt,
    reviewDueAt:input.reviewDueAt,
  };
}
