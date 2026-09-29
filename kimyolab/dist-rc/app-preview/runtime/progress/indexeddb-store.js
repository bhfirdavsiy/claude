                                                       
                                                     
import { validateEvidence } from '../evidence/types.js';
                                                                           
                                                                      

const STORES=['progress','evidence','assessmentAttempts','mastery','appMeta','activityState']         ;

                                     

function coded(code       ,error         )       {
  const detail=error instanceof Error?`: ${error.message}`:'';
  return new Error(`${code}${detail}`);
}

export class IndexedDbProgressStore {
          dbPromise              ;
                   factory    ;
                   dbName       ;
                   dbVersion       ;
  constructor(factory    , dbName='kimyolab-runtime', dbVersion=1){
    this.factory=factory;
    this.dbName=dbName;
    this.dbVersion=dbVersion;
  }

          open()             {
    if(!this.factory||typeof this.factory.open!=='function') return Promise.reject(coded('PROGRESS_STORAGE_UNAVAILABLE'));
    if(this.dbPromise) return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      let req    ;
      try { req=this.factory.open(this.dbName,this.dbVersion); }
      catch(error){ reject(coded('PROGRESS_STORAGE_UNAVAILABLE',error)); return; }
      req.onupgradeneeded=()=>{
        const db=req.result;
        for(const name of STORES) if(!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(coded('PROGRESS_STORAGE_UNAVAILABLE',req.error));
    });
    return this.dbPromise;
  }

          request   (req    )           {
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result     );
      req.onerror=()=>reject(req.error??new Error('IDB_REQUEST_FAILED'));
    });
  }

          transactionDone(tx    )              {
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('IDB_TRANSACTION_FAILED'));
      tx.onabort=()=>reject(tx.error??new Error('IDB_TRANSACTION_ABORTED'));
    });
  }

          async put(store          ,key       ,value        )              {
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readwrite');
      const done=this.transactionDone(tx);
      await this.request(tx.objectStore(store).put(value,key));
      await done;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_SAVE_FAILED',error);
    }
  }

          async get   (store          ,key       )                     {
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readonly');
      const done=this.transactionDone(tx);
      const value=await this.request             (tx.objectStore(store).get(key));
      await done;
      return value;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_LOAD_FAILED',error);
    }
  }

          async all   (store          )             {
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readonly');
      const done=this.transactionDone(tx);
      const values=await this.request     (tx.objectStore(store).getAll());
      await done;
      return values;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_LOAD_FAILED',error);
    }
  }


  async exportSnapshot(){
    const snapshot                         ={};
    for(const name of STORES) snapshot[name]=await this.all         (name);
    return snapshot                               ;
  }

  async resetStore(store          )              {
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readwrite');
      const done=this.transactionDone(tx);
      await this.request(tx.objectStore(store).clear());
      await done;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_RESET_FAILED',error);
    }
  }

  saveProgress(progress                     ){ return this.put('progress',progress.learningUnitId,progress); }
  loadProgress(learningUnitId       ){ return this.get                      ('progress',learningUnitId); }
  listProgress(){ return this.all                      ('progress'); }
  saveEvidence(evidence         ){ const valid=validateEvidence(evidence); return this.put('evidence',valid.id,valid); }
  async loadEvidenceForConcept(conceptId       ){ return (await this.all          ('evidence')).filter(e=>e.conceptId===conceptId); }
  saveAssessment(result                 ){ return this.put('assessmentAttempts',result.id,result); }
  loadAssessment(id       ){ return this.get                  ('assessmentAttempts',id); }
  saveMastery(mastery               ){ return this.put('mastery',mastery.conceptId,mastery); }
  loadMastery(conceptId       ){ return this.get                ('mastery',conceptId); }
}
