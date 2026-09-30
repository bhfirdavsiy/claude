import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadReferenceSliceRegistry } from '../src/runtime/reference-slices/config.ts';
import { createSimulationSliceAdapter } from '../src/runtime/reference-slices/simulation-adapter.ts';
import { createTrainerSliceAdapter } from '../src/runtime/reference-slices/trainer-adapter.ts';
import { createCalculationSliceAdapter } from '../src/runtime/reference-slices/calculation-adapter.ts';
import { createCaseSliceAdapter } from '../src/runtime/reference-slices/case-adapter.ts';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));
const registry=loadReferenceSliceRegistry(read('content-src/activity-configs/reference-slices.json'));
const practices=read('content-src/practice-activities.json');
const activity=(id)=>practices.find(x=>x.id===id);
const meta={registry,contentVersion:'2026.09.1',scoringVersion:'1.0.0',now:()=> '2026-09-15T00:00:00.000Z'};

test('7.07 Atom Builder derives Carbon-14 and emits construction evidence',async()=>{
  const item=activity('practice.simulation.7.07.planned');
  const adapter=createSimulationSliceAdapter(meta);
  const result=await adapter.run(item,{inputs:{[item.id]:{simulationActions:[
    {particle:'protons',delta:6}, {particle:'neutrons',delta:8}, {particle:'electrons',delta:6}
  ]}}});
  // P1.4: the state comes from the canonical domain model; every pre-P1.4 key keeps its value (evidence parity:
  // tests/fixtures/atom-legacy-baseline.json). P1.4 closeout: the earlier expectation of elementName:'Uglerod' in
  // the domain state was wrong — a localized name is presentation (content-src/locales), not chemistry truth; the
  // state instead says explicitly whether an element exists yet (construction).
  assert.deepEqual(result.finalState,{construction:'element',protons:6,neutrons:8,electrons:6,atomicNumber:6,massNumber:14,charge:0,element:'C',isotope:'C-14'});
  assert.ok(result.evidence.some(e=>e.type==='construction'&&e.achieved));
  const restored=await adapter.restore(item,result.serializedState);
  assert.deepEqual(restored,result.finalState);
});

test('7.11 trainer gives specific feedback for AlO then accepts Al2O3',async()=>{
  const item=activity('practice.trainer.7.4');
  const adapter=createTrainerSliceAdapter(meta);
  const result=await adapter.run(item,{inputs:{[item.id]:{trainerAnswers:['AlO','Al2O3']}}});
  assert.equal(result.attempts[0].correct,false);
  assert.equal(result.attempts[0].feedbackKey,'trainer.valency.wrong-index');
  assert.equal(result.attempts[1].correct,true);
  assert.equal(result.finalState.status,'correct');
  assert.ok(result.evidence.some(e=>e.type==='answer'&&e.correct));
});

test('7.12 calculation enforces ordered Mr steps and reaches 98 for H2SO4',async()=>{
  const item=activity('practice.calculation.7.5');
  const adapter=createCalculationSliceAdapter(meta);
  const shortcut=await adapter.run(item,{inputs:{[item.id]:{calculationResponses:[{stepId:'total',value:98,unit:'relative-mass'}]}}});
  assert.equal(shortcut.outcomes[0].status,'invalid');
  assert.equal(shortcut.outcomes[0].code,'CALCULATION_STEP_OUT_OF_ORDER');

  const result=await adapter.run(item,{inputs:{[item.id]:{calculationResponses:[
    {stepId:'h-contribution',value:2,unit:'relative-mass'},
    {stepId:'s-contribution',value:32,unit:'relative-mass'},
    {stepId:'o-contribution',value:64,unit:'relative-mass'},
    {stepId:'total',value:98,unit:'relative-mass'}
  ]}}});
  assert.equal(result.finalState.status,'complete');
  assert.equal(result.parsedFormula.atoms.H,2);
  assert.equal(result.parsedFormula.atoms.S,1);
  assert.equal(result.parsedFormula.atoms.O,4);
  assert.equal(result.finalState.acceptedResponses.total.value,98);
});

test('7.18 case requires evidence and scientific justification then emits transfer evidence',async()=>{
  const item=activity('practice.case.7.14');
  const adapter=createCaseSliceAdapter(meta);
  const blocked=await adapter.run(item,{inputs:{[item.id]:{case:{
    evidenceIds:['traffic-no2'], decision:'transport', justification:'NO2 evidence', reflection:'r'
  }}}});
  assert.equal(blocked.completion.status,'blocked');
  assert.equal(blocked.completion.code,'CASE_EVIDENCE_REQUIRED');

  const result=await adapter.run(item,{inputs:{[item.id]:{case:{
    evidenceIds:['traffic-no2','calm-weather'],
    decision:'Prioritize transport emission reduction',
    justification:'NO2 evidence is highest near traffic and calm weather limits dispersion, so transport is a supported source hypothesis.',
    reflection:'Compare measurements after intervention.'
  }}}});
  assert.equal(result.completion.status,'complete');
  assert.ok(result.completion.score>=0.75);
  assert.equal(result.evidence[0].type,'decision');
  assert.equal(result.evidence[0].evidenceClass,'transfer-case');
});
