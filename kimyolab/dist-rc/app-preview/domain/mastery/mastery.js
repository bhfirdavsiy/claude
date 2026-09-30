                                                                               
import { validateEvidence } from '../../runtime/evidence/types.js';

                                                                               

/**
 * The versions a mastery value is computed *for* (P0.5). Evidence recorded under a
 * different content/scoring/curriculum version is only used when the active
 * content pack explicitly declares that version compatible or recalculable.
 */
                                 
                         
                        
                            
 

/**
 * compatible   — old evidence is used as-is.
 * recalculable — raw evidence is kept and re-scored with the current scoring model.
 * incompatible — evidence stays in history but never counts toward current mastery.
 */
                                                                            

                                       
                                               
                                               
                                                  
 

                                 
                   
                       
                    
                       
                        
                         
                      
                          
                                
                                    
 

                                      
                   
                      
                        
                          
                                      
                            
                      
 

const CLASS_WEIGHTS                             ={
  'practice-observation':0.15,
  'trainer-calculation':0.20,
  'concept-assessment':0.35,
  'transfer-case':0.30,
};

const RANK                                    ={compatible:0,recalculable:1,incompatible:2};

function round4(n       ){return Math.round((n+Number.EPSILON)*10000)/10000;}

function axis(current                 ,recorded                 ,policy                                              )                     {
  if(current===undefined) return 'compatible';
  if(recorded===undefined) return policy?.['*']??'incompatible';
  if(recorded===current) return 'compatible';
  return policy?.[recorded]??'incompatible';
}

/** Classifies one evidence record against the mastery context. Unknown versions are incompatible (fail-safe). */
export function classifyEvidenceVersion(evidence                                     ,context               ,policy                     ={})                     {
  const verdicts=[
    axis(context.contentVersion,evidence.contentVersion,policy.content),
    axis(context.scoringVersion,evidence.scoringVersion,policy.scoring),
    // A content pack pins exactly one curriculum version, so evidence recorded before curriculumVersion was
    // stamped (e.g. migrated v1 records) inherits it when it comes from the same content version.
    axis(context.curriculumVersion,evidence.curriculumVersion??(context.contentVersion!==undefined&&evidence.contentVersion===context.contentVersion?context.curriculumVersion:undefined),policy.curriculum),
  ];
  return verdicts.reduce((worst,v)=>RANK[v]>RANK[worst]?v:worst,'compatible'                        );
}

/** Re-scores raw evidence with the current scoring model (binary outcomes are recomputed from raw fields). */
export function rescoreEvidence(evidence         )       {
  switch(evidence.type){
    // P1.5 closeout: a hydrolysis prediction made after the reveal is never credited, not even when rescored
    case 'answer': return evidence.correct&&!((evidence       ).answerKind==='hydrolysis-prediction'&&(evidence       ).predictedBeforeReveal!==true)?1:0;
    case 'construction': return evidence.achieved?1:0;
    case 'procedure': return evidence.accepted?1:0;
    default: return evidence.score;
  }
}

export function computeConceptMastery(input                    )                {
  const context               =input.context??{scoringVersion:input.scoringVersion};
  const all=input.evidence.map(validateEvidence).filter(e=>e.conceptId===input.conceptId);
  const excluded         =[];
  const recalculated         =[];
  const evidence           =[];
  for(const e of all){
    const verdict=classifyEvidenceVersion(e,context,input.versionPolicy);
    if(verdict==='incompatible'){excluded.push(e.id);continue;}
    if(verdict==='recalculable'){recalculated.push(e.id);evidence.push({...e,score:rescoreEvidence(e)}            );continue;}
    evidence.push(e);
  }
  const audit={
    context,
    ...(excluded.length?{excludedEvidenceIds:excluded}:{}),
    ...(recalculated.length?{recalculatedEvidenceIds:recalculated}:{}),
  };
  if(!evidence.length) return {conceptId:input.conceptId,evidenceIds:[],confidence:0,status:'not_started',scoringVersion:context.scoringVersion,...audit};

  const sorted=[...evidence].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  let weighted=0,totalWeight=0;
  const denom=Math.max(1,sorted.length-1);
  for(let i=0;i<sorted.length;i++){
    const e=sorted[i] ;
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

  let status              ;
  if(confidence<0.45) status='needs_review';
  else if(confidence>=0.75&&minimumMet) status='mastered';
  else status='developing';

  return {
    conceptId:input.conceptId,
    evidenceIds:sorted.map(e=>e.id),
    confidence,
    status,
    scoringVersion:context.scoringVersion,
    lastEvidenceAt:sorted.at(-1)?.createdAt,
    reviewDueAt:input.reviewDueAt,
    ...audit,
  };
}
