                               
                              
                          
                     
                   
                    
                       
                      

                               
            
                
                     
             
               
                      
                   

const ROUTES                                            ={
  'concept-misunderstanding':'theory',
  'visual-misconception':'simulation',
  'procedure-error':'experiment-step',
  'formula-error':'trainer',
  'equation-error':'balancing',
  'calculation-error':'calculation-hint',
  'reasoning-error':'case-example',
};

export function routeRemediation(reason       )                           {
  if(!(reason in ROUTES)) throw new Error('REMEDIATION_REASON_UNSUPPORTED');
  return {target:ROUTES[reason                     ]};
}
