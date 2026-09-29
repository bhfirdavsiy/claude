import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSimulationMode} from '../src/runtime/capabilities/simulation-mode.ts';

const capable={webgl:true,canvas2d:true,svg:true,memoryGb:8,reducedMotion:false,rendererFailures:0};

test('capable devices use the full 3D simulation mode',()=>{
  assert.equal(selectSimulationMode(capable),'3d');
});

test('missing WebGL, low memory, reduced motion or repeated renderer failures downgrade to 2D',()=>{
  for(const patch of [{webgl:false},{memoryGb:1},{reducedMotion:true},{rendererFailures:2}]) assert.equal(selectSimulationMode({...capable,...patch}),'2d');
});

test('fallback degrades from 2D to static then text when rendering capabilities are unavailable',()=>{
  assert.equal(selectSimulationMode({...capable,webgl:false,canvas2d:false}),'static');
  assert.equal(selectSimulationMode({...capable,webgl:false,canvas2d:false,svg:false}),'text');
});
