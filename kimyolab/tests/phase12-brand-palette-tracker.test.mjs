import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('canonical design system uses the approved blue gradient and rejects legacy purple brand tokens',()=>{
  const css=read('src/ui/tokens/kimyolab.css').toLowerCase();
  for(const value of ['--kl-brand-from:#004eb8','--kl-brand-mid:#023480','--kl-brand-to:#021236','--kl-brand-gradient']) assert.ok(css.includes(value),value);
  for(const legacy of ['#913bff','#6f2bff','#7137d8','#5523ad','#5c2cff','#7f2cf2','#5b27cf']) assert.equal(css.includes(legacy),false,`legacy brand color ${legacy}`);
  assert.match(css,/\.kl-hero--sinco\{[^}]*background:var\(--kl-brand-gradient\)/);
});

test('canonical entry declares the blue browser theme color',()=>{
  const html=read('index.html').toLowerCase();
  assert.match(html,/name="theme-color" content="#023480"/);
});

test('progress tracker exposes current substage and the path to Stable finalize',()=>{
  const script=read('scripts/generate-progress-tracker.ts');
  assert.match(script,/currentSubstage:'12\.10 — Validated mustahkamlash savollar banki'/);
  assert.match(script,/Oldinda turgan bosqichlar/);
  for(const stage of ['Blue brand palette migration','Front visual QA & approval','Native lab chemistry hardening','Nazariya → Amaliyot → Mustahkamlash learning cycle','Validated mustahkamlash savollar banki','Unrestricted browser evidence','Stable preflight','Stable finalize']) assert.ok(script.includes(stage),stage);
  assert.match(script,/#004EB8 → #023480 → #021236/);
  assert.match(script,/Front visual QA & approval',status:'TECHNICAL_DONE'/);
  assert.match(script,/Native lab chemistry hardening',status:'DONE'/);
  assert.match(script,/External provider production hookup',status:'TECHNICAL_DONE'/);
  assert.match(script,/Unrestricted browser evidence',status:'HANDOFF_READY'/);
  assert.match(script,/Nazariya → Amaliyot → Mustahkamlash learning cycle',status:'TECHNICAL_DONE'/);
  assert.match(script,/Validated mustahkamlash savollar banki',status:'CURRENT'/);
  assert.match(script,/Expert \/ Beta \/ visual approvals',status:'WAITING'/);
});

test('brand gradient keeps white hero text at WCAG AA contrast across all sampled stops',()=>{
  const parse=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const luminance=(rgb)=>{
    const v=rgb.map(x=>{const c=x/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];
  };
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
  const white=[255,255,255];
  const stops=['#004eb8','#023480','#021236'];
  for(const stop of stops) assert.ok(ratio(white,parse(stop))>=7,`${stop} white contrast must be >= 7:1`);
});
