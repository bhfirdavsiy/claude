import {IndexedDbProgressStore} from './indexeddb-store.js';

                                                                                                     

function isQuota(error        ){
  if(!(error instanceof Error)) return false;
  return error.name==='QuotaExceededError'||/quota/i.test(error.message);
}

export async function saveWithQuotaRecovery   (operation               ,purgeOptionalCache                  )           {
  try{return await operation();}
  catch(error){
    if(!isQuota(error)) throw error;
    await purgeOptionalCache();
    return operation();
  }
}

export async function recoverCorruptStore(store                       ,affectedStore                 ){
  const snapshot=await store.exportSnapshot();
  await store.resetStore(affectedStore);
  return {snapshot,resetStore:affectedStore};
}
