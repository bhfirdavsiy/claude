                                                                                                   

                                     
                        
                  
             
                           
                               
                                
                
 

const dispositions=new Set                  (['existing-engine','needs-capability','needs-content','remap-required']);
function nonempty(v        )            {return typeof v==='string'&&v.trim().length>0;}

export function loadBeta2CapabilityMatrix(raw        )                     {
  if(!Array.isArray(raw)) throw new Error('BETA2_CAPABILITY_INVALID:root');
  const ids=new Set        ();
  const legacyIds=new Set        ();
  return raw.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:record`);
    const v=item                          ;
    if(!nonempty(v.learningUnitId)||!nonempty(v.legacyId)||!nonempty(v.primaryPracticeId)||!nonempty(v.reason)) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:required`);
    if(v.grade!==9&&v.grade!==10) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:grade`);
    if(!dispositions.has(v.disposition                    )) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:disposition`);
    if(!Array.isArray(v.requiredCapabilities)||v.requiredCapabilities.some(x=>!nonempty(x))) throw new Error(`BETA2_CAPABILITY_INVALID:${index}:capabilities`);
    if(ids.has(v.learningUnitId)) throw new Error(`BETA2_CAPABILITY_DUPLICATE:${v.learningUnitId}`);
    if(legacyIds.has(v.legacyId)) throw new Error(`BETA2_CAPABILITY_DUPLICATE_LEGACY:${v.legacyId}`);
    ids.add(v.learningUnitId);legacyIds.add(v.legacyId);
    return v                                 ;
  });
}

export function summarizeBeta2Capabilities(rows                     ){
  const byDisposition                                ={
    'existing-engine':0,'needs-capability':0,'needs-content':0,'remap-required':0,
  };
  const capabilities=new Map               ();
  for(const row of rows){
    byDisposition[row.disposition]++;
    for(const capability of row.requiredCapabilities) capabilities.set(capability,(capabilities.get(capability)??0)+1);
  }
  return {
    total:rows.length,
    byDisposition,
    capabilities:Object.fromEntries([...capabilities.entries()].sort(([a],[b])=>a.localeCompare(b))),
  };
}
