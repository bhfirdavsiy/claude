                                                                                                                 
                                                                              

                                       
                       
                            
                               
                         
 

export function createCanonicalContentRepository(data                     )                           {
  const units=new Map(data.units.map(x=>[x.id,x]));
  const theories=new Map(data.theories.map(x=>[x.id,x]));
  const practices=new Map(data.practices.map(x=>[x.id,x]));
  const primaries=new Map                    ();
  for(const mapping of data.mappings){
    if(mapping.role==='primary'){
      if(primaries.has(mapping.learningUnitId)) throw new Error(`PRIMARY_MAPPING_DUPLICATE:${mapping.learningUnitId}`);
      primaries.set(mapping.learningUnitId,mapping);
    }
  }
  return {
    getLearningUnit:(id)=>units.get(id),
    getPrimaryMapping:(learningUnitId)=>primaries.get(learningUnitId),
    getTheoryActivity:(id)=>theories.get(id),
    getPracticeActivity:(id)=>practices.get(id),
  };
}
