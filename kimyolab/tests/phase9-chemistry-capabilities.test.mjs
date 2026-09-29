import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {HydrolysisModel} from '../src/domain/chemistry/hydrolysis-model.ts';
import {ElectrolysisModel} from '../src/domain/chemistry/electrolysis-model.ts';
import {ManganeseRedoxModel} from '../src/domain/chemistry/manganese-redox-model.ts';
const read=(p)=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8'));

test('hydrolysis model is curated and returns explicit acidic/basic/neutral media',()=>{
  const model=HydrolysisModel.from(read('content-src/chemistry/hydrolysis.json'));
  assert.equal(model.classify('AlCl3').medium,'acidic');
  assert.equal(model.classify('Na2CO3').medium,'basic');
  assert.equal(model.classify('NaCl').medium,'neutral');
  assert.deepEqual(model.classify('K2SO4'),{modeled:false,code:'HYDROLYSIS_NOT_MODELED'});
});

test('electrolysis model never infers unknown products',()=>{
  const model=ElectrolysisModel.from(read('content-src/chemistry/electrolysis.json'));
  const result=model.resolve({electrolyte:'CuCl2',phase:'aq',electrode:'inert'});
  assert.equal(result.modeled,true);
  assert.equal(result.cathode.product,'Cu');
  assert.equal(result.anode.product,'Cl2');
  assert.deepEqual(model.resolve({electrolyte:'NaCl',phase:'aq',electrode:'inert'}),{modeled:false,code:'ELECTROLYSIS_NOT_MODELED'});
});

test('manganese redox model requires medium and uses curated outcome records',()=>{
  const model=ManganeseRedoxModel.from(read('content-src/chemistry/manganese-redox.json'));
  assert.equal(model.resolve('acidic').product,'Mn^2+');
  assert.equal(model.resolve('neutral').product,'MnO2');
  assert.equal(model.resolve('basic').product,'MnO4^2-');
});
