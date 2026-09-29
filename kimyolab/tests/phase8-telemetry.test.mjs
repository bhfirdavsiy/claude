import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeTelemetryEvent} from '../src/runtime/governance/telemetry.ts';

test('telemetry keeps only allowlisted anonymous engine error fields',()=>{
  const event=sanitizeTelemetryEvent({kind:'engine_error',payload:{code:'REACTION_NOT_MODELED',engine:'experiment',answer:'secret student answer',evidence:[{raw:'private'}],userId:'123'}});
  assert.deepEqual(event,{kind:'engine_error',payload:{code:'REACTION_NOT_MODELED',engine:'experiment'}});
  assert.equal(JSON.stringify(event).includes('secret'),false);
  assert.equal(JSON.stringify(event).includes('userId'),false);
});

test('telemetry accepts route/activity/performance events with bounded fields only',()=>{
  assert.deepEqual(sanitizeTelemetryEvent({kind:'route_opened',payload:{route:'/learn/lu.7.01',email:'x@y.uz'}}),{kind:'route_opened',payload:{route:'/learn/lu.7.01'}});
  assert.deepEqual(sanitizeTelemetryEvent({kind:'performance',payload:{metric:'LCP',value:2100,unit:'ms',freeText:'x'}}),{kind:'performance',payload:{metric:'LCP',value:2100,unit:'ms'}});
});

test('telemetry rejects event families outside the governance contract',()=>{
  assert.throws(()=>sanitizeTelemetryEvent({kind:'student_answer',payload:{answer:'H2O'}}),/TELEMETRY_EVENT_NOT_ALLOWED/);
});
