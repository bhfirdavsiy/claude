// P2.13 — periodic table + Element Hub (ADR-P2-014): one identity source, derived positions with display ≠ period,
// honest gaps (names, metadata, electron configuration), evidence-derived relations, the flagged route, the shared
// search, feature isolation and the six reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ELEMENT_SYMBOLS} from '../src/domain/chemistry/periodic-table.ts';
import {displayPosition,isFBlock,layoutColumn,layoutRow,LAYOUT_RULE} from '../src/domain/chemistry/periodic-layout.ts';
import {electronConfiguration,electronConfigurationStatus} from '../src/domain/chemistry/electron-configuration.ts';
import {parseFormula} from '../src/domain/chemistry/formula-parser.ts';
import {buildElementHub,formulaElements,PERIOD_GROUP_ASSERTION_ID} from '../scripts/lib/element-hub.ts';
import {elementAssertion,effectiveReview,parseElementMetadata,parseElementRelations,parseElementReviews,scientificState,validateElementReview} from '../scripts/lib/element-governance.ts';
import {parseSourceRegistry} from '../src/domain/governance/source-policy.ts';
import {assertElementHub} from '../src/features/periodic/hub.ts';
import {elementSearchEntries,matchesFilters,NO_FILTERS,elementGrades,availableCategories,availableGroups,availablePeriods} from '../src/features/periodic/model.ts';
import {searchStudentContent} from '../src/features/search/model.ts';
import {parseAppRoute} from '../src/app/routes.ts';
import {FEATURE_FLAGS,isFeatureEnabled} from '../src/app/feature-flags.ts';
import {legacyParity,periodicOutputs,PERIODIC_REPORTS,LEGACY_STATUSES} from '../scripts/periodic-table.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
const json=(rel)=>JSON.parse(read(rel));
const {hub}=buildElementHub(root);
const el=(s)=>hub.elements.find(e=>e.symbol===s);
const REG=parseSourceRegistry(json('content-src/source-registry.json')).registry;
// TEST-ONLY fixtures (never repository content): a registry with one eligible and one ineligible source, and a human
// decision — used to exercise the governance mechanics, not to claim anything about real chemistry
const H=(c)=>c.repeat(64);
const FIX_REGISTRY={schema:'kimyolab.source-registry.v1',sources:[...json('content-src/source-registry.json').sources,
  {id:'src.test.accepted',category:'AUTHORITATIVE_REFERENCE',title:'Test fixture reference',classification:'HUMAN_ACCEPTED',acceptedBy:'Test Reviewer',acceptedAt:'2026-01-01T00:00:00.000Z',reviewedHash:H('a')},
  {id:'src.test.proposal',category:'INTERNAL_PROPOSAL',title:'Test fixture proposal',classification:'PROPOSED'}]};
const FIX_REG=parseSourceRegistry(FIX_REGISTRY).registry;
const META=(entries,ruleRefs=[])=>({schema:'kimyolab.element-metadata.v1',rules:{periodGroup:{sourceRefs:ruleRefs}},entries});
const DECISION=(a,over={})=>({assertionId:a.id,assertionHash:a.hash,decision:'approve',reviewerId:'Test Kimyogar',reviewerRole:a.requiredRole,reviewedAt:'2026-02-01T00:00:00.000Z',...over});
const REVIEWS=(records)=>({schema:'kimyolab.element-reviews.v1',records});

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

// P2.13 closeout changed this test: period and group are scientific claims, not identity derivations. The layout rule
// still places every cell (display layout), but the learner fields stay gaps until a reviewed source backs the rule.
test('layout: the rule places cells only; display row is never a period; period/group are not shown without review',()=>{
  assert.deepEqual([1,2,3,10,11,18,19,36,37,54,55,86,87,118].map(layoutRow),[1,1,2,2,3,3,4,4,5,5,6,6,7,7]);
  assert.deepEqual([1,2,5,10,13,18,21,30,72,80,86,104,118].map(layoutColumn),[1,18,13,18,13,18,3,12,4,12,18,4,18]);
  for(const z of [57,63,71,89,95,103]){ assert.equal(isFBlock(z),true); assert.equal(layoutColumn(z),null); }
  const la=displayPosition(57), ac=displayPosition(89);
  assert.deepEqual([la.row,la.column,layoutRow(57)],[9,3,6]);
  assert.deepEqual([ac.row,ac.column,layoutRow(89)],[10,3,7]);
  assert.equal(new Set(hub.elements.map(e=>`${e.display.row}:${e.display.column}`)).size,118);
  for(const e of hub.elements){ assert.deepEqual(e.period,{status:'GAP',reason:'SOURCE_REQUIRED'}); assert.deepEqual(e.group,{status:'GAP',reason:'SOURCE_REQUIRED'}); }
  // legacy f-block "period" 8 / 9 is a display row; agreement with the unreviewed rule is UNREVIEWED_MATCH, never canonical
  const parity=legacyParity(root);
  const ce=parity.rows.find(r=>r.symbol==='Ce'), na=parity.rows.find(r=>r.symbol==='Na');
  assert.equal(ce.period,'DISPLAY_ONLY'); assert.equal(ce.legacyPeriod,8); assert.equal(ce.layoutRow,6);
  assert.equal(na.period,'UNREVIEWED_MATCH'); assert.equal(na.group,'UNREVIEWED_MATCH');
  assert.equal(parity.summary.period.CANONICAL_MATCH,0); assert.equal(parity.summary.group.CANONICAL_MATCH,0);
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
  // P2.13 closeout: the locale catalog is pending review, so a matching legacy name is UNREVIEWED_MATCH, not canonical
  assert.deepEqual([p.CANONICAL_MATCH,p.UNREVIEWED_MATCH,p.SOURCE_REQUIRED,p.CONFLICT],[0,20,98,0]);
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
  // P2.13 closeout: an engine result is its own status (COMPUTED), never a reviewed claim
  assert.ok(computed.every(e=>e.electronConfiguration.status==='COMPUTED'&&e.electronConfiguration.provenance==='ENGINE_COMPUTED'));
});

// P2.13 closeout changed this test: a metadata entry carries {value, sourceRefs} only — registry ids, no title, no
// review field; the review state comes from the decision register.
test('metadata: registry ids only; no review field; missing fields are explicit gaps; no legacy value becomes a fact',()=>{
  const meta=json('content-src/periodic/element-metadata.json');
  assert.deepEqual(meta.entries,{}); assert.deepEqual(meta.rules,{periodGroup:{sourceRefs:[]}});
  for(const e of hub.elements) for(const f of ['relativeAtomicMass','category','oxidationStates','teachingDescription']) assert.deepEqual(e[f],{status:'GAP',reason:'SOURCE_REQUIRED'});
  assert.ok(!JSON.stringify(hub).includes('22.99')&&!JSON.stringify(hub).includes('Ishqoriy metall'));
  const base={schema:'kimyolab.element-metadata.v1',rules:{periodGroup:{sourceRefs:[]}},entries:{}};
  assert.throws(()=>parseElementMetadata({...base,entries:{Na:{colour:{value:'x',sourceRefs:[]}}}},REG),/field/);
  assert.throws(()=>parseElementMetadata({...base,entries:{Xx:{}}},REG),/symbol/);
  assert.throws(()=>parseElementMetadata({...base,rules:{}},REG),/periodGroup/);
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
  // (P2.13 closeout: the relation contract moved to element-governance and is tested below)
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
  // P2.13 closeout changed this assertion: group / period filters work on reviewed values only, so with no reviewed
  // source there is nothing to filter by (the controls are disabled with a note); a group filter matches nothing
  assert.deepEqual(availableGroups(hub),[]); assert.deepEqual(availablePeriods(hub),[]);
  assert.deepEqual(hub.elements.filter(e=>matchesFilters(hub,e,{...NO_FILTERS,group:17})),[]);
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
  assert.equal(r.coverage.localizedNames,20); assert.equal(r.coverage.reviewedLocalizedNames,0); assert.equal(r.coverage.effectiveHumanReviewedMetadata,0); assert.equal(r.coverage.humanReviewedAuthoredRelations,0);
  assert.ok(!('percent' in r.coverage)&&!JSON.stringify(r.coverage).includes('%'),'no merged percentage');
  assert.deepEqual([r.formalMetrics.learningProduct,r.formalMetrics.overall],[12.189,47.313]);
  const parity=JSON.parse(out[PERIODIC_REPORTS.parity]);
  assert.deepEqual(parity.statuses,[...LEGACY_STATUSES]);
  for(const f of Object.values(parity.fieldStatus).filter(v=>typeof v==='object')) assert.deepEqual(Object.keys(f),[...LEGACY_STATUSES]);
  const inv=JSON.parse(out[PERIODIC_REPORTS.inventory]);
  assert.ok(inv.legacy.every(x=>['AUDITED','NOT_USED'].includes(x.status)));
});

test('closeout 1: the period/group rule is never reviewed because code labels it derived; only source + human decision',()=>{
  const rule=elementAssertion(PERIOD_GROUP_ASSERTION_ID,'periodic-layout-rule',LAYOUT_RULE,[]);
  assert.equal(scientificState(rule,REG,[]).state,'SOURCE_REQUIRED');
  const gov=buildElementHub(root).governance.periodGroupRule;
  assert.equal(gov.state,'SOURCE_REQUIRED'); assert.equal(gov.hash,rule.hash);
  // an eligible source without a decision → still not reviewed; the learner field stays a gap
  const sourced=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META({},['src.test.accepted'])});
  assert.equal(sourced.governance.periodGroupRule.state,'REVIEW_PENDING');
  assert.deepEqual(sourced.hub.elements[10].period,{status:'GAP',reason:'REVIEW_PENDING'});
  // only a human approval on the rule's exact hash makes period / group visible (fixture only)
  const r2=elementAssertion(PERIOD_GROUP_ASSERTION_ID,'periodic-layout-rule',LAYOUT_RULE,['src.test.accepted']);
  const approved=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META({},['src.test.accepted']),reviews:REVIEWS([DECISION(r2)])});
  assert.deepEqual(approved.hub.elements[10].period,{status:'REVIEWED',value:3,sources:[{id:'src.test.accepted',title:'Test fixture reference'}]});
  assert.deepEqual(approved.hub.elements.find(e=>e.symbol==='La').group,{status:'GAP',reason:'F_BLOCK_GROUP_CONVENTION'});
  // an ineligible (INTERNAL_PROPOSAL) source never unlocks it, even with a decision
  const r3=elementAssertion(PERIOD_GROUP_ASSERTION_ID,'periodic-layout-rule',LAYOUT_RULE,['src.test.proposal']);
  const weak=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META({},['src.test.proposal']),reviews:REVIEWS([DECISION(r3)])});
  assert.deepEqual(weak.hub.elements[10].period,{status:'GAP',reason:'SOURCE_NOT_ELIGIBLE'});
});

test('closeout 2–4: no self-approval from the record; edited claims go stale; automation cannot approve',()=>{
  // 2. a record field cannot approve: `reviewStatus` is refused outright
  assert.throws(()=>parseElementMetadata(META({Na:{relativeAtomicMass:{value:23,sourceRefs:['src.test.accepted'],reviewStatus:'approved'}}}),FIX_REG),/field-not-allowed.*reviewStatus/);
  const meta={Na:{relativeAtomicMass:{value:23,sourceRefs:['src.test.accepted']}}};
  const a=elementAssertion('metadata.Na.relativeAtomicMass','element-metadata',{symbol:'Na',field:'relativeAtomicMass',value:23},['src.test.accepted']);
  const pending=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META(meta)});
  assert.deepEqual(pending.hub.elements[10].relativeAtomicMass,{status:'GAP',reason:'REVIEW_PENDING'});
  const ok=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META(meta),reviews:REVIEWS([DECISION(a)])});
  assert.equal(ok.hub.elements[10].relativeAtomicMass.status,'REVIEWED');
  // 3. editing the approved assertion (value) makes the decision stale → not shown
  const edited=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META({Na:{relativeAtomicMass:{value:24,sourceRefs:['src.test.accepted']}}}),reviews:REVIEWS([DECISION(a)])});
  assert.deepEqual(edited.hub.elements[10].relativeAtomicMass,{status:'GAP',reason:'REVIEW_PENDING'});
  assert.equal(edited.governance.metadata[0].review,'stale');
  assert.equal(effectiveReview({...a,hash:H('b')},[DECISION(a)]).state,'stale');
  // 4. automation identities and wrong roles cannot decide; extra fields are refused
  for(const who of ['claude','kimyolab-bot','github-actions','ci','automation']) assert.ok(validateElementReview(DECISION(a,{reviewerId:who})).some(i=>i.startsWith('ELEMENT_REVIEW_REVIEWER_NOT_HUMAN')),who);
  assert.throws(()=>parseElementReviews(REVIEWS([DECISION(a,{reviewerId:'claude'})])),/NOT_HUMAN/);
  assert.ok(validateElementReview(DECISION(a,{status:'approved'})).some(i=>i.includes('FIELD_NOT_ALLOWED')));
  assert.equal(effectiveReview(a,[DECISION(a,{reviewerRole:'didactic'})]).state,'pending','a didactic decision does not review a chemistry claim');
});

test('closeout 5–6: source references resolve to the registry; a title cannot create a parallel authority',()=>{
  // 5. unknown id → refused (build fails); never SOURCED
  assert.throws(()=>parseElementMetadata(META({Na:{category:{value:'x',sourceRefs:['src.made.up']}}}),REG),/ELEMENT_SOURCE_UNREGISTERED:src.made.up/);
  assert.throws(()=>parseElementMetadata(META({},['src.made.up']),REG),/UNREGISTERED/);
  // 6. an object reference with its own title is not accepted; the shown title is the registry's
  assert.throws(()=>parseElementMetadata(META({Na:{category:{value:'x',sourceRefs:[{id:'src.test.accepted',title:'IUPAC'}]}}}),FIX_REG),/sourceRefs/);
  assert.throws(()=>parseElementMetadata(META({Na:{category:{value:'x',sourceRefs:['src.test.accepted'],title:'IUPAC'}}}),FIX_REG),/field-not-allowed/);
  const a=elementAssertion('metadata.Na.category','element-metadata',{symbol:'Na',field:'category',value:'x'},['src.test.accepted']);
  const r=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,metadata:META({Na:{category:{value:'x',sourceRefs:['src.test.accepted']}}}),reviews:REVIEWS([DECISION(a)])});
  assert.deepEqual(r.hub.elements[10].category.sources,[{id:'src.test.accepted',title:'Test fixture reference'}]);
  // the real registry has no eligible source today: nothing can be reviewed scientific truth
  assert.ok([...REG.byId.values()].every(e=>e.classification!=='HUMAN_ACCEPTED'));
});

test('closeout 7–9: authored relations need a typed, existing target; unreviewed PRIMARY is not shown or counted',()=>{
  const T={SUBSTANCE:new Set(['species.nacl']),REACTION:new Set(['rxn.agno3-nacl']),TOPIC:new Set(['lu.8.01']),LAB:new Set(['practice.experiment.8.1'])};
  const R=(rel)=>({schema:'kimyolab.element-relations.v1',relations:[rel]});
  // 7. target type is mandatory and closed
  assert.throws(()=>parseElementRelations(R({element:'Na',kind:'PRIMARY',targetId:'lu.8.01',sourceRefs:[]}),T,REG),/targetType/);
  assert.throws(()=>parseElementRelations(R({element:'Na',kind:'PRIMARY',targetType:'CONCEPT',targetId:'lu.8.01',sourceRefs:[]}),T,REG),/targetType/);
  assert.throws(()=>parseElementRelations(R({element:'Na',kind:'PRIMARY',target:'lu.8.01',sourceRefs:[]}),T,REG),/field-not-allowed/);
  // 8. the target must exist in that registry (a topic id is not a substance)
  assert.throws(()=>parseElementRelations(R({element:'Na',kind:'PRIMARY',targetType:'TOPIC',targetId:'lu.99.99',sourceRefs:[]}),T,REG),/target:/);
  assert.throws(()=>parseElementRelations(R({element:'Na',kind:'PRIMARY',targetType:'SUBSTANCE',targetId:'lu.8.01',sourceRefs:[]}),T,REG),/target:/);
  assert.equal(parseElementRelations(R({element:'Na',kind:'PRIMARY',targetType:'TOPIC',targetId:'lu.8.01',sourceRefs:[]}),T,REG).length,1);
  // 9. a sourced authored PRIMARY without a human decision is neither shown nor counted as reviewed
  const rel={element:'Na',kind:'PRIMARY',targetType:'SUBSTANCE',targetId:'species.nacl',sourceRefs:['src.test.accepted']};
  const unrev=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,relations:R(rel)});
  assert.deepEqual(unrev.hub.elements[10].relations.authored,[]);
  assert.equal(unrev.governance.relations[0].state,'REVIEW_PENDING');
  // with a chemistry decision on its exact hash it reaches the learner; a didactic decision does not count for a substance
  const a=elementAssertion('relation.Na.PRIMARY.SUBSTANCE.species.nacl','element-relation',{element:'Na',kind:'PRIMARY',targetType:'SUBSTANCE',targetId:'species.nacl'},['src.test.accepted'],'chemistry');
  assert.deepEqual(buildElementHub(root,{sourceRegistry:FIX_REGISTRY,relations:R(rel),reviews:REVIEWS([DECISION(a,{reviewerRole:'didactic'})])}).hub.elements[10].relations.authored,[]);
  const ok=buildElementHub(root,{sourceRegistry:FIX_REGISTRY,relations:R(rel),reviews:REVIEWS([DECISION(a)])});
  assert.deepEqual(ok.hub.elements[10].relations.authored,[{id:'species.nacl',kind:'PRIMARY',provenance:'AUTHORED_RELATION',via:[],targetType:'SUBSTANCE'}]);
});

test('closeout 10–13: the repository state fabricates nothing; identity, e-config and PARTICIPATES do not regress',()=>{
  // 10. empty metadata / relations / register → no approval anywhere
  assert.deepEqual(json('content-src/periodic/element-reviews.json').records,[]);
  assert.deepEqual(json('content-src/periodic/element-relations.json').relations,[]);
  const {hub:h,governance:g}=buildElementHub(root);
  assert.equal(g.metadata.length,0); assert.equal(g.relations.length,0); assert.equal(g.periodGroupRule.state,'SOURCE_REQUIRED');
  assert.ok(h.elements.every(e=>Object.values(e).every(v=>!(v&&typeof v==='object'&&v.status==='REVIEWED'))));
  // 11. identity
  assert.equal(h.elements.length,118); assert.deepEqual(h.elements.map(e=>e.symbol),[...ELEMENT_SYMBOLS]);
  // 12. electron configuration: 34 computed, Z 24 / 29 known gaps, nothing beyond 36
  const computed=h.elements.filter(e=>e.electronConfiguration.status==='COMPUTED');
  assert.equal(computed.length,34);
  assert.deepEqual([24,29].map(z=>h.elements[z-1].electronConfiguration),[{status:'GAP',reason:'ENGINE_KNOWN_GAP'},{status:'GAP',reason:'ENGINE_KNOWN_GAP'}]);
  assert.ok(h.elements.slice(36).every(e=>e.electronConfiguration.status==='GAP'));
  // 13. formula-derived participation and explicit chains unchanged
  const rel=JSON.parse(periodicOutputs(root)[PERIODIC_REPORTS.relationships]);
  assert.deepEqual([rel.formulaDerived,rel.explicit,rel.elementsWith.substances,rel.elementsWith.labs],[261,154,19,16]);
});
