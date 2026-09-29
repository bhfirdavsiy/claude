                                
                    
               
                
                 
                    
                              
 

                                   
            
              
               
                  
 

export function validateLicensing(input                                                                        ){
  const pendingAssets         =[];
  const missingAssets         =[];
  for(const asset of input.assets){
    const record=input.records.find((item)=>asset.startsWith(item.pathPrefix));
    if(!record) missingAssets.push(asset);
    else if(record.status!=='approved'||!record.license||record.license==='unknown'||record.allowedUse==='pending') pendingAssets.push(asset);
  }
  const unlicensedSourceRefs=input.sourceRefs
    .filter((ref)=>ref.type!=='internal'&&!ref.license)
    .map((ref)=>ref.id);
  return {
    totalAssets:input.assets.length,
    approvedAssets:input.assets.length-pendingAssets.length-missingAssets.length,
    pendingAssets,
    missingAssets,
    unlicensedSourceRefs,
    releaseReady:pendingAssets.length===0&&missingAssets.length===0&&unlicensedSourceRefs.length===0,
  };
}
