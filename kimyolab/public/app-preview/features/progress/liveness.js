// Browser SessionLivenessPort (P1.0 closeout). A page holds one Web Lock per open practice attempt.
// The platform releases a page's locks when the page dies (refresh, back/forward eviction, tab or
// window close, crash), so boot-time recovery can tell orphaned attempts from ones another tab owns
// without relying on unload handlers, which cannot guarantee an async IndexedDB write.
                                                                                      

const PREFIX='kimyolab.attempt.';

export function createWebLocksLiveness(locks    =(globalThis       ).navigator?.locks)                              {
  if(!locks||typeof locks.request!=='function'||typeof locks.query!=='function') return undefined;
  const held=new Map                 ();
  return {
    claim(attemptId){
      if(held.has(attemptId)) return;
      let release          ;
      const released=new Promise      (resolve=>{release=resolve;});
      held.set(attemptId,release);
      void locks.request(PREFIX+attemptId,{mode:'exclusive'},()=>released).catch(()=>held.delete(attemptId));
    },
    release(attemptId){
      held.get(attemptId)?.();
      held.delete(attemptId);
    },
    async liveAttemptIds(){
      try{
        const state=await locks.query();
        const names=[...(state?.held??[]),...(state?.pending??[])].map((l    )=>String(l?.name??''));
        return new Set(names.filter(n=>n.startsWith(PREFIX)).map(n=>n.slice(PREFIX.length)));
      }catch{return undefined;}
    },
  };
}
