import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEngineCompatibility, completeCapabilities } from '../src/engines/shared/types.ts';

test('shared engine capabilities expose all required flags and compatibility checks major ranges',()=>{
  assert.deepEqual(completeCapabilities(),{
    keyboard:true,touch:true,offline:true,reducedMotion:true,lowEndFallback:true,serializable:true
  });
  assert.deepEqual(checkEngineCompatibility('1.2.0','^1.0.0'),{compatible:true});
  assert.deepEqual(checkEngineCompatibility('2.0.0','^1.0.0'),{compatible:false,code:'ENGINE_CONFIG_INCOMPATIBLE'});
});
