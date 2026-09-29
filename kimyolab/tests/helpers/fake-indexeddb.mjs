class FakeRequest { result=undefined; error=undefined; onsuccess=null; onerror=null; onupgradeneeded=null; }

class FakeTransaction {
  constructor(stores){ this.stores=stores; this.oncomplete=null; this.onerror=null; this.onabort=null; this.error=null; this.pending=0; this.completeQueued=false; }
  objectStore(name){
    if(!this.stores.has(name)) throw new Error(`missing store ${name}`);
    const map=this.stores.get(name);
    const run=(fn)=>{
      const req=new FakeRequest(); this.pending++;
      queueMicrotask(()=>{
        try { req.result=fn(); req.onsuccess?.({target:req}); }
        catch(error){ req.error=error; this.error=error; req.onerror?.({target:req}); this.onerror?.({target:this}); }
        finally { this.pending--; this.#maybeComplete(); }
      });
      return req;
    };
    return {
      put:(value,key)=>run(()=>{ map.set(key, structuredClone(value)); return key; }),
      get:(key)=>run(()=>map.has(key)?structuredClone(map.get(key)):undefined),
      getAll:()=>run(()=>[...map.values()].map(v=>structuredClone(v))),
      clear:()=>run(()=>{ map.clear(); return undefined; }),
    };
  }
  #maybeComplete(){
    if(this.pending!==0||this.completeQueued) return;
    this.completeQueued=true;
    queueMicrotask(()=>{ if(!this.error) this.oncomplete?.({target:this}); });
  }
}

class FakeDatabase {
  constructor(name,version){ this.name=name; this.version=version; this.stores=new Map(); this.objectStoreNames={contains:(n)=>this.stores.has(n)}; }
  createObjectStore(name){ if(!this.stores.has(name)) this.stores.set(name,new Map()); return {}; }
  transaction(names){ for(const n of names) if(!this.stores.has(n)) throw new Error(`missing store ${n}`); return new FakeTransaction(this.stores); }
}

export function createFakeIndexedDb(){
  const dbs=new Map();
  return {
    open(name,version){
      const req=new FakeRequest();
      queueMicrotask(()=>{
        try {
          let db=dbs.get(name); const isNew=!db;
          if(!db){ db=new FakeDatabase(name,version); dbs.set(name,db); }
          if(version>db.version) db.version=version;
          req.result=db;
          if(isNew) req.onupgradeneeded?.({target:req,oldVersion:0,newVersion:version});
          req.onsuccess?.({target:req});
        } catch(error){ req.error=error; req.onerror?.({target:req}); }
      });
      return req;
    },
    _dbs:dbs,
  };
}
