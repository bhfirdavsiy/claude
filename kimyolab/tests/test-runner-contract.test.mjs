import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('filesystem-mutating integration suites run serially to avoid content-pack races',()=>{
  for(const name of ['test','test:reference-slices','test:ui']){
    assert.match(pkg.scripts[name],/--test-concurrency=1/,`${name} must serialize shared content-pack tests`);
  }
});
