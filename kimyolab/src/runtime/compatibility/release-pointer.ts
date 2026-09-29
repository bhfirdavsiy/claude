export interface ReleasePointer {
  activeVersion:string;
  checksum:string;
  manifest:string;
  previousVersion?:string;
}

export interface PackIdentity {
  contentVersion:string;
  checksum:string;
}

export function createActivationPointer(current:ReleasePointer|undefined,next:PackIdentity):ReleasePointer {
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

export function createRollbackPointer(current:ReleasePointer,target:PackIdentity):ReleasePointer {
  if(!current.previousVersion||target.contentVersion!==current.previousVersion) throw new Error('ROLLBACK_TARGET_NOT_PREVIOUS');
  return {
    activeVersion:target.contentVersion,
    checksum:target.checksum,
    manifest:`${target.contentVersion}/manifest.json`,
    previousVersion:current.activeVersion,
  };
}
