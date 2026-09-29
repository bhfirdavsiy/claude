import type { LearningUnitProgress } from './types.ts';
import type { Attempt, Evidence, PersistedEvidence } from '../evidence/types.ts';
import { validateAttempt, validatePersistedEvidence } from '../evidence/types.ts';
import type { AssessmentResult } from '../../domain/assessment/scoring.ts';
import type { ConceptMastery } from '../../domain/mastery/mastery.ts';
import { loadProgressRecord } from './migrations.ts';
import { newUuid } from '../shared/ids.ts';
import { validateExternalLabEvidence, externalEvidenceKey, type StoredExternalLabEvidence } from '../../integrations/external-labs/evidence.ts';

// IndexedDB layout (P0.7). Every database version has an explicit migration; the
// upgrade transaction is atomic, so a failed migration leaves the old data intact.
export const CURRENT_DB_VERSION=2;

export const STORES=['progress','attempts','evidence','activityState','externalEvidence','metadata','assessmentAttempts','mastery','quarantine'] as const;
export type StoreName=typeof STORES[number];

export const EVIDENCE_INDEXES=['conceptId','learningUnitId','attemptId','contentVersion','createdAt'] as const;

export interface UpgradeContext {
  db:any;
  tx:any;
  oldVersion:number;
  now:()=>string;
}
export type DbMigration=(ctx:UpgradeContext)=>void;

function ensureStore(db:any,name:string,options?:{keyPath?:string}){
  return db.objectStoreNames.contains(name)?undefined:db.createObjectStore(name,options);
}

function createEvidenceStore(db:any){
  const store=db.createObjectStore('evidence',{keyPath:'id'});
  for(const index of EVIDENCE_INDEXES) store.createIndex(index,index,{unique:false});
  return store;
}

/**
 * Explicit, ordered schema migrations. Key N upgrades a database from version N-1 to N.
 */
export const dbMigrations:Record<number,DbMigration>={
  // v1 — the original Phase 3 layout (out-of-line keys, no indexes).
  1:({db})=>{
    for(const name of ['progress','evidence','assessmentAttempts','mastery','appMeta','activityState']) ensureStore(db,name);
  },
  // v2 — immutable attempts/evidence with indexes, externalEvidence, metadata, quarantine.
  2:({db,tx,oldVersion,now})=>{
    ensureStore(db,'progress');
    ensureStore(db,'activityState');
    ensureStore(db,'assessmentAttempts');
    ensureStore(db,'mastery');
    ensureStore(db,'metadata');
    ensureStore(db,'quarantine',{keyPath:'id'});
    if(!db.objectStoreNames.contains('attempts')){
      const attempts=db.createObjectStore('attempts',{keyPath:'id'});
      attempts.createIndex('learningUnitId','learningUnitId',{unique:false});
      attempts.createIndex('activityId','activityId',{unique:false});
      attempts.createIndex('startedAt','startedAt',{unique:false});
    }
    if(!db.objectStoreNames.contains('externalEvidence')){
      const external=db.createObjectStore('externalEvidence',{keyPath:'id'});
      external.createIndex('bindingId','bindingId',{unique:false});
      external.createIndex('learningUnitId','learningUnitId',{unique:false});
    }
    const migratedAt=now();
    // v1 evidence was keyed by (engine) id without keyPath or indexes: rebuild it.
    const legacyEvidence=db.objectStoreNames.contains('evidence')?tx.objectStore('evidence'):undefined;
    if(legacyEvidence&&legacyEvidence.keyPath!=='id'){
      const legacy=legacyEvidence;
      const keysReq=legacy.getAllKeys();
      keysReq.onsuccess=()=>{
        const valuesReq=legacy.getAll();
        valuesReq.onsuccess=()=>{
          const keys:unknown[]=keysReq.result??[];
          const values:any[]=valuesReq.result??[];
          db.deleteObjectStore('evidence');
          const store=createEvidenceStore(db);
          const quarantine=tx.objectStore('quarantine');
          values.forEach((value,i)=>{
            const legacyKey=String(keys[i]);
            const ok=value&&typeof value==='object'&&typeof value.conceptId==='string'&&typeof value.createdAt==='string';
            if(!ok){quarantine.put({id:newUuid(),store:'evidence',key:legacyKey,code:'EVIDENCE_V1_INVALID',record:value,isolatedAt:migratedAt});return;}
            store.put({
              ...value,
              id:newUuid(),
              sourceEvidenceId:String(value.sourceEvidenceId??value.id??legacyKey),
              attemptId:String(value.attemptId??`legacy-attempt:${legacyKey}`),
              learningUnitId:String(value.learningUnitId??'legacy:unknown'),
              contentVersion:String(value.contentVersion??'legacy:unknown'),
              correctness:value.correctness??'not_applicable',
              legacy:true,
            });
          });
        };
      };
    }else if(!legacyEvidence){
      createEvidenceStore(db);
    }
    // appMeta → metadata
    if(db.objectStoreNames.contains('appMeta')){
      const legacy=tx.objectStore('appMeta');
      const keysReq=legacy.getAllKeys();
      keysReq.onsuccess=()=>{
        const valuesReq=legacy.getAll();
        valuesReq.onsuccess=()=>{
          const metadata=tx.objectStore('metadata');
          (valuesReq.result??[]).forEach((value:unknown,i:number)=>metadata.put(value,keysReq.result[i]));
          db.deleteObjectStore('appMeta');
        };
      };
    }
    tx.objectStore('metadata').put({dbVersion:2,migratedFrom:oldVersion,migratedAt},'db.schema');
  },
};

function coded(code:string,error?:unknown):Error {
  const detail=error instanceof Error?`: ${error.message}`:error&&typeof error==='object'&&'name' in (error as any)?`: ${(error as any).name}`:'';
  const out=new Error(`${code}${detail}`);
  (out as any).code=code;
  return out;
}

function isCoded(error:unknown,prefix:string){return error instanceof Error&&error.message.startsWith(prefix);}

export interface IndexedDbStoreOptions {
  now?:()=>string;
  newId?:()=>string;
  migrations?:Record<number,DbMigration>;
  /** When the upgrade fails, open an isolated workspace instead of losing access (default: true). */
  isolateOnMigrationFailure?:boolean;
}

export interface QuarantineRecord {
  id:string;
  store:StoreName|'evidence';
  key:string;
  code:string;
  reason?:string;
  record:unknown;
  isolatedAt:string;
}

export class IndexedDbProgressStore {
  private dbPromise?:Promise<any>;
  private readonly factory:any;
  private readonly dbName:string;
  private readonly dbVersion:number;
  private readonly now:()=>string;
  private readonly newId:()=>string;
  private readonly migrations:Record<number,DbMigration>;
  private readonly isolateOnMigrationFailure:boolean;
  private activeDbName:string;
  isolation?:{from:string;to:string;code:string};

  constructor(factory:any, dbName='kimyolab-runtime', dbVersion=CURRENT_DB_VERSION, options:IndexedDbStoreOptions={}){
    this.factory=factory;
    this.dbName=dbName;
    this.activeDbName=dbName;
    this.dbVersion=dbVersion;
    this.now=options.now??(()=>new Date().toISOString());
    this.newId=options.newId??newUuid;
    this.migrations=options.migrations??dbMigrations;
    this.isolateOnMigrationFailure=options.isolateOnMigrationFailure??true;
  }

  get databaseName(){return this.activeDbName;}

  private openNamed(name:string):Promise<any>{
    return new Promise((resolve,reject)=>{
      let req:any;
      let upgradeFailed:unknown;
      try { req=this.factory.open(name,this.dbVersion); }
      catch(error){ reject(coded('PROGRESS_STORAGE_UNAVAILABLE',error)); return; }
      req.onupgradeneeded=(event:any)=>{
        const db=req.result;
        const tx=req.transaction;
        const oldVersion=Number(event?.oldVersion??0);
        const newVersion=Number(event?.newVersion??this.dbVersion);
        try{
          for(let v=oldVersion+1;v<=newVersion;v++){
            const migration=this.migrations[v];
            if(!migration) throw new Error(`IDB_MIGRATION_MISSING:${v}`);
            migration({db,tx,oldVersion,now:this.now});
          }
        }catch(error){
          upgradeFailed=error;
          try{tx?.abort();}catch{}
        }
      };
      req.onblocked=()=>reject(coded('PROGRESS_STORAGE_BLOCKED'));
      req.onsuccess=()=>{
        const db=req.result;
        db.onversionchange=()=>{try{db.close();}catch{} this.dbPromise=undefined;};
        resolve(db);
      };
      req.onerror=()=>reject(upgradeFailed?coded('PROGRESS_MIGRATION_FAILED',upgradeFailed):coded('PROGRESS_STORAGE_UNAVAILABLE',req.error));
    });
  }

  private open():Promise<any>{
    if(!this.factory||typeof this.factory.open!=='function') return Promise.reject(coded('PROGRESS_STORAGE_UNAVAILABLE'));
    if(this.dbPromise) return this.dbPromise;
    const attempt=this.openNamed(this.activeDbName).catch(async(error)=>{
      if(!(this.isolateOnMigrationFailure&&isCoded(error,'PROGRESS_MIGRATION_FAILED'))) throw error;
      // Black-swan safeguard: the old database stays untouched (upgrade aborted);
      // continue in an isolated workspace so the learner is not blocked.
      const isolatedName=`${this.dbName}.isolated-v${this.dbVersion}`;
      this.isolation={from:this.dbName,to:isolatedName,code:'PROGRESS_MIGRATION_FAILED'};
      this.activeDbName=isolatedName;
      return this.openNamed(isolatedName);
    });
    // A rejected open must never be cached permanently: the next call retries.
    this.dbPromise=attempt.catch((error)=>{this.dbPromise=undefined;throw error;});
    return this.dbPromise;
  }

  private request<T>(req:any):Promise<T>{
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result as T);
      req.onerror=(event:any)=>{event?.preventDefault?.();reject(req.error??new Error('IDB_REQUEST_FAILED'));};
    });
  }

  private transactionDone(tx:any):Promise<void>{
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('IDB_TRANSACTION_FAILED'));
      tx.onabort=()=>reject(tx.error??new Error('IDB_TRANSACTION_ABORTED'));
    });
  }

  private async run<T>(stores:StoreName[],mode:'readonly'|'readwrite',failCode:string,body:(tx:any)=>Promise<T>):Promise<T>{
    try{
      const db=await this.open();
      const tx=db.transaction(stores,mode);
      const done=this.transactionDone(tx);
      try{
        const value=await body(tx);
        await done;
        return value;
      }catch(error){
        try{tx.abort();}catch{}
        await done.catch(()=>undefined);
        throw error;
      }
    }catch(error){
      if(isCoded(error,'PROGRESS_STORAGE_')||isCoded(error,'PROGRESS_MIGRATION_')||isCoded(error,'EVIDENCE_')||isCoded(error,'ATTEMPT_')||isCoded(error,'EXTERNAL_EVIDENCE_')) throw error;
      throw coded(failCode,error);
    }
  }

  private put(store:StoreName,value:unknown,key?:string):Promise<void>{
    return this.run([store],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{await this.request(key===undefined?tx.objectStore(store).put(value):tx.objectStore(store).put(value,key));});
  }

  private get<T>(store:StoreName,key:string):Promise<T|undefined>{
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request<T|undefined>(tx.objectStore(store).get(key)));
  }

  private all<T>(store:StoreName):Promise<T[]>{
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request<T[]>(tx.objectStore(store).getAll()));
  }

  private byIndex<T>(store:StoreName,index:string,value:string):Promise<T[]>{
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request<T[]>(tx.objectStore(store).index(index).getAll(value)));
  }

  async exportSnapshot(){
    const snapshot:Record<string,unknown[]>={};
    for(const name of STORES) snapshot[name]=await this.all<unknown>(name);
    return snapshot as Record<StoreName,unknown[]>;
  }

  async resetStore(store:StoreName):Promise<void>{
    await this.run([store],'readwrite','PROGRESS_RESET_FAILED',async tx=>{await this.request(tx.objectStore(store).clear());});
  }

  async metadata<T=unknown>(key:string){return this.get<T>('metadata',key);}

  // ---- progress (P0.6: load → validate → version check → migrate → isolate) ----

  saveProgress(progress:LearningUnitProgress){ return this.put('progress',progress,progress.learningUnitId); }

  async loadProgress(learningUnitId:string):Promise<LearningUnitProgress|undefined>{
    const raw=await this.get<unknown>('progress',learningUnitId);
    if(raw===undefined) return undefined;
    return this.resolveProgress(learningUnitId,raw);
  }

  async listProgress():Promise<LearningUnitProgress[]>{
    const rows=await this.run(['progress'],'readonly','PROGRESS_LOAD_FAILED',async tx=>{
      const store=tx.objectStore('progress');
      const [keys,values]=await Promise.all([this.request<unknown[]>(store.getAllKeys()),this.request<unknown[]>(store.getAll())]);
      return keys.map((k,i)=>({key:String(k),value:values[i]}));
    });
    const out:LearningUnitProgress[]=[];
    for(const row of rows){const resolved=await this.resolveProgress(row.key,row.value);if(resolved)out.push(resolved);}
    return out;
  }

  private async resolveProgress(key:string,raw:unknown):Promise<LearningUnitProgress|undefined>{
    const result=loadProgressRecord(raw);
    if(result.status==='current') return result.record;
    if(result.status==='migrated'){await this.saveProgress(result.record);return result.record;}
    await this.isolate('progress',key,raw,result.code,result.reason);
    return undefined;
  }

  /** Moves a record that cannot be migrated into quarantine; the original bytes are preserved. */
  async isolate(store:StoreName,key:string,record:unknown,code:string,reason?:string):Promise<QuarantineRecord>{
    const entry:QuarantineRecord={id:this.newId(),store,key,code,...(reason?{reason}:{}),record,isolatedAt:this.now()};
    await this.run(['quarantine',store],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{
      await this.request(tx.objectStore('quarantine').put(entry));
      await this.request(tx.objectStore(store).delete(key));
    });
    return entry;
  }

  listQuarantine(){return this.all<QuarantineRecord>('quarantine');}

  // ---- attempts & immutable evidence (P0.4) ----

  /** Persists an attempt and its evidence atomically. Existing ids are never overwritten. */
  async recordAttempt(attempt:Attempt,evidence:PersistedEvidence[]):Promise<void>{
    const validAttempt=validateAttempt(attempt);
    const validEvidence=evidence.map(validatePersistedEvidence);
    for(const e of validEvidence) if(e.attemptId!==validAttempt.id) throw coded('EVIDENCE_ATTEMPT_MISMATCH');
    await this.run(['attempts','evidence'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      try{
        await this.request(tx.objectStore('attempts').add(validAttempt));
        for(const e of validEvidence) await this.request(tx.objectStore('evidence').add(e));
      }catch(error){
        if(error&&typeof error==='object'&&(error as any).name==='ConstraintError') throw coded('EVIDENCE_ID_COLLISION',error);
        throw error;
      }
    });
  }

  /** Appends one evidence record. Uses `add`, so an existing id is rejected instead of overwritten. */
  async saveEvidence(evidence:PersistedEvidence):Promise<void>{
    const valid=validatePersistedEvidence(evidence);
    await this.run(['evidence'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      try{await this.request(tx.objectStore('evidence').add(valid));}
      catch(error){if(error&&typeof error==='object'&&(error as any).name==='ConstraintError') throw coded('EVIDENCE_ID_COLLISION',error); throw error;}
    });
  }

  loadEvidenceForConcept(conceptId:string){ return this.byIndex<PersistedEvidence>('evidence','conceptId',conceptId); }
  loadEvidenceForLearningUnit(learningUnitId:string){ return this.byIndex<PersistedEvidence>('evidence','learningUnitId',learningUnitId); }
  loadEvidenceForAttempt(attemptId:string){ return this.byIndex<PersistedEvidence>('evidence','attemptId',attemptId); }
  loadEvidenceForContentVersion(contentVersion:string){ return this.byIndex<PersistedEvidence>('evidence','contentVersion',contentVersion); }
  listEvidence(){ return this.all<PersistedEvidence>('evidence'); }
  loadAttempt(id:string){ return this.get<Attempt>('attempts',id); }
  listAttempts(learningUnitId?:string){ return learningUnitId?this.byIndex<Attempt>('attempts','learningUnitId',learningUnitId):this.all<Attempt>('attempts'); }

  // ---- assessment / mastery cache ----

  saveAssessment(result:AssessmentResult){ return this.put('assessmentAttempts',result,result.id); }
  loadAssessment(id:string){ return this.get<AssessmentResult>('assessmentAttempts',id); }
  saveMastery(mastery:ConceptMastery){ return this.put('mastery',mastery,mastery.conceptId); }
  loadMastery(conceptId:string){ return this.get<ConceptMastery>('mastery',conceptId); }

  // ---- external lab evidence (P0.12) ----

  async saveExternalEvidence(evidence:unknown,expected:{bindingId:string;learningUnitId:string;provider:string}):Promise<StoredExternalLabEvidence>{
    const valid=validateExternalLabEvidence(evidence,expected);
    const record:StoredExternalLabEvidence={...valid,id:externalEvidenceKey(valid.bindingId,valid.learningUnitId),storedAt:this.now()};
    await this.put('externalEvidence',record);
    return record;
  }

  /** Restores external evidence; the record is re-validated and quarantined if it no longer passes. */
  async loadExternalEvidence(expected:{bindingId:string;learningUnitId:string;provider:string}):Promise<StoredExternalLabEvidence|undefined>{
    const key=externalEvidenceKey(expected.bindingId,expected.learningUnitId);
    const raw=await this.get<StoredExternalLabEvidence>('externalEvidence',key);
    if(raw===undefined) return undefined;
    try{
      const valid=validateExternalLabEvidence(raw,expected);
      return {...valid,id:raw.id,storedAt:raw.storedAt};
    }catch(error){
      await this.isolate('externalEvidence',key,raw,'EXTERNAL_EVIDENCE_INVALID',error instanceof Error?error.message:String(error));
      return undefined;
    }
  }
}

export type { Evidence };
