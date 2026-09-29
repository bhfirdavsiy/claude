import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeRouter } from '../src/runtime/practice-router/router.ts';

const ready=(type)=>({id:`practice.${type}.demo`,type,title:'Demo',goal:'Demo',conceptIds:['concept.c1'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{},accessibilityProfile:[],engineCompatibility:{engine:type,range:'^1.0.0'},sourceRefs:[],legacyIds:[],version:'1.0.0'});

test('routes all five ready practice types to their registered engine adapters',async()=>{
  const router=new PracticeRouter();
  const seen=[];
  for(const type of ['experiment','simulation','trainer','calculation','case']){
    router.register(type,{run:async(activity,context)=>{seen.push([type,activity.id,context.token]); return {evidence:[],serializedState:`${type}:done`};}});
  }
  for(const type of ['experiment','simulation','trainer','calculation','case']){
    const result=await router.run(ready(type),{token:'ctx'});
    assert.equal(result.ok,true);
    assert.equal(result.value.serializedState,`${type}:done`);
  }
  assert.equal(seen.length,5);
});

test('returns ACTIVITY_NOT_READY without invoking engine for non-ready activity',async()=>{
  const router=new PracticeRouter(); let called=false;
  router.register('trainer',{run:async()=>{called=true;return {evidence:[]};}});
  const activity={...ready('trainer'),lifecycleStatus:'planned'};
  const result=await router.run(activity,{});
  assert.deepEqual(result,{ok:false,error:{code:'ACTIVITY_NOT_READY',activityId:activity.id}});
  assert.equal(called,false);
});

test('returns ENGINE_NOT_REGISTERED for ready activity without adapter',async()=>{
  const router=new PracticeRouter();
  const result=await router.run(ready('case'),{});
  assert.deepEqual(result,{ok:false,error:{code:'ENGINE_NOT_REGISTERED',activityType:'case'}});
});
