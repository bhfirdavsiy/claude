import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContentClient} from '../src/app/content-client.ts';
import {ReferencePracticeSession} from '../src/features/practice/session.ts';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const active=JSON.parse(fs.readFileSync(path.join(root,'public/content/manifest.json'),'utf8'));
const packRoot=path.join(root,'public/content',active.activeVersion);
function response(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}
// Pack files are served as raw bytes so the ContentClient can verify SHA-256 against the manifest.
function rawResponse(text,status=200){return {ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)};}
const fetchImpl=async(url)=>{
  const u=String(url); if(u==='/content/manifest.json') return response(active);
  const prefix=`/content/${active.activeVersion}/`; if(!u.startsWith(prefix)) return response({},404);
  const file=path.join(packRoot,u.slice(prefix.length)); if(!fs.existsSync(file)) return response({},404);
  return rawResponse(fs.readFileSync(file,'utf8'));
};
async function session(id){const model=await new ContentClient({fetchImpl,baseUrl:'/content'}).loadPractice(id);return new ReferencePracticeSession(model,{now:()=> '2026-09-15T00:00:00.000Z'});}

test('experiment session accumulates real engine actions and rejects invalid order',async()=>{
  const s=await session('practice.experiment.7.2');
  const invalid=await s.apply({kind:'experiment-action',action:{type:'filter'}});
  assert.equal(invalid.outcomes.at(-1).status,'invalid');
  for(const type of ['selectApparatus','addWater','addMixture','mix','filter','evaporate','observe']) await s.apply({kind:'experiment-action',action:{type}});
  const result=await s.result();
  assert.equal(result.finalState.status,'complete');
  assert.ok(result.evidence.some(e=>e.type==='observation'));
  assert.match(result.serializedState,/completedStepIds/);
});

test('simulation session reaches C-14 through the existing simulation engine',async()=>{
  const s=await session('practice.simulation.7.07.planned');
  await s.apply({kind:'simulation-action',action:{particle:'protons',delta:6}});
  await s.apply({kind:'simulation-action',action:{particle:'neutrons',delta:8}});
  const result=await s.apply({kind:'simulation-action',action:{particle:'electrons',delta:6}});
  assert.equal(result.finalState.isotope,'C-14');
  assert.ok(result.evidence.some(e=>e.type==='construction'));
});

test('trainer, calculation and case sessions use the verified engine adapters',async()=>{
  const trainer=await session('practice.trainer.7.4');
  let r=await trainer.apply({kind:'trainer-answer',answer:'AlO'});
  assert.equal(r.attempts.at(-1).feedbackKey,'trainer.valency.wrong-index');
  r=await trainer.apply({kind:'trainer-answer',answer:'Al2O3'});
  assert.ok(r.evidence.some(e=>e.type==='answer'&&e.correct));

  const calc=await session('practice.calculation.7.5');
  for(const response of [
    {stepId:'h-contribution',value:2,unit:'relative-mass'},
    {stepId:'s-contribution',value:32,unit:'relative-mass'},
    {stepId:'o-contribution',value:64,unit:'relative-mass'},
    {stepId:'total',value:98,unit:'relative-mass'},
  ]) r=await calc.apply({kind:'calculation-response',response});
  assert.ok(r.evidence.some(e=>e.type==='calculation'&&e.stepId==='total'));

  const c=await session('practice.case.7.14');
  r=await c.apply({kind:'case-submit',value:{evidenceIds:['traffic-no2','calm-weather'],decision:'transport emission',justification:'NO2 traffic evidence because calm weather limits dispersion',reflection:'supported'}});
  assert.ok(r.evidence.some(e=>e.type==='decision'));
});

test('reactive experiment session uses ReactionMatcher and IonicEngine rather than UI chemistry guesses',async()=>{
  const s=await session('practice.experiment.8.1');
  // P1.6: the learner chooses the reagents; the fixed addNaCl → addAgNO3 script no longer exists (ADR-P1-007)
  for(const action of [{type:'selectReagent',payload:{slot:'A',speciesId:'species.agno3'}},{type:'selectReagent',payload:{slot:'B',speciesId:'species.nacl'}},{type:'mix'},{type:'writeEquation',payload:{equation:'Ag+ + Cl- → AgCl(s)'}}]) await s.apply({kind:'experiment-action',action});
  const result=await s.result();
  assert.equal(result.finalState.status,'complete');
  assert.ok(result.evidence.some(e=>e.type==='observation'&&e.observation.type==='precipitate'));
  assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('session rejects commands for the wrong engine family',async()=>{
  const s=await session('practice.trainer.7.4');
  await assert.rejects(()=>s.apply({kind:'experiment-action',action:{type:'observe'}}),/PRACTICE_COMMAND_TYPE_MISMATCH/);
});
