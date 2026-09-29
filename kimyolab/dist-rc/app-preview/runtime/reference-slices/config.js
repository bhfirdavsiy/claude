                                                                   

                                      
                        
                                                    
                            
                                                                         
          
                         
                    
                         
                       
    
 

                                        
                                              
 

                                                          
                 
                                                                
                 
                   
  

                                                                         

export function loadReferenceSliceRegistry(raw        )                        {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('REFERENCE_SLICE_CONFIG_INVALID');
  const out                       ={};
  for(const [activityId,value] of Object.entries(raw                          )){
    if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error(`REFERENCE_SLICE_CONFIG_INVALID:${activityId}`);
    const v=value                          ;
    if(typeof v.sliceId!=='string'||typeof v.type!=='string'||typeof v.version!=='string'||typeof v.conceptId!=='string') throw new Error(`REFERENCE_SLICE_CONFIG_INVALID:${activityId}`);
    out[activityId]=value                        ;
  }
  return out;
}
