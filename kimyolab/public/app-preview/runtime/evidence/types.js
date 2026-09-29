                                                                   

                           
                          
                         
                        
                    

                        
             
                    
                     
                          
                         
                         
                    
                
                               
                           
 

                                                           
                      
                           
 
                                                      
                 
                     
                   
 
                                                           
                      
                 
                
               
 
                                                        
                   
                                       
 
                                                            
                       
                   
                    
 
                                                         
                    
                 
                    
 

                      
                       
                  
                       
                    
                        
                      

const CLASSES = new Set               ([
  'practice-observation',
  'trainer-calculation',
  'concept-assessment',
  'transfer-case',
]);
const TYPES = new Set(['observation', 'answer', 'calculation', 'decision', 'construction', 'procedure']);

function invalid(message        )        {
  throw new Error(`EVIDENCE_INVALID: ${message}`);
}
function text(v         )              { return typeof v === 'string' && v.length > 0; }
function object(v         )                               { return typeof v === 'object' && v !== null && !Array.isArray(v); }

export function validateEvidence(input         )           {
  if (!object(input)) invalid('record required');
  for (const key of ['id','conceptId','activityId','activityVersion','contentVersion','scoringVersion','createdAt']) {
    if (!text(input[key])) invalid(`${key} required`);
  }
  if (typeof input.score !== 'number' || !Number.isFinite(input.score) || input.score < 0 || input.score > 1) invalid('score must be 0..1');
  if (!CLASSES.has(input.evidenceClass                 )) invalid('unknown evidenceClass');
  if (!TYPES.has(String(input.type))) invalid('unknown type');

  switch (input.type) {
    case 'observation':
      if (!object(input.observation) || !text(input.observation.type)) invalid('observation required');
      break;
    case 'answer':
      if (!text(input.questionId) || typeof input.correct !== 'boolean') invalid('answer fields required');
      break;
    case 'calculation':
      if (!text(input.stepId) || typeof input.value !== 'number' || !Number.isFinite(input.value) || !text(input.unit)) invalid('calculation fields required');
      break;
    case 'decision':
      if (!object(input.rubricScores) || Object.values(input.rubricScores).some(v => typeof v !== 'number' || !Number.isFinite(v))) invalid('rubricScores required');
      break;
    case 'construction':
      if (!text(input.targetId) || typeof input.achieved !== 'boolean') invalid('construction fields required');
      break;
    case 'procedure':
      if (!text(input.stepId) || typeof input.accepted !== 'boolean') invalid('procedure fields required');
      break;
  }
  return input                       ;
}
