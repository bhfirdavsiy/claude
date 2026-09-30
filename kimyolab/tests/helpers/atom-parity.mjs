// P1.4 evidence parity harness. Drives the atom-builder practice through the REAL learner stack
// (ContentClient → ReferencePracticeSession → orchestrator → IndexedDB store) with a fixed learner sequence and
// returns everything that carries learning semantics, normalized (ids/timestamps removed). Run against the
// pre-P1.4 code it produced tests/fixtures/atom-legacy-baseline.json; the renderer-era code must match it.
export const ATOM_ACTIVITY='practice.simulation.7.07.planned';
/** a wrong turn (extra electron, then removed) and then C-14, one particle at a time */
export const ATOM_SEQUENCE=[['protons',1],['electrons',1],['electrons',1],['electrons',-1],...Array(5).fill(['protons',1]),...Array(8).fill(['neutrons',1]),...Array(5).fill(['electrons',1])];

const LEGACY_STATE_KEYS=['protons','neutrons','electrons','atomicNumber','massNumber','charge','element','isotope'];
const dropVolatile=(e)=>{const {createdAt:_c,attemptId:_a,id,persistedAt:_p,recordedAt:_r,...rest}=e;return {...rest,id:String(id).replace(/^[0-9a-f-]{36}$/,'<uuid>')};};

export async function runAtomParity(base,commandFor){
  const {ContentClient}=await import(`${base}/src/app/content-client.ts`);
  const {ReferencePracticeSession}=await import(`${base}/src/features/practice/session.ts`);
  const {BrowserProgressService}=await import(`${base}/src/features/progress/service.ts`);
  const {IndexedDbProgressStore}=await import(`${base}/src/runtime/progress/indexeddb-store.ts`);
  const {createFakeIndexedDb}=await import(`${base}/tests/helpers/fake-indexeddb.mjs`);
  const {memoryPackFetch}=await import(`${base}/tests/helpers/memory-pack.mjs`);
  const client=new ContentClient({fetchImpl:memoryPackFetch(),baseUrl:'/content'});
  const page=await client.loadPractice(ATOM_ACTIVITY);
  const factory=createFakeIndexedDb();
  const service=new BrowserProgressService(factory,'parity',{liveness:null});
  const session=service.beginPracticeSession(page,new ReferencePracticeSession(page));
  const completions=[];
  let out;
  for(const [particle,delta] of ATOM_SEQUENCE){ out=await service.applyPracticeCommand(session,commandFor(particle,delta)); completions.push(Boolean(out.step?.complete)); }
  const store=new IndexedDbProgressStore(factory,'parity');
  const attempts=(await store.listAttempts()).map(a=>({activityId:a.activityId,learningUnitId:a.learningUnitId,status:a.status,attemptType:a.attemptType??'practice'}));
  const evidence=(await store.listEvidence()).map(dropVolatile).map(({id:_i,...e})=>e).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const progress=(await store.listProgress()).map(p=>({learningUnitId:p.learningUnitId,status:p.status}));
  const finalState=Object.fromEntries(LEGACY_STATE_KEYS.map(k=>[k,out.result.finalState[k]]));
  return {
    activityId:ATOM_ACTIVITY,sequence:ATOM_SEQUENCE,
    result:{evidence:out.result.evidence.map(dropVolatile),score:out.result.evidence.map(e=>e.score),finalState},
    /** the step at which PRACTICE_COMPLETED happened (index into the sequence) — decided by the domain result */
    completedAtStep:completions.indexOf(true),
    attempts,evidence,progress,
  };
}
