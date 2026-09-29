                                 
                       
                  
                  
                          
 

                               
                        
                  
 

export function createActivationPointer(current                         ,next             )                {
  const previousVersion=current&&current.activeVersion!==next.contentVersion
    ? current.activeVersion
    : current?.previousVersion;
  return {
    activeVersion:next.contentVersion,
    checksum:next.checksum,
    manifest:`${next.contentVersion}/manifest.json`,
    ...(previousVersion?{previousVersion}:{}),
  };
}

export function createRollbackPointer(current               ,target             )                {
  if(!current.previousVersion||target.contentVersion!==current.previousVersion) throw new Error('ROLLBACK_TARGET_NOT_PREVIOUS');
  return {
    activeVersion:target.contentVersion,
    checksum:target.checksum,
    manifest:`${target.contentVersion}/manifest.json`,
    previousVersion:current.activeVersion,
  };
}
