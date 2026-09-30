import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('canonical shell preserves KimyoLab/Sinco visual identity and product navigation',()=>{
  const html=read('index.html');
  // P2.2 changed this assertion: the temporary "K" letter mark (kl-brand-mark) was replaced by the user-approved
  // KimyoLab logo, resolved through the host-safe asset path (ADR-P2-003 §7).
  assert.match(html,/class="kl-brand-logo" src="\/assets\/brand\/kimyolab-logo\.webp" data-kl-asset="assets\/brand\/kimyolab-logo\.webp"/);
  assert.match(html,/Mavzu studiyasi/);
  assert.match(html,/Virtual laboratoriya/);
  const css=read('src/ui/tokens/kimyolab.css');
  for(const token of ['--kl-brand-from:#004eb8','--kl-brand-mid:#023480','--kl-brand-to:#021236','kl-hero--sinco','kl-feature-grid','kl-experiment-stage']) assert.ok(css.toLowerCase().includes(token),token);
});

test('curriculum and lab routes are first-class app routes',()=>{
  const routes=read('src/app/routes.ts');
  assert.match(routes,/path==='\/curriculum'/);
  assert.match(routes,/path==='\/labs'/);
  const bootstrap=read('src/app/bootstrap.ts');
  assert.match(bootstrap,/renderCurriculum/);
  assert.match(bootstrap,/renderLabs/);
});

test('experiment renderer has a tangible virtual-lab workspace',()=>{
  const render=read('src/features/practice/render.ts');
  assert.match(render,/kl-experiment-stage/);
  assert.match(render,/kl-experiment-vessel/);
  // P2.1 changed this assertion: the shared practice strings moved from render.ts literals into the learner-interaction
  // catalog (ADR-P2-002). The renderer references the keys; the same learner-facing text lives in the catalog.
  assert.match(render,/'ui\.lab-steps'/);
  assert.match(render,/'ui\.lab-safety'/);
  const catalog=JSON.parse(read('content-src/locales/uz-latn/learner-interaction.json')).labels;
  assert.equal(catalog['ui.lab-steps'],'Tajriba bosqichlari');
  assert.match(catalog['ui.lab-safety'],/^Xavfsizlik:/);
});


test('virtual laboratory catalog hides internal engine and knowledge-base terminology from students',()=>{
  const render=read('src/features/labs/render.ts');
  for(const forbidden of ['Engine-backed','Guided + Reaction KB','Guided virtual protocol','chemistry/engine-backed','Reaction-KB grounded','integratsiya/reference','mastery hisoblanmaydi','assessmentida']) assert.equal(render.includes(forbidden),false,forbidden);
  for(const visible of ['Interaktiv tajriba','Yo‘naltirilgan tajriba','Bosqichma-bosqich tajriba','KimyoLab tajribasi','qo‘shimcha hamkor laboratoriya']) assert.ok(render.includes(visible),visible);
});
