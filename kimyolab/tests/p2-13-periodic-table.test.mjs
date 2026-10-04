// P2.13 — periodic table + Element Hub (ADR-P2-014): one identity source, derived positions with display ≠ period,
// honest gaps (names, metadata, electron configuration), evidence-derived relations, the flagged route, the shared
// search, feature isolation and the six reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ELEMENT_SYMBOLS} from '../src/domain/chemistry/periodic-table.ts';
import {chemicalPeriod,displayPosition,groupNumber,isFBlock} from '../src/domain/chemistry/periodic-layout.ts';
import {electronConfiguration,electronConfigurationStatus} from '../src/domain/chemistry/electron-configuration.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {buildElementHub,formulaElements,parseElementMetadata,parseElementRelations} from '../scripts/lib/element-hub.ts';
import {assertElementHub} from '../src/features/periodic/hub.ts';
import {elementSearchEntries,matchesFilters,NO_FILTERS,elementGrades,availableCategories} from '../src/features/periodic/model.ts';
import {searchStudentContent} from '../src/features/search/model.ts';
import {parseAppRoute} from '../src/app/routes.ts';
import {FEATURE_FLAGS,isFeatureEnabled} from '../src/app/feature-flags.ts';
import {legacyParity,periodicOutputs,PERIODIC_REPORTS,LEGACY_STATUSES} from '../scripts/periodic-table.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const {hub}=buildElementHub(root);
const el=(s)=>hub.elements.find(e=>e.symbol===s);

test('identity: exactly 118, Z 1–118, symbols exactly ELEMENT_SYMBOLS, no duplicates, no second identity source',()=>{
  assert.equal(hub.elements.length,118);
  assert.deepEqual(hub.elements.map(e=>e.z),Array.from({length:118},(_,i)=>i+1));
  assert.deepEqual(hub.elements.map(e=>e.symbol),[...ELEMENT_SYMBOLS]);
  assert.equal(new Set(hub.elements.map(e=>e.z)).size,118); assert.equal(new Set(hub.elements.map(e=>e.symbol)).size,118);
  assertElementHub(hub);
  assert.throws(()=>assertElementHub({...hub,elements:hub.elements.slice(1)}),/count/);
  assert.throws(()=>assertElementHub({...hub,elements:hub.elements.map((e,i)=>i===10?{...e,symbol:'Xx'}:e)}),/identity:11/);
  // no 118-element list anywhere in the new code: the identity comes only from periodic-table.ts
  for(const f of ['src/domain/chemistry/periodic-layout.ts','src/features/periodic/hub.ts','src/features/periodic/model.ts','src/features/periodic/render.ts','scripts/lib/element-hub.ts','scripts/periodic-table.ts']){
    const s=read(f); assert.ok(!/['"`](?:H|He)['"`]\s*,\s*['"`](?:He|Li)['"`]/.test(s),`${f}: element list literal`); assert.ok(!/\bHe Li Be\b/.test(s),`${f}: element string list`);
  }
  // the learner renderer never parses formulas or derives positions
  const render=read('src/features/periodic/render.ts');
  assert.ok(!/formula-parser|periodic-layout|electron-configuration/.test(render));
});

test('layout: chemical period from Z; the f-block display row is never a period; f-block group stays open',()=>{
  assert.deepEqual([1,2,3,10,11,18,19,36,37,54,55,86,87,118].map(chemicalPeriod),[1,1,2,2,3,3,4,4,5,5,6,6,7,7]);
  assert.deepEqual([1,2,5,10,13,18,21,30,72,80,86,104,118].map(groupNumber),[1,18,13,18,13,18,3,12,4,12,18,4,18]);
  for(const z of [57,63,71,89,95,103]){ assert.equal(isFBlock(z),true); assert.equal(groupNumber(z),null); }
  const la=displayPosition(57), ac=displayPosition(89);
  assert.deepEqual([la.row,la.column,chemicalPeriod(57)],[9,3,6]);
  assert.deepEqual([ac.row,ac.column,chemicalPeriod(89)],[10,3,7]);
  assert.equal(el('Lu').period.value,6); assert.equal(el('Lr').period.value,7);
  assert.deepEqual(el('La').group,{status:'GAP',reason:'F_BLOCK_GROUP_CONVENTION'});
  // every cell has a unique display slot
  assert.equal(new Set(hub.elements.map(e=>`${e.display.row}:${e.display.column}`)).size,118);
  // the legacy f-block "period" 8 / 9 is a display row: it is reported DISPLAY_ONLY, never turned into a period
  const parity=legacyParity(root);
  const ce=parity.rows.find(r=>r.symbol==='Ce');
  assert.equal(ce.period,'DISPLAY_ONLY'); assert.equal(ce.legacyPeriod,8); assert.equal(ce.chemicalPeriod,6);
  assert.equal(el('Ce').period.value,6);
  assert.equal(parity.summary.period.DISPLAY_ONLY,28); assert.equal(parity.summary.period.CONFLICT,0);
});

test('names: never invented, never copied from legacy; a missing name is the symbol',()=>{
  const names=json('content-src/locales/uz-latn/chemistry-elements.json');
  assert.equal(Object.keys(names.names).length,20); assert.equal(names.reviewStatus,'pending');
  // the hub carries no names at all; the page reads the locale catalog, the search entry falls back to the symbol
  assert.ok(hub.elements.every(e=>!('name' in e)&&!('names' in e)));
  const entries=elementSearchEntries(hub,s=>names.names[s]??null,{kicker:'Element',description:z=>`Z ${z}`},'');
  assert.equal(entries.find(e=>e.href==='/periodic/Na').title,'Natriy (Na)');
  assert.equal(entries.find(e=>e.href==='/periodic/Fe').title,'Fe');
  assert.equal(entries.find(e=>e.href==='/periodic/Fe').searchText,'');
  // legacy names are audited (20 match the catalog, 98 have no catalog source) and none was copied
  const p=legacyParity(root).summary.name;
  assert.deepEqual([p.CANONICAL_MATCH,p.SOURCE_REQUIRED,p.CONFLICT],[20,98,0]);
});

test('electron configuration: computed only inside the engine range; known gaps and beyond are unavailable',()=>{
  assert.deepEqual(electronConfigurationStatus(11),{status:'COMPUTED',value:electronConfiguration(11)});
  assert.deepEqual(electronConfigurationStatus(24),{status:'UNAVAILABLE',reason:'ENGINE_KNOWN_GAP'});
  assert.deepEqual(electronConfigurationStatus(29),{status:'UNAVAILABLE',reason:'ENGINE_KNOWN_GAP'});
  assert.deepEqual(electronConfigurationStatus(37),{status:'UNAVAILABLE',reason:'OUTSIDE_ENGINE_RANGE'});
  assert.deepEqual(electronConfigurationStatus(118),{status:'UNAVAILABLE',reason:'OUTSIDE_ENGINE_RANGE'});
  assert.throws(()=>electronConfiguration(37),/ATOMIC_NUMBER_INVALID/);       // the engine itself is unchanged
  const computed=hub.elements.filter(e=>e.electronConfiguration.status!=='GAP');
  assert.equal(computed.length,34); assert.ok(computed.every(e=>e.z<=36&&e.z!==24&&e.z!==29));
  assert.ok(computed.every(e=>e.electronConfiguration.provenance==='ENGINE_COMPUTED'&&e.electronConfiguration.review==='NOT_REVIEWED'));
});

test('metadata: only sourced entries; missing fields are explicit gaps; no legacy value becomes a fact',()=>{
  const meta=json('content-src/periodic/element-metadata.json');
  assert.deepEqual(meta.entries,{});
  for(const e of hub.elements) for(const f of ['relativeAtomicMass','category','oxidationStates','teachingDescription']) assert.deepEqual(e[f],{status:'GAP',reason:'SOURCE_REQUIRED'});
  assert.ok(!JSON.stringify(hub).includes('22.99')&&!JSON.stringify(hub).includes('Ishqoriy metall'));
  // the contract refuses an entry without a source, an unknown field or a fake symbol
  const base={schema:'kimyolab.element-metadata.v1',entries:{}};
  assert.throws(()=>parseElementMetadata({...base,entries:{Na:{relativeAtomicMass:{value:23,sourceRefs:[],reviewStatus:'pending'}}}}),/source/);
  assert.throws(()=>parseElementMetadata({...base,entries:{Na:{colour:{value:'x',sourceRefs:[{id:'s',title:'t'}],reviewStatus:'pending'}}}}),/field/);
  assert.throws(()=>parseElementMetadata({...base,entries:{Xx:{}}}),/symbol/);
  const ok=parseElementMetadata({...base,entries:{Na:{relativeAtomicMass:{value:23,sourceRefs:[{id:'src.test',title:'Test'}],reviewStatus:'pending'}}}});
  assert.equal(ok.Na.relativeAtomicMass.value,23);
});

test('relations: PARTICIPATES derived with the canonical parser; never promoted to PRIMARY; explicit chains only',()=>{
  // formulaElements is the canonical parser, nothing else
  assert.deepEqual(formulaElements('Ca(OH)2'),Object.keys(parseFormula('Ca(OH)2').atoms).sort());
  assert.equal(formulaElements('etanol'),null);
  const na=el('Na');
  assert.ok(na.relations.substances.length>0);
  assert.ok(na.relations.substances.every(r=>r.kind==='PARTICIPATES'&&r.provenance==='DERIVED_FROM_FORMULA'));
  const species=json('content-src/chemistry/species.json');
  for(const r of na.relations.substances){ const s=species.find(x=>x.id===r.id); assert.ok(Object.keys(parseFormula(s.formula).atoms).includes('Na'),r.id); }
  // nothing is PRIMARY without an authored relation (none is authored)
  assert.ok(hub.elements.every(e=>e.relations.authored.length===0));
  assert.ok(hub.elements.flatMap(e=>[...e.relations.substances,...e.relations.reactions,...e.relations.labs,...e.relations.topics]).every(r=>r.kind==='PARTICIPATES'));
  assert.deepEqual(parseElementRelations(json('content-src/periodic/element-relations.json')),[]);
  assert.throws(()=>parseElementRelations({schema:'kimyolab.element-relations.v1',relations:[{element:'Na',kind:'PRIMARY',target:'lu.8.01',sourceRefs:[]}]}),/relation/);
  // a lab is linked only through a substance on its shelf or a reaction in its step map (via names the evidence)
  for(const l of na.relations.labs){ assert.equal(l.provenance,'EXPLICIT_MAPPING'); assert.ok(l.via.length); assert.ok(l.via.every(v=>na.relations.substances.some(s=>s.id===v)||na.relations.reactions.some(r=>r.id===v)),l.id); }
  const mappings=json('content-src/mapping-links.json');
  for(const t of na.relations.topics) assert.ok(t.via.every(lab=>mappings.some(m=>m.practiceActivityId===lab&&m.learningUnitId===t.id)),t.id);
  // no keyword matching: an element with no canonical record has no relation at all
  assert.deepEqual(el('Og').relations,{substances:[],reactions:[],labs:[],topics:[],authored:[]});
  assert.ok(!/toLowerCase|\.goal\b|learningOutcomes|legacyContent|RegExp\(|\.title\.|synonyms/.test(read('scripts/lib/element-hub.ts')),'relations never read text');
});

test('route, deep link and feature flag: /periodic and /periodic/<symbol>; off by default; off → not found',()=>{
  assert.deepEqual(parseAppRoute('/periodic'),{name:'periodic',symbol:null});
  assert.deepEqual(parseAppRoute('/periodic/Na'),{name:'periodic',symbol:'Na'});
  assert.deepEqual(parseAppRoute('/periodic/Xx'),{name:'periodic',symbol:'Xx'});      // the page shows a notice
  assert.equal(parseAppRoute('/periodic/na').name,'not-found');
  assert.equal(parseAppRoute('/periodic/Na/x').name,'not-found');
  assert.equal(FEATURE_FLAGS.periodicTableV1.default,false);
  assert.equal(isFeatureEnabled('periodicTableV1',new URLSearchParams('')),false);
  assert.equal(isFeatureEnabled('periodicTableV1',new URLSearchParams('ff=periodicTableV1')),true);
  const boot=read('src/app/bootstrap.ts');
  const block=boot.slice(boot.indexOf("route.name==='periodic'"),boot.indexOf('renderNotFound(main);\n}'));
  assert.match(block,/if\(!isFeatureEnabled\('periodicTableV1',active\.searchParams\)\)\{renderNotFound\(main\);return;\}/);
  assert.match(boot,/if\(isFeatureEnabled\('periodicTableV1',active\.searchParams\)\)\{ const \{hub/);
  // portal deep link / refresh: the server serves the app shell for both route forms
  const server=read('server/app.mjs');
  assert.match(server,/SPA_EXACT = new Set\(\[[^\]]*'\/periodic'/); assert.match(server,/SPA_PREFIXES = \[[^\]]*'\/periodic\/'/);
  // the legacy page stays, and the V20 feature has no runtime dependency on it
  assert.ok(fs.existsSync(path.join(root,'periodic.html')));
  for(const f of ['src/features/periodic/render.ts','src/features/periodic/model.ts','src/features/periodic/hub.ts','src/app/bootstrap.ts']) assert.ok(!/periodic\.html|data\/elements\.json|js\/periodic/.test(read(f)),f);
});

test('isolation: no other learner feature imports the periodic feature; no progress, no Studio editor',()=>{
  const walk=(d)=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
  const users=[...walk('src'),...walk('scripts')].filter(f=>/\.ts$/.test(f)&&!f.startsWith('src/features/periodic/')&&/from '[^']*features\/periodic\//.test(read(f)));
  assert.deepEqual(users.sort(),['scripts/build-content-pack.ts','scripts/lib/element-hub.ts','scripts/periodic-table.ts','src/app/bootstrap.ts','src/app/content-client.ts']);
  for(const f of ['src/features/periodic/render.ts','src/features/periodic/model.ts']) assert.ok(!/progress|indexedDB|localStorage|attempt|evidence/i.test(read(f).replace(/\/\/.*$/gm,'')),f);
  assert.ok(!/periodic|element-hub/i.test(walk('src/studio').map(read).join('\n')),'no element editor in the Content Studio');
});

test('filters and search: derived from the hub; elements match by Z, symbol and name in the one search',()=>{
  const g17=hub.elements.filter(e=>matchesFilters(hub,e,{...NO_FILTERS,group:17}));
  assert.deepEqual(g17.map(e=>e.symbol),['F','Cl','Br','I','At','Ts']);
  const withLab=hub.elements.filter(e=>matchesFilters(hub,e,{...NO_FILTERS,hasLab:true}));
  assert.ok(withLab.length>0&&withLab.every(e=>e.relations.labs.length));
  const grade8=hub.elements.filter(e=>matchesFilters(hub,e,{...NO_FILTERS,grade:8}));
  assert.ok(grade8.length>0&&grade8.every(e=>elementGrades(hub,e).includes(8)));
  assert.deepEqual(availableCategories(hub),[]);
  const names=json('content-src/locales/uz-latn/chemistry-elements.json').names;
  const index=[{kind:'topic',title:'Alanga tuzilishi va moddalarning kislorodda yonishi',description:'11-sinf',href:'/learn/x',searchText:''},...elementSearchEntries(hub,s=>names[s]??null,{kicker:'Element',description:z=>`Atom raqami ${z}`},'?ff=periodicTableV1')];
  assert.equal(searchStudentContent('11',index)[0].href,'/periodic/Na?ff=periodicTableV1');
  assert.equal(searchStudentContent('Na',index)[0].href,'/periodic/Na?ff=periodicTableV1');
  assert.equal(searchStudentContent('kislorod',index)[0].href,'/periodic/O?ff=periodicTableV1');
  assert.equal(searchStudentContent('26',index)[0].href,'/periodic/Fe?ff=periodicTableV1');
  assert.equal(searchStudentContent('Fe',index)[0].title,'Fe');
  // a word that is not an element name never brings element results
  assert.ok(!searchStudentContent('alanga',index).some(r=>r.kind==='element'));
});

test('learner UI text: every periodic string is a catalog key; missing data has a natural Uzbek sentence',()=>{
  const labels=json('content-src/locales/uz-latn/learner-interaction.json').labels;
  const render=read('src/features/periodic/render.ts');
  const used=[...new Set([...render.matchAll(/'(ui\.periodic-[a-z-]+)'/g)].map(m=>m[1]))];
  for(const k of used) assert.ok(k in labels,k);
  assert.equal(labels['ui.periodic-missing'],'Bu ma’lumot hali tasdiqlangan manbada mavjud emas.');
  for(const [k,v] of Object.entries(labels).filter(([k])=>k.startsWith('ui.periodic-'))) assert.ok(!/SOURCE_REQUIRED|GAP|DERIVED|ENGINE|[A-Z]{3,}_[A-Z]{3,}|null|undefined/.test(v),k);
  assert.ok(!/['"`][^'"`\n]*[‘’ʻ][^'"`\n]*['"`]/.test(render),'no hard-coded Uzbek literal in the renderer');
});

test('reports: generator-equal; coverage dimensions separate; statuses from the fixed vocabulary; metrics unchanged',()=>{
  const out=periodicOutputs(root);
  for(const [rel,body] of Object.entries(out)) assert.equal(read(rel),body,rel);
  assert.deepEqual(Object.keys(out).sort(),Object.values(PERIODIC_REPORTS).sort());
  const r=JSON.parse(out[PERIODIC_REPORTS.readiness]);
  assert.equal(r.identity.elements,118); assert.equal(r.coverage.canonicalIdentity,118);
  assert.equal(r.coverage.localizedNames,20); assert.equal(r.coverage.reviewedLocalizedNames,0); assert.equal(r.coverage.metadataReviewed,0);
  assert.ok(!('percent' in r.coverage)&&!JSON.stringify(r.coverage).includes('%'),'no merged percentage');
  assert.deepEqual([r.formalMetrics.learningProduct,r.formalMetrics.overall],[12.189,47.313]);
  const parity=JSON.parse(out[PERIODIC_REPORTS.parity]);
  assert.deepEqual(parity.statuses,[...LEGACY_STATUSES]);
  for(const f of Object.values(parity.fieldStatus).filter(v=>typeof v==='object')) assert.deepEqual(Object.keys(f),[...LEGACY_STATUSES]);
  const inv=JSON.parse(out[PERIODIC_REPORTS.inventory]);
  assert.ok(inv.legacy.every(x=>['AUDITED','NOT_USED'].includes(x.status)));
});
