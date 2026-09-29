import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());

test('home hero uses approved Uzbek copy',()=>{
  const copy=fs.readFileSync(path.join(root,'src/features/home/copy.ts'),'utf8');
  assert.match(copy,/Kimyo fanini tajribalar orqali o‘rganing/);
  assert.match(copy,/Virtual tajribalar, interaktiv modellar va mashqlar yordamida kimyoviy jarayonlarni sinab ko‘ring, kuzating va yaxshiroq tushuning\./);
});

test('home feature cards use approved image assets instead of emoji icons',()=>{
  const render=fs.readFileSync(path.join(root,'src/features/home/render.ts'),'utf8');
  for(const rel of ['topic-studio.png','virtual-lab.png','results.png']){
    assert.match(render,new RegExp(rel.replace('.','\\.')));
    const asset=path.join(root,'public/assets/home',rel);
    assert.ok(fs.existsSync(asset),`missing ${rel}`);
    assert.ok(fs.statSync(asset).size>10000,`asset too small ${rel}`);
  }
  assert.doesNotMatch(render,/📚|🧪|📈/);
  assert.match(render,/kl-feature-icon__image/);
});

test('standalone builder embeds home PNG assets',()=>{
  const source=fs.readFileSync(path.join(root,'scripts/build-standalone.ts'),'utf8');
  assert.match(source,/__KIMYOLAB_STANDALONE_ASSETS__/);
  assert.match(source,/data:image\/png;base64/);
});
