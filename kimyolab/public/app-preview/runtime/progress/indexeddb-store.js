                                                       
                                                                                 
import { validateAttempt, validatePersistedEvidence } from '../evidence/types.js';
                                                                           
                                                                      
import { loadProgressRecord } from './migrations.js';
import { newUuid, UUID_PATTERN } from '../shared/ids.js';
import { validateExternalLabEvidence, externalEvidenceKey,                                } from '../../integrations/external-labs/evidence.js';

// IndexedDB layout (P0.7). Every database version has an explicit migration; the
// upgrade transaction is atomic, so a failed migration leaves the old data intact.
export const CURRENT_DB_VERSION=2;

export const STORES=['progress','attempts','evidence','activityState','externalEvidence','metadata','assessmentAttempts','mastery','quarantine']         ;
                                            

export const EVIDENCE_INDEXES=['conceptId','learningUnitId','attemptId','contentVersion','createdAt']         ;

                                 
         
         
                    
                 
 
                                                   

function ensureStore(db    ,name       ,options                   ){
  return db.objectStoreNames.contains(name)?undefined:db.createObjectStore(name,options);
}

function createEvidenceStore(db    ){
  const store=db.createObjectStore('evidence',{keyPath:'id'});
  for(const index of EVIDENCE_INDEXES) store.createIndex(index,index,{unique:false});
  return store;
}

/**
 * Explicit, ordered schema migrations. Key N upgrades a database from version N-1 to N.
 */
export const dbMigrations                           ={
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
          const keys          =keysReq.result??[];
          const values      =valuesReq.result??[];
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
          (valuesReq.result??[]).forEach((value        ,i       )=>metadata.put(value,keysReq.result[i]));
          db.deleteObjectStore('appMeta');
        };
      };
    }
    tx.objectStore('metadata').put({dbVersion:2,migratedFrom:oldVersion,migratedAt},'db.schema');
  },
};

function coded(code       ,error         )       {
  const detail=error instanceof Error?`: ${error.message}`:error&&typeof error==='object'&&'name' in (error       )?`: ${(error       ).name}`:'';
  const out=new Error(`${code}${detail}`);
  (out       ).code=code;
  return out;
}

function isCoded(error        ,prefix       ){return error instanceof Error&&error.message.startsWith(prefix);}

                                        
                  
                    
                                         
                                                                                                     
                                     
 

                                   
            
                             
             
              
                 
                 
                    
 

export class IndexedDbProgressStore {
          dbPromise              ;
                   factory    ;
                   dbName       ;
                   dbVersion       ;
                   now           ;
                   newId           ;
                   migrations                           ;
                   isolateOnMigrationFailure        ;
          activeDbName       ;
  isolation                                     ;

  constructor(factory    , dbName='kimyolab-runtime', dbVersion=CURRENT_DB_VERSION, options                      ={}){
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

          openNamed(name       )             {
    return new Promise((resolve,reject)=>{
      let req    ;
      let upgradeFailed        ;
      try { req=this.factory.open(name,this.dbVersion); }
      catch(error){ reject(coded('PROGRESS_STORAGE_UNAVAILABLE',error)); return; }
      req.onupgradeneeded=(event    )=>{
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

          open()             {
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

          request   (req    )           {
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result     );
      req.onerror=(event    )=>{event?.preventDefault?.();reject(req.error??new Error('IDB_REQUEST_FAILED'));};
    });
  }

          transactionDone(tx    )              {
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error??new Error('IDB_TRANSACTION_FAILED'));
      tx.onabort=()=>reject(tx.error??new Error('IDB_TRANSACTION_ABORTED'));
    });
  }

          async run   (stores            ,mode                       ,failCode       ,body                     )           {
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

          put(store          ,value        ,key        )              {
    return this.run([store],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{await this.request(key===undefined?tx.objectStore(store).put(value):tx.objectStore(store).put(value,key));});
  }

          get   (store          ,key       )                     {
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request             (tx.objectStore(store).get(key)));
  }

          all   (store          )             {
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request     (tx.objectStore(store).getAll()));
  }

          byIndex   (store          ,index       ,value       )             {
    return this.run([store],'readonly','PROGRESS_LOAD_FAILED',tx=>this.request     (tx.objectStore(store).index(index).getAll(value)));
  }

  async exportSnapshot(){
    const snapshot                         ={};
    for(const name of STORES) snapshot[name]=await this.all         (name);
    return snapshot                               ;
  }

  async resetStore(store          )              {
    await this.run([store],'readwrite','PROGRESS_RESET_FAILED',async tx=>{await this.request(tx.objectStore(store).clear());});
  }

  async metadata           (key       ){return this.get   ('metadata',key);}

  /**
   * Anonymous, random, per-installation identifier (UUID v4). Created once and kept in
   * IndexedDB metadata. It carries no personal data and is only sent to the KimyoLab server,
   * which derives a pseudonymous partner id from it (docs/integrations/nobook-identity-contract.md).
   */
  async getOrCreateInstallationId()                {
    return this.run(['metadata'],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{
      const store=tx.objectStore('metadata');
      const existing=await this.request                        (store.get('installation.id'));
      if(existing&&typeof existing.id==='string'&&UUID_PATTERN.test(existing.id)) return existing.id;
      const id=newUuid();
      await this.request(store.put({id,createdAt:this.now()},'installation.id'));
      return id;
    });
  }

  // ---- progress (P0.6: load → validate → version check → migrate → isolate) ----

  saveProgress(progress                     ){ return this.put('progress',progress,progress.learningUnitId); }

  /**
   * Atomic progress mutation (P1.0, baseline C8): read → migrate/validate → update → save inside ONE
   * readwrite transaction, so concurrent mutations of the same unit are serialized by IndexedDB and
   * cannot overwrite each other. `updater` must be pure and synchronous (no awaits inside the transaction).
   * A stored record that cannot be migrated is isolated to quarantine in the same transaction.
   */
  async updateProgress(learningUnitId       ,updater                                                               )                              {
    return this.run(['progress','quarantine'],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{
      const store=tx.objectStore('progress');
      const raw=await this.request         (store.get(learningUnitId));
      let current                               ;
      if(raw!==undefined){
        const loaded=loadProgressRecord(raw);
        if(loaded.status==='isolated'){
          const entry                 ={id:this.newId(),store:'progress',key:learningUnitId,code:loaded.code,reason:loaded.reason,record:raw,isolatedAt:this.now()};
          await this.request(tx.objectStore('quarantine').put(entry));
        }else current=loaded.record;
      }
      const next=updater(current);
      if(next.learningUnitId!==learningUnitId) throw coded('PROGRESS_KEY_MISMATCH');
      await this.request(store.put(next,learningUnitId));
      return next;
    });
  }

  async loadProgress(learningUnitId       )                                        {
    const raw=await this.get         ('progress',learningUnitId);
    if(raw===undefined) return undefined;
    return this.resolveProgress(learningUnitId,raw);
  }

  async listProgress()                                {
    const rows=await this.run(['progress'],'readonly','PROGRESS_LOAD_FAILED',async tx=>{
      const store=tx.objectStore('progress');
      const [keys,values]=await Promise.all([this.request           (store.getAllKeys()),this.request           (store.getAll())]);
      return keys.map((k,i)=>({key:String(k),value:values[i]}));
    });
    const out                       =[];
    for(const row of rows){const resolved=await this.resolveProgress(row.key,row.value);if(resolved)out.push(resolved);}
    return out;
  }

          async resolveProgress(key       ,raw        )                                        {
    const result=loadProgressRecord(raw);
    if(result.status==='current') return result.record;
    if(result.status==='migrated'){await this.saveProgress(result.record);return result.record;}
    await this.isolate('progress',key,raw,result.code,result.reason);
    return undefined;
  }

  /** Moves a record that cannot be migrated into quarantine; the original bytes are preserved. */
  async isolate(store          ,key       ,record        ,code       ,reason        )                          {
    const entry                 ={id:this.newId(),store,key,code,...(reason?{reason}:{}),record,isolatedAt:this.now()};
    await this.run(['quarantine',store],'readwrite','PROGRESS_SAVE_FAILED',async tx=>{
      await this.request(tx.objectStore('quarantine').put(entry));
      await this.request(tx.objectStore(store).delete(key));
    });
    return entry;
  }

  listQuarantine(){return this.all                  ('quarantine');}

  // ---- attempts & immutable evidence (P0.4) ----

  /** Persists an attempt and its evidence atomically. Existing ids are never overwritten. */
  async recordAttempt(attempt        ,evidence                    )              {
    const validAttempt=validateAttempt(attempt);
    const validEvidence=evidence.map(validatePersistedEvidence);
    for(const e of validEvidence) if(e.attemptId!==validAttempt.id) throw coded('EVIDENCE_ATTEMPT_MISMATCH');
    await this.run(['attempts','evidence'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      try{
        await this.request(tx.objectStore('attempts').add(validAttempt));
        for(const e of validEvidence) await this.request(tx.objectStore('evidence').add(e));
      }catch(error){
        if(error&&typeof error==='object'&&(error       ).name==='ConstraintError') throw coded('EVIDENCE_ID_COLLISION',error);
        throw error;
      }
    });
  }

  /** Appends evidence to an attempt that already exists (same session). Never overwrites. */
  /**
   * Terminal attempt transition (P1.0): in_progress → completed | abandoned, exactly once.
   * Legacy attempts without status are already completed. Evidence is never touched here.
   */
  async finishAttempt(attemptId       ,status                        ,at       )                 {
    return this.run(['attempts'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      const store=tx.objectStore('attempts');
      const attempt=await this.request                   (store.get(attemptId));
      if(!attempt) throw coded('ATTEMPT_UNKNOWN');
      if(attempt.status!=='in_progress') throw coded('ATTEMPT_ALREADY_FINISHED');
      const next=validateAttempt({...attempt,status,completedAt:at});
      await this.request(store.put(next));
      return next;
    });
  }

  async appendAttemptEvidence(attemptId       ,evidence                    )              {
    const validEvidence=evidence.map(validatePersistedEvidence);
    for(const e of validEvidence) if(e.attemptId!==attemptId) throw coded('EVIDENCE_ATTEMPT_MISMATCH');
    await this.run(['attempts','evidence'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      const attempt=await this.request                   (tx.objectStore('attempts').get(attemptId));
      if(!attempt) throw coded('EVIDENCE_ATTEMPT_UNKNOWN');
      if(attempt.status==='abandoned') throw coded('EVIDENCE_ATTEMPT_ABANDONED');
      try{for(const e of validEvidence) await this.request(tx.objectStore('evidence').add(e));}
      catch(error){if(error&&typeof error==='object'&&(error       ).name==='ConstraintError') throw coded('EVIDENCE_ID_COLLISION',error); throw error;}
    });
  }

  /** Appends one evidence record. Uses `add`, so an existing id is rejected instead of overwritten. */
  async saveEvidence(evidence                  )              {
    const valid=validatePersistedEvidence(evidence);
    await this.run(['evidence'],'readwrite','EVIDENCE_SAVE_FAILED',async tx=>{
      try{await this.request(tx.objectStore('evidence').add(valid));}
      catch(error){if(error&&typeof error==='object'&&(error       ).name==='ConstraintError') throw coded('EVIDENCE_ID_COLLISION',error); throw error;}
    });
  }

  loadEvidenceForConcept(conceptId       ){ return this.byIndex                   ('evidence','conceptId',conceptId); }
  loadEvidenceForLearningUnit(learningUnitId       ){ return this.byIndex                   ('evidence','learningUnitId',learningUnitId); }
  loadEvidenceForAttempt(attemptId       ){ return this.byIndex                   ('evidence','attemptId',attemptId); }
  loadEvidenceForContentVersion(contentVersion       ){ return this.byIndex                   ('evidence','contentVersion',contentVersion); }
  listEvidence(){ return this.all                   ('evidence'); }
  loadAttempt(id       ){ return this.get         ('attempts',id); }
  listAttempts(learningUnitId        ){ return learningUnitId?this.byIndex         ('attempts','learningUnitId',learningUnitId):this.all         ('attempts'); }

  // ---- assessment / mastery cache ----

  saveAssessment(result                 ){ return this.put('assessmentAttempts',result,result.id); }
  loadAssessment(id       ){ return this.get                  ('assessmentAttempts',id); }
  saveMastery(mastery               ){ return this.put('mastery',mastery,mastery.conceptId); }
  loadMastery(conceptId       ){ return this.get                ('mastery',conceptId); }

  // ---- external lab evidence (P0.12) ----

  async saveExternalEvidence(evidence        ,expected                                                         )                                   {
    const valid=validateExternalLabEvidence(evidence,expected);
    const record                          ={...valid,id:externalEvidenceKey(valid.bindingId,valid.learningUnitId),storedAt:this.now()};
    await this.put('externalEvidence',record);
    return record;
  }

  /** Restores external evidence; the record is re-validated and quarantined if it no longer passes. */
  async loadExternalEvidence(expected                                                         )                                             {
    const key=externalEvidenceKey(expected.bindingId,expected.learningUnitId);
    const raw=await this.get                           ('externalEvidence',key);
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

                         
