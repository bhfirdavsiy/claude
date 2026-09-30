// Renderer contract (P1.4, docs/plans/p1.4-renderer-foundation-contract.md — approved for implementation).
//
//   Chemistry Domain → Engine/Adapter → RendererModel → Renderer → Learner Intent → ReferencePracticeSession
//
// A renderer receives a RendererModel and emits intents. It never computes chemistry, mastery, progress,
// readiness or scores and never touches persistence (architecture guard, src/renderers/**).
                                                                     

/** The five accessibility commitments every capability must declare to be registered (contract §7). */
                                        
                                                                       
                
                                                                    
                    
                                                                       
                           
                                                                                             
                                   
                                                    
                                                    
 

                                     
                                                                                                    
            
                                              
                 
                                                                                     
                             
                                                                                                
                                                 
                                      
 

/** What content asks for (compiled into the ActivityExecutionPlan at build time). */
                                                                        

/** The page services a renderer may use: send an intent, read the current result. Nothing else. */
                               
                                                                                                                  
                                                    
                                                                                
                             
 

                                   
                                                     
                              
                 
 

/** Page context handed to a renderer at mount: display text only (never chemistry input). */
                                       
               
              
     
                                                                                                               
                                                                                                           
     
                                      
     
                                                                                                          
                                                                                                                
     
                                                                        
 

                                         
                                
                                                                                          
 

/** Machine codes of renderer resolution. They are logged, never shown to the learner. */
                                                                                                                                                                           
export class RendererError extends Error {
           code                  ;
  constructor(code                  ,detail=''){ super(detail?`${code}:${detail}`:code); this.name='RendererError'; this.code=code; }
}
