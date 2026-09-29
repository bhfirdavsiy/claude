import {IndexedDbProgressStore} from './indexeddb-store.ts';

type RecoverableStore='progress'|'evidence'|'assessmentAttempts'|'mastery'|'appMeta'|'activityState';

function isQuota(error:unknown){
  if(!(error instanceof Error)) return false;
  return error.name==='QuotaExceededError'||/quota/i.test(error.message);
}

export async function saveWithQuotaRecovery<T>(operation:()=>Promise<T>,purgeOptionalCache:()=>Promise<void>):Promise<T>{
  try{return await operation();}
  catch(error){
    if(!isQuota(error)) throw error;
    await purgeOptionalCache();
    return operation();
  }
}

export async function recoverCorruptStore(store:IndexedDbProgressStore,affectedStore:RecoverableStore){
  const snapshot=await store.exportSnapshot();
  await store.resetStore(affectedStore);
  return {snapshot,resetStore:affectedStore};
}
