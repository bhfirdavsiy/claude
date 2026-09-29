import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

test('all authored experiment activities have a runnable config or a guided virtual protocol',()=>{
  const practices=json('content-src/practice-activities.json').filter(x=>x.type==='experiment');
  const dir=path.join(root,'content-src','activity-configs');
  const sources=fs.readdirSync(dir).filter(x=>x.endsWith('.json'));
  const configured=new Set();
  for(const name of sources) for(const id of Object.keys(json(`content-src/activity-configs/${name}`))) configured.add(id);
  assert.equal(practices.length,57);
  assert.equal(practices.filter(x=>configured.has(x.id)).length,57);
});

test('guided labs are generated only from authored legacy steps and retain safety notes',()=>{
  const guided=json('content-src/activity-configs/guided-labs.json');
  const practices=new Map(json('content-src/practice-activities.json').map(x=>[x.id,x]));
  assert.equal(Object.keys(guided).length,27);
  for(const [id,config] of Object.entries(guided)){
    const activity=practices.get(id);
    assert.ok(activity);
    assert.equal(config.type,'experiment');
    assert.equal(config.readiness,'guided-protocol');
    assert.equal(config.scenario.steps.length,activity.legacyContent.steps.length);
    assert.deepEqual(config.scenario.steps.map(x=>x.label),activity.legacyContent.steps);
    if(activity.legacyContent.safety) assert.ok(config.safetyNotes.includes(activity.legacyContent.safety));
  }
});

test('guided lab config is routed through the generic ExperimentEngine adapter',()=>{
  const client=fs.readFileSync(path.join(root,'src/app/content-client.ts'),'utf8');
  const session=fs.readFileSync(path.join(root,'src/features/practice/session.ts'),'utf8');
  assert.match(client,/guided-labs\.json/);
  assert.match(client,/\?'guided'/);
  assert.match(session,/configFamily==='guided'/);
});

test('reaction-grounded guided steps use only curated Reaction KB observation records',()=>{
  const configs=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/guided-labs.json'),'utf8'));
  const reactions=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/reactions.json'),'utf8'));
  const byId=new Map(reactions.map(r=>[r.id,r]));
  const grounded=[];
  for(const [activityId,config] of Object.entries(configs)) for(const step of config.scenario.steps){
    const reactionIds=step.reactionIds??(step.reactionId?[step.reactionId]:[]);
    if(!reactionIds.length) continue;
    grounded.push({activityId,step});
    const expected=[];
    for(const reactionId of reactionIds){
      const reaction=byId.get(reactionId);
      assert.ok(reaction,`missing Reaction KB record ${reactionId}`);
      if(reaction.observations?.[0]) expected.push(reaction.observations[0]);
    }
    if(step.groundingMode==='hybrid'){
      assert.deepEqual(step.observations.slice(0,expected.length),expected);
      assert.ok(step.observations.length>expected.length);
    } else {
      assert.deepEqual(step.observations,expected);
    }
    assert.deepEqual(step.observation,expected[0]);
  }
  assert.equal(grounded.length,19);
  assert.deepEqual(configs['practice.experiment.8.8'].scenario.steps[2].reactionIds,['rxn.agno3-nacl','rxn.agno3-nabr','rxn.agno3-nai']);
  assert.equal(configs['practice.experiment.8.8'].scenario.steps[2].observations.length,3);
});

test('lab catalog communicates reaction-grounded guided labs separately from plain guided protocols',()=>{
  const clientSource=fs.readFileSync(path.join(root,'src/app/content-client.ts'),'utf8');
  const renderSource=fs.readFileSync(path.join(root,'src/features/labs/render.ts'),'utf8');
  assert.match(clientSource,/hardeningStatus/);
  assert.match(renderSource,/Yo‘naltirilgan tajriba/);
  assert.match(renderSource,/Bosqichma-bosqich tajriba/);
  assert.doesNotMatch(renderSource,/Reaction-KB grounded guided/);
});


test('sulfate qualitative guided step uses a bounded source-linked chemistry model rather than a single representative reaction',()=>{
  const configs=JSON.parse(fs.readFileSync(path.join(root,'content-src/activity-configs/guided-labs.json'),'utf8'));
  const models=JSON.parse(fs.readFileSync(path.join(root,'content-src/chemistry/qualitative-tests.json'),'utf8'));
  const step=configs['practice.experiment.8.13'].scenario.steps[1];
  const model=models.tests.find(x=>x.id==='qual.sulfate-barium');
  assert.ok(model);
  assert.equal(model.reviewStatus,'pending');
  assert.deepEqual(model.supportedSamples,['H2SO4','Na2SO4','CuSO4','Al2(SO4)3']);
  assert.equal(step.modelId,model.id);
  assert.equal(step.modelType,'qualitative-test');
  assert.deepEqual(step.observation,model.observation);
  assert.equal(step.reactionId,undefined);
  assert.equal(configs['practice.experiment.8.13'].hardening.modelGroundedSteps,1);
});
