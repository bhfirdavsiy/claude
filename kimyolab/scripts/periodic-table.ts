// P2.13 — periodic table + Element Hub reports (ADR-P2-014). Deterministic; every coverage dimension is reported
// separately and is never merged into one percentage.
//   npm run periodic:report            → the six reports below
//   npm run periodic:report -- --check → fails when a committed report differs from the generator
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ELEMENT_SYMBOLS} from '../src/domain/chemistry/periodic-table.ts';
import {chemicalPeriod,displayPosition,groupNumber,isFBlock} from '../src/domain/chemistry/periodic-layout.ts';
import {ELECTRON_CONFIGURATION_KNOWN_GAPS,ELECTRON_CONFIGURATION_RANGE} from '../src/domain/chemistry/electron-configuration.ts';
import {buildElementHub,METADATA_FIELDS} from './lib/element-hub.ts';
import {bundle} from './lib/computed-model-interaction.ts';
import {bundleDelta} from './guided-dynamic-lab.ts';
import {FEATURE_FLAGS} from '../src/app/feature-flags.ts';
import type {HubElement,HubField} from '../src/features/periodic/hub.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export const PERIODIC_REPORTS={
  inventory:'reports/periodic-table-inventory.json',
  metadata:'reports/element-metadata-coverage.json',
  localization:'reports/element-localization-coverage.json',
  relationships:'reports/element-relationship-coverage.json',
  parity:'reports/legacy-periodic-parity.json',
  readiness:'reports/periodic-table-readiness.json',
};
export const LEGACY_STATUSES=['CANONICAL_MATCH','DISPLAY_ONLY','SOURCE_REQUIRED','CONFLICT','NOT_USED'] as const;
type LegacyStatus=typeof LEGACY_STATUSES[number];
const BASE={phase:'P2.13',decision:'NOT_A_RELEASE_OR_PILOT_DECISION'};

/** Legacy V19 data/elements.json, field by field, against the canonical identity, the derived layout and the locale.
 *  A legacy value is never taken over: it either matches what the repository proves, is a display position only, has
 *  no source in the repository, or contradicts the canonical value. */
export function legacyParity(root:string){
  const legacy=readJson(root,'data/elements.json') as Array<{z:number;sym:string;name:string;group:number|null;period:number;category:string;mass:number}>;
  const names=readJson(root,'content-src/locales/uz-latn/chemistry-elements.json').names as Record<string,string>;
  const rows=legacy.map(e=>{
    const z=e.z, canonical=ELEMENT_SYMBOLS[z-1];
    const identity:LegacyStatus=canonical===e.sym?'CANONICAL_MATCH':'CONFLICT';
    const name:LegacyStatus=!(e.sym in names)?'SOURCE_REQUIRED':names[e.sym]===e.name?'CANONICAL_MATCH':'CONFLICT';
    const f=isFBlock(z), pos=displayPosition(z);
    // the legacy page draws Z 57–71 / 89–103 in rows 9 / 10; their legacy "period" 8 / 9 is a display row, not a period
    const period:LegacyStatus=e.period===chemicalPeriod(z)?'CANONICAL_MATCH':f&&e.period!==chemicalPeriod(z)?'DISPLAY_ONLY':'CONFLICT';
    const g=groupNumber(z);
    // f-block: the legacy "group" equals the display column (or 3 for La / Ac); no group number is assigned canonically
    const group:LegacyStatus=f?(e.group===pos.column&&e.group!==3?'DISPLAY_ONLY':'SOURCE_REQUIRED'):e.group===g?'CANONICAL_MATCH':'CONFLICT';
    return {z,symbol:e.sym,identity,name,period,group,mass:'SOURCE_REQUIRED' as LegacyStatus,category:'SOURCE_REQUIRED' as LegacyStatus,
      ...(period!=='CANONICAL_MATCH'?{legacyPeriod:e.period,chemicalPeriod:chemicalPeriod(z)}:{}),...(group!=='CANONICAL_MATCH'?{legacyGroup:e.group,canonicalGroup:g}:{}),
      ...(name==='CONFLICT'?{legacyName:e.name,localeName:names[e.sym]}:{})};
  });
  const count=(field:'identity'|'name'|'period'|'group'|'mass'|'category')=>Object.fromEntries(LEGACY_STATUSES.map(s=>[s,rows.filter(r=>r[field]===s).length]));
  // layout: where the legacy script draws each cell (js/periodic.js) vs the V20 display position
  const legacyPos=(e:{z:number;group:number|null;period:number})=>e.z>=57&&e.z<=71?{row:9,column:e.z-54}:e.z>=89&&e.z<=103?{row:10,column:e.z-86}:{row:e.period,column:e.group||3};
  const layoutDiff=legacy.map(e=>({z:e.z,legacy:legacyPos(e),v20:(({row,column})=>({row,column}))(displayPosition(e.z))})).filter(d=>d.legacy.row!==d.v20.row||d.legacy.column!==d.v20.column);
  return {legacy,rows,summary:{elements:legacy.length,identity:count('identity'),name:count('name'),period:count('period'),group:count('group'),mass:count('mass'),category:count('category')},layoutDiff};
}

const fieldStats=(els:HubElement[],get:(e:HubElement)=>HubField<unknown>)=>{
  const fs_=els.map(get);
  const gaps=fs_.filter(f=>f.status==='GAP') as Array<{status:'GAP';reason:string}>;
  return {sourced:fs_.filter(f=>f.status==='SOURCED').length,derived:fs_.filter(f=>f.status==='DERIVED').length,reviewed:fs_.filter(f=>f.status==='SOURCED'&&f.review==='approved').length,gap:gaps.length,
    gapReasons:Object.fromEntries([...new Set(gaps.map(g=>g.reason))].sort().map(r=>[r,gaps.filter(g=>g.reason===r).length]))};
};

export function periodicOutputs(root=ROOT):Record<string,string>{
  const {hub,stats}=buildElementHub(root);
  const els=hub.elements;
  const names=readJson(root,'content-src/locales/uz-latn/chemistry-elements.json');
  const parity=legacyParity(root);
  const put=(v:unknown)=>`${JSON.stringify(v,null,2)}\n`;
  const identity={canonicalSource:'src/domain/chemistry/periodic-table.ts (ELEMENT_SYMBOLS)',elements:els.length,atomicNumbers:{min:els[0]!.z,max:els.at(-1)!.z,contiguous:els.every((e,i)=>e.z===i+1)},symbolsEqualCanonical:els.every((e,i)=>e.symbol===ELEMENT_SYMBOLS[i]),duplicateZ:els.length-new Set(els.map(e=>e.z)).size,duplicateSymbols:els.length-new Set(els.map(e=>e.symbol)).size};

  const inventory={schema:'kimyolab.periodic-table-inventory.v1',...BASE,
    semantics:'Every source the periodic table and Element Hub read, and what each is used for. Legacy V19 files are audited, never used as truth.',
    canonical:[
      {source:'src/domain/chemistry/periodic-table.ts',role:'element identity (Z, symbol) — the only element list',status:'CANONICAL'},
      {source:'src/domain/chemistry/periodic-layout.ts',role:'chemical period, IUPAC group (s/p/d), display position — derived from Z; f-block group left open',status:'DERIVED'},
      {source:'src/domain/chemistry/electron-configuration.ts',role:`electron configuration — engine range Z ${ELECTRON_CONFIGURATION_RANGE.min}–${ELECTRON_CONFIGURATION_RANGE.max}, known gaps Z ${ELECTRON_CONFIGURATION_KNOWN_GAPS.join(', ')} not shown`,status:'DERIVED'},
      {source:'src/domain/chemistry/formula-parser.ts',role:'elements of canonical species / reaction formulas (relations)',status:'CANONICAL'},
      {source:'content-src/locales/uz-latn/chemistry-elements.json',role:'localized element names (review pending)',status:'CANONICAL'},
      {source:'content-src/periodic/element-metadata.json',role:'sourced metadata (mass, category, oxidation states, teaching description)',status:'CANONICAL',entries:Object.keys(readJson(root,'content-src/periodic/element-metadata.json').entries).length},
      {source:'content-src/periodic/element-relations.json',role:'authored PRIMARY / RELATED relations',status:'CANONICAL',relations:readJson(root,'content-src/periodic/element-relations.json').relations.length},
      {source:'content-src/chemistry/species.json, reactions.json, guided-step-reaction-map.json, topic-lab-profiles.json (compiled), mapping-links.json, learning-units.json',role:'relationship evidence',status:'CANONICAL'},
    ],
    legacy:[
      {source:'data/elements.json',role:'V19 element data (118 rows: z, sym, name, group, period, category, mass)',status:'AUDITED',detail:'field statuses in reports/legacy-periodic-parity.json; no value is copied into canonical content'},
      {source:'periodic.html',role:'V19 page (Bootstrap modal)',status:'NOT_USED',detail:'kept as the legacy fallback; the V20 route has no runtime dependency on it'},
      {source:'js/periodic.js',role:'V19 script (grid placement, category → CSS class)',status:'NOT_USED',detail:'its category → colour mapping is not carried over: V20 shows no category colour while no category is sourced'},
    ],
    identity,
    pack:{file:'periodic/element-hub.json',schema:hub.schema,builtBy:'scripts/lib/element-hub.ts (npm run content:pack)'},
  };

  const metadata={schema:'kimyolab.element-metadata-coverage.v1',...BASE,
    semantics:'Per metadata field, out of 118 canonical elements: sourced (authored with a source), derived (rule from Z or a domain engine, not reviewed), reviewed (sourced and approved by a human), gap (with the reason). Never merged into one number.',
    metadataSchema:hub.metadataSchema,authoredFields:METADATA_FIELDS,
    fields:{
      chemicalPeriod:fieldStats(els,e=>e.period),
      group:fieldStats(els,e=>e.group),
      relativeAtomicMass:fieldStats(els,e=>e.relativeAtomicMass),
      category:fieldStats(els,e=>e.category),
      electronConfiguration:fieldStats(els,e=>e.electronConfiguration),
      oxidationStates:fieldStats(els,e=>e.oxidationStates),
      teachingDescription:fieldStats(els,e=>e.teachingDescription),
    },
    electronConfiguration:{engineRange:ELECTRON_CONFIGURATION_RANGE,knownGaps:ELECTRON_CONFIGURATION_KNOWN_GAPS,knownGapSource:'scripts/lib/computed-model-interaction.ts (P2.6 MODEL_KNOWN_GAP: no exception records)',extendedTo118:false,note:'the engine was not extended in P2.13; outside its range the profile says the configuration is not available'},
    sourceGaps:{relativeAtomicMass:'no repository source; legacy data/elements.json masses have no provenance (SOURCE_REQUIRED)',category:'no repository source; legacy categories have no provenance (SOURCE_REQUIRED)',oxidationStates:'no element-level source (species oxidationStates arrays are empty)',teachingDescription:'no authored descriptions',fBlockGroup:'which of La/Lu (Ac/Lr) is group 3 needs a reviewed convention'},
    reviewedMetadata:0,
  };

  const named=ELEMENT_SYMBOLS.filter(s=>s in names.names);
  const localization={schema:'kimyolab.element-localization-coverage.v1',...BASE,
    semantics:'Three separate counts: canonical identity, localized names, reviewed localized names. A missing name is shown as the symbol; no name is made up and none is copied from legacy data.',
    locale:names.locale,catalog:'content-src/locales/uz-latn/chemistry-elements.json',catalogReviewStatus:names.reviewStatus,
    canonicalIdentity:identity.elements,localizedNames:named.length,reviewedLocalizedNames:names.reviewStatus==='approved'?named.length:0,
    missingNames:ELEMENT_SYMBOLS.filter(s=>!(s in names.names)),
    legacyNames:{present:parity.summary.elements,copied:0,...parity.summary.name},
    learnerUi:{catalog:'content-src/locales/uz-latn/learner-interaction.json',keys:Object.keys(readJson(root,'content-src/locales/uz-latn/learner-interaction.json').labels).filter(k=>k.startsWith('ui.periodic-')).length},
  };

  const has=(k:'substances'|'reactions'|'labs'|'topics')=>els.filter(e=>e.relations[k].length).length;
  const prov=new Map<string,number>(); for(const e of els) for(const k of ['substances','reactions','labs','topics','authored'] as const) for(const r of e.relations[k]) prov.set(`${k}:${r.kind}:${r.provenance}`,(prov.get(`${k}:${r.kind}:${r.provenance}`)??0)+1);
  const relationships={schema:'kimyolab.element-relationship-coverage.v1',...BASE,
    semantics:'Element → Substance → Reaction → Lab → Topic, only from canonical records: formula-derived PARTICIPATES (formula parser), explicit mappings (lab profile shelf, guided-step reaction map, mapping links) and authored relations. No keyword matching, no inference. PARTICIPATES is never promoted to PRIMARY.',
    elementsWith:{substances:has('substances'),reactions:has('reactions'),labs:has('labs'),topics:has('topics'),primary:els.filter(e=>e.relations.authored.some(r=>r.kind==='PRIMARY')).length},
    totals:{substances:hub.substances.length,reactions:hub.reactions.length,labs:hub.labs.length,topics:hub.topics.length},
    formulaDerived:[...prov].filter(([k])=>k.includes('DERIVED_FROM_FORMULA')).reduce((n,[,v])=>n+v,0),
    explicit:[...prov].filter(([k])=>k.includes('EXPLICIT_MAPPING')).reduce((n,[,v])=>n+v,0),
    authored:[...prov].filter(([k])=>k.includes('AUTHORED_RELATION')).reduce((n,[,v])=>n+v,0),
    byKindAndProvenance:Object.fromEntries([...prov].sort(([a],[b])=>a.localeCompare(b))),
    gradesCovered:[...new Set(hub.topics.map(t=>t.grade))].sort((a,b)=>a-b),
    unparsedSpecies:stats.unparsedSubstances,unparsedReactionFormulas:stats.unparsedReactionFormulas,
    perElement:els.filter(e=>e.relations.substances.length).map(e=>({symbol:e.symbol,substances:e.relations.substances.length,reactions:e.relations.reactions.length,labs:e.relations.labs.map(l=>l.id),topics:e.relations.topics.map(t=>t.id)})),
  };

  const conflicts=parity.rows.filter(r=>Object.values(r).includes('CONFLICT'));
  const parityReport={schema:'kimyolab.legacy-periodic-parity.v1',...BASE,
    semantics:'V19 periodic table (periodic.html + js/periodic.js + data/elements.json) against V20. Statuses: CANONICAL_MATCH (the repository proves the same value), DISPLAY_ONLY (a display position used as a field), SOURCE_REQUIRED (no source in the repository), CONFLICT (contradicts the canonical value), NOT_USED. A legacy value is never accepted as canonical.',
    statuses:LEGACY_STATUSES,
    identityCoverage:{legacy:parity.summary.elements,canonical:identity.elements,matching:parity.summary.identity.CANONICAL_MATCH},
    fieldStatus:parity.summary,
    scientificConflicts:conflicts.length,conflictRows:conflicts,
    displayOnly:parity.rows.filter(r=>r.period==='DISPLAY_ONLY'||r.group==='DISPLAY_ONLY').map(r=>({z:r.z,symbol:r.symbol,...(r.period==='DISPLAY_ONLY'?{legacyPeriod:(r as any).legacyPeriod,chemicalPeriod:(r as any).chemicalPeriod}:{}),...(r.group==='DISPLAY_ONLY'?{legacyGroup:(r as any).legacyGroup}:{})})),
    layoutDifferences:{cellsAtDifferentPositions:parity.layoutDiff.length,cells:parity.layoutDiff,addedInV20:['placeholders 57–71 / 89–103 at group 3, periods 6 / 7 (display only)','narrow screens: cells wrap in Z order (48 px targets) instead of an 18-column grid']},
    functionalDifferences:[
      {feature:'element detail',v19:'Bootstrap modal with Z, mass, group, period, category from data/elements.json',v20:'profile with a deep link (/periodic/<symbol>), proven values only, explicit gaps in plain Uzbek'},
      {feature:'mass / category',v19:'shown',v20:'not shown (no repository source) — "Bu ma’lumot hali tasdiqlangan manbada mavjud emas."'},
      {feature:'names',v19:'118 names in data/elements.json',v20:`locale catalog (${named.length}/118, review pending); otherwise the symbol`},
      {feature:'electron configuration',v19:'none',v20:`engine Z ${ELECTRON_CONFIGURATION_RANGE.min}–${ELECTRON_CONFIGURATION_RANGE.max} except the known gaps`},
      {feature:'relations',v19:'none',v20:'substances, reactions, topics, labs from canonical evidence'},
      {feature:'filters / search',v19:'none',v20:'group, period, category, grade, has topic, has lab; elements in the learner search'},
      {feature:'keyboard / screen reader',v19:'buttons without names beyond their text; modal focus by Bootstrap',v20:'links with full accessible names, focus to the profile heading, Escape closes, focus returns'},
      {feature:'category colour',v19:'category → CSS class colours',v20:'no category colour while no category is sourced'},
    ],
    sourceProvenanceGaps:{mass:parity.summary.mass.SOURCE_REQUIRED,category:parity.summary.category.SOURCE_REQUIRED,names:parity.summary.name.SOURCE_REQUIRED,fBlockGroup:parity.rows.filter(r=>r.group==='SOURCE_REQUIRED').length},
  };

  const bd=bundleDelta(root,bundle(root) as any);
  const progress=readJson(root,'reports/project-progress.json');
  const readiness={schema:'kimyolab.periodic-table-readiness.v1',...BASE,
    semantics:'What the periodic table and Element Hub do, what is a gap and what needs a human. Coverage dimensions stay separate (see the other five reports).',
    featureFlag:{name:'periodicTableV1',default:FEATURE_FLAGS.periodicTableV1.default,offBehaviour:'the /periodic routes render the existing “page not found” and the search has no element entries — the learner app is unchanged'},
    routes:{table:'/periodic',profile:'/periodic/<symbol>',unknownSymbol:'a plain notice on the table page',hosts:['portal (server allow-list: /periodic, /periodic/)','standalone (hash route)'],deepLinkRefresh:true},
    identity,
    coverage:{
      canonicalIdentity:identity.elements,
      metadataSourced:Object.fromEntries(Object.entries(metadata.fields).map(([k,v])=>[k,v.sourced])),
      metadataDerived:Object.fromEntries(Object.entries(metadata.fields).map(([k,v])=>[k,v.derived])),
      metadataReviewed:0,
      localizedNames:localization.localizedNames,reviewedLocalizedNames:localization.reviewedLocalizedNames,
      formulaDerivedRelations:relationships.formulaDerived,explicitRelations:relationships.explicit,authoredRelations:relationships.authored,
      legacyConflicts:parityReport.scientificConflicts,
    },
    search:{system:'the existing learner search (src/features/search/model.ts) — no second search',matches:['atomic number (exact)','symbol (exact)','localized name (exact first, then part)'],flagged:'elements join the index only with periodicTableV1'},
    accessibility:{tested:'tests/e2e/periodic-table.spec.mjs',checks:['every cell a link with a full accessible name','visible focus','profile heading focused on open; Escape closes; focus returns to the cell','no colour-only semantics (filters list matches as text; no category colour)','320 px: cells wrap in Z order, 48 px targets, no page scroll','reduced motion'],learnerInvariant:'140 / 5 / 0 / 1 (the sweep covers learning activities; the periodic page is tested by its own suite)'},
    bundle:{phase:bd.phases['P2.13'],report:'reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.13"]',note:'the Element Hub is a pack file loaded only on /periodic and on a flagged search'},
    isolation:{contentStudio:'no element editor; the Studio is unchanged',learnerProgress:'none: no profile, no attempt, no evidence written',otherFeatures:'curriculum, practice, dynamic lab, textbook excerpt and Content Studio do not import the periodic feature'},
    notInScope:['Substance Passport (P2.14)','Reaction Explorer (P2.14)','extending the electron-configuration engine','authoring metadata or names (human, sourced, reviewed)'],
    humanDecisions:[
      {decision:'sources for relative atomic mass, category, oxidation states and teaching descriptions',status:'human review required'},
      {decision:'review of the 20 localized element names and names for the remaining 98',status:'human review required'},
      {decision:'f-block group convention (La/Lu, Ac/Lr)',status:'human review required'},
      {decision:'electron configurations of Z 24, 29 and beyond Z 36',status:'human review required'},
      {decision:'PRIMARY element relations',status:'human review required'},
    ],
    formalMetrics:{learningProduct:progress.learningProductProgress.percent,overall:progress.overallManagementEstimate.percent,note:'the periodic table is reference infrastructure; no formula input changed'},
  };
  return {[PERIODIC_REPORTS.inventory]:put(inventory),[PERIODIC_REPORTS.metadata]:put(metadata),[PERIODIC_REPORTS.localization]:put(localization),[PERIODIC_REPORTS.relationships]:put(relationships),[PERIODIC_REPORTS.parity]:put(parityReport),[PERIODIC_REPORTS.readiness]:put(readiness)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const check=process.argv.includes('--check'); let stale=0;
  const outputs=periodicOutputs(ROOT);
  for(const [rel,body] of Object.entries(outputs)){
    const f=path.join(ROOT,rel);
    if(check){ if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body){ console.error(`STALE ${rel}`); stale++; } continue; }
    fs.writeFileSync(f,body);
  }
  if(stale) process.exit(1);
  const r=JSON.parse(outputs[PERIODIC_REPORTS.readiness]!);
  console.log(JSON.stringify({identity:r.identity.elements,localizedNames:r.coverage.localizedNames,legacyConflicts:r.coverage.legacyConflicts,check}));
}
