                                 
                       
                  
                  
                          
                                                                                                                       
                                                                  
                         
 

// P2.9 — semantic content version vs artifact/cache revision.
//   contentVersion (2026.09.1) is SEMANTIC: activity versions, review targets and evidence refer to it, and it changes
//   only by a content release decision.
//   contentRevision is the DEPLOY/CACHE identity: the FULL canonical aggregate checksum of the pack (SHA-256 over every
//   file's path, sha256 and size; 64 lowercase hex). It is not truncated and no second hash is introduced. Any byte that
//   changes changes the revision, so a URL that contains it — /content/<contentVersion>/<contentRevision>/<file> — can be
//   cached as immutable: it can never serve other bytes.
export const CONTENT_REVISION_LENGTH=64;
export const CONTENT_REVISION_PATTERN=/^[a-f0-9]{64}$/;
/** The revision of a pack = its canonical checksum, validated, never truncated or normalized (fail closed). */
export function contentRevisionOf(checksum       )       {
  if(typeof checksum!=='string'||!CONTENT_REVISION_PATTERN.test(checksum)) throw new Error('CONTENT_CHECKSUM_INVALID');
  return checksum;
}
/** The pack location named by a pointer: `<version>/manifest.json` (source layout) or
 *  `<version>/<revision>/manifest.json` (deployment layout); null when the path is anything else. */
export function packLocation(pointer                                                                 )                                       {
  const m=/^([A-Za-z0-9.-]+)\/(?:([a-f0-9]{64})\/)?manifest\.json$/.exec(String(pointer.manifest??''));
  if(!m||m[1]!==pointer.activeVersion) return null;
  const revision=m[2]??null;
  // the revision field must be absent (source layout) or exactly the 64-hex revision in the path — never a prefix
  if(pointer.activeRevision!==undefined&&(typeof pointer.activeRevision!=='string'||!CONTENT_REVISION_PATTERN.test(pointer.activeRevision))) return null;
  if((pointer.activeRevision??null)!==revision) return null;
  return {dir:revision?`${m[1]}/${revision}`:m[1] ,revision};
}

                               
                        
                  
 

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
