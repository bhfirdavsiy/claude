import type { LearningUnitProgress } from './types.ts';
import type { Evidence } from '../evidence/types.ts';
import { validateEvidence } from '../evidence/types.ts';
import type { AssessmentResult } from '../../domain/assessment/scoring.ts';
import type { ConceptMastery } from '../../domain/mastery/mastery.ts';

const STORES=['progress','evidence','assessmentAttempts','mastery','appMeta','activityState'] as const;

type StoreName=typeof STORES[number];

function coded(code:string,error?:unknown):Error {
  const detail=error instanceof Error?`: ${error.message}`:'';
  return new Error(`${code}${detail}`);
}

export class IndexedDbProgressStore {
  private dbPromise?:Promise<any>;
  private readonly factory:any;
  private readonly dbName:string;
  private readonly dbVersion:number;
  constructor(factory:any, dbName='kimyolab-runtime', dbVersion=1){
    this.factory=factory;
    this.dbName=dbName;
    this.dbVersion=dbVersion;
  }

  private open():Promise<any>{
    if(!this.factory||typeof this.factory.open!=='function') return Promise.reject(coded('PROGRESS_STORAGE_UNAVAILABLE'));
    if(this.dbPromise) return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      let req:any;
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

  private request<T>(req:any):Promise<T>{
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result as T);
      req.onerror=()=>reject(req.error??new Error('IDB_REQUEST_FAILED'));
    });
  }

  private transactionDone(tx:any):Promise<void>{
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('IDB_TRANSACTION_FAILED'));
      tx.onabort=()=>reject(tx.error??new Error('IDB_TRANSACTION_ABORTED'));
    });
  }

  private async put(store:StoreName,key:string,value:unknown):Promise<void>{
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

  private async get<T>(store:StoreName,key:string):Promise<T|undefined>{
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readonly');
      const done=this.transactionDone(tx);
      const value=await this.request<T|undefined>(tx.objectStore(store).get(key));
      await done;
      return value;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_LOAD_FAILED',error);
    }
  }

  private async all<T>(store:StoreName):Promise<T[]>{
    try {
      const db=await this.open();
      const tx=db.transaction([store],'readonly');
      const done=this.transactionDone(tx);
      const values=await this.request<T[]>(tx.objectStore(store).getAll());
      await done;
      return values;
    } catch(error){
      if(error instanceof Error&&error.message.startsWith('PROGRESS_STORAGE_UNAVAILABLE')) throw error;
      throw coded('PROGRESS_LOAD_FAILED',error);
    }
  }


  async exportSnapshot(){
    const snapshot:Record<string,unknown[]>={};
    for(const name of STORES) snapshot[name]=await this.all<unknown>(name);
    return snapshot as Record<StoreName,unknown[]>;
  }

  async resetStore(store:StoreName):Promise<void>{
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

  saveProgress(progress:LearningUnitProgress){ return this.put('progress',progress.learningUnitId,progress); }
  loadProgress(learningUnitId:string){ return this.get<LearningUnitProgress>('progress',learningUnitId); }
  listProgress(){ return this.all<LearningUnitProgress>('progress'); }
  saveEvidence(evidence:Evidence){ const valid=validateEvidence(evidence); return this.put('evidence',valid.id,valid); }
  async loadEvidenceForConcept(conceptId:string){ return (await this.all<Evidence>('evidence')).filter(e=>e.conceptId===conceptId); }
  saveAssessment(result:AssessmentResult){ return this.put('assessmentAttempts',result.id,result); }
  loadAssessment(id:string){ return this.get<AssessmentResult>('assessmentAttempts',id); }
  saveMastery(mastery:ConceptMastery){ return this.put('mastery',mastery.conceptId,mastery); }
  loadMastery(conceptId:string){ return this.get<ConceptMastery>('mastery',conceptId); }
}
