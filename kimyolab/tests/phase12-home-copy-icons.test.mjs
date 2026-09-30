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
  // P2.2 changed this assertion: the standalone artifact no longer exposes a __KIMYOLAB_STANDALONE_ASSETS__ global for
  // features to read; every product asset (home icons included) is embedded as a data: URL in the embedded HOST config
  // (__KIMYOLAB_HOST__, ADR-P2-003) and resolved through assetUrl(). The PNGs are still embedded.
  const source=fs.readFileSync(path.join(root,'scripts/build-standalone.ts'),'utf8');
  assert.match(source,/__KIMYOLAB_HOST__/);
  assert.match(source,/'\.png':'image\/png'/);
  assert.match(source,/data:\$\{type\};base64/);
  const report=JSON.parse(fs.readFileSync(path.join(root,'reports/standalone-build.json'),'utf8'));
  for(const rel of ['topic-studio.png','virtual-lab.png','results.png']) assert.ok(report.embeddedAssets.includes(`assets/home/${rel}`),rel);
});
