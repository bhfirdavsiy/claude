import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNuclearEquation } from '../src/domain/chemistry/nuclear-equation.ts';
import { idealGasPressure, totalGasMoles } from '../src/domain/chemistry/gas-laws.ts';
import { molesFromMass, particlesFromMoles, massPercent, molarity, normality } from '../src/domain/chemistry/stoichiometry.ts';
import { averageReactionRate, KineticsModel } from '../src/domain/chemistry/kinetics-model.ts';
import { EquilibriumModel } from '../src/domain/chemistry/equilibrium-model.ts';
import { faradayMass } from '../src/domain/chemistry/faraday-model.ts';
import { electronConfiguration } from '../src/domain/chemistry/electron-configuration.ts';

const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} !~= ${b}`);

test('electron configuration is derived from orbital capacities for bounded school-scope Z',()=>{
  assert.equal(electronConfiguration(11),'1s2 2s2 2p6 3s1');
  assert.equal(electronConfiguration(17),'1s2 2s2 2p6 3s2 3p5');
  assert.throws(()=>electronConfiguration(0),/ATOMIC_NUMBER_INVALID/);
});

test('nuclear equation validator conserves mass number and atomic number',()=>{
  assert.equal(validateNuclearEquation({reactants:[{A:238,Z:92}],products:[{A:234,Z:90},{A:4,Z:2}]}),true);
  assert.equal(validateNuclearEquation({reactants:[{A:238,Z:92}],products:[{A:234,Z:91},{A:4,Z:2}]}),false);
});

test('gas law helpers use bounded SI-compatible chemistry quantities',()=>{
  close(idealGasPressure({moles:1,temperatureK:273.15,volumeL:22.414}),101.325,0.1);
  close(totalGasMoles([0.25,0.75,1]),2);
  assert.throws(()=>idealGasPressure({moles:1,temperatureK:0,volumeL:1}),/GAS_INPUT_INVALID/);
});

test('stoichiometry and concentration calculations are unit-explicit',()=>{
  close(molesFromMass(18,18),1);
  close(particlesFromMoles(1),6.02214076e23,1e16);
  close(massPercent(10,100),10);
  close(molarity(0.5,0.25),2);
  close(normality(2,2),4);
});

test('kinetics model calculates average rate and resolves only curated factor effects',()=>{
  close(averageReactionRate({initialConcentration:1,finalConcentration:0.4,deltaSeconds:30}),0.02);
  const model=KineticsModel.from({records:[{id:'temp-up',factor:'temperature',change:'increase',effect:'increase',sourceRefs:['src'],reviewStatus:'pending'}]});
  assert.equal(model.effect('temperature','increase').effect,'increase');
  assert.deepEqual(model.effect('surface-area','increase'),{modeled:false,code:'KINETICS_EFFECT_NOT_MODELED'});
});

test('equilibrium model resolves only curated Le Chatelier perturbations',()=>{
  const model=EquilibriumModel.from({records:[{reactionId:'haber',perturbation:'pressure-increase',shift:'products',explanation:'Fewer gas moles on product side.',sourceRefs:['src'],reviewStatus:'pending'}]});
  assert.equal(model.resolve('haber','pressure-increase').shift,'products');
  assert.deepEqual(model.resolve('haber','temperature-increase'),{modeled:false,code:'EQUILIBRIUM_CASE_NOT_MODELED'});
});

test('Faraday mass calculation is explicit about electron number and current time',()=>{
  close(faradayMass({molarMassGPerMol:63.546,currentA:2,timeS:965,electronNumber:2}),0.6355,0.001);
  assert.throws(()=>faradayMass({molarMassGPerMol:63.546,currentA:2,timeS:965,electronNumber:0}),/FARADAY_INPUT_INVALID/);
});
