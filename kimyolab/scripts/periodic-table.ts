// P2.13 — periodic table + Element Hub reports (ADR-P2-014). Deterministic; every coverage dimension is reported
// separately and is never merged into one percentage.
//   npm run periodic:report            → the six reports below
//   npm run periodic:report -- --check → fails when a committed report differs from the generator
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ELEMENT_SYMBOLS} from '../src/domain/chemistry/periodic-table.ts';
import {displayPosition,isFBlock,layoutColumn,layoutRow} from '../src/domain/chemistry/periodic-layout.ts';
import {ELECTRON_CONFIGURATION_KNOWN_GAPS,ELECTRON_CONFIGURATION_RANGE} from '../src/domain/chemistry/electron-configuration.ts';
import {buildElementHub,METADATA_FIELDS,PERIOD_GROUP_ASSERTION_ID,type HubGovernance} from './lib/element-hub.ts';
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
/** CANONICAL_MATCH — equals canonical identity (code); REVIEWED_MATCH — equals a human-reviewed, sourced value;
 *  UNREVIEWED_MATCH — equals an unreviewed derivation or catalog (NOT scientific evidence); DISPLAY_ONLY — a display
 *  position used as a field; SOURCE_REQUIRED — nothing in the repository to compare with; CONFLICT; NOT_USED */
export const LEGACY_STATUSES=['CANONICAL_MATCH','REVIEWED_MATCH','UNREVIEWED_MATCH','DISPLAY_ONLY','SOURCE_REQUIRED','CONFLICT','NOT_USED'] as const;
type LegacyStatus=typeof LEGACY_STATUSES[number];
const BASE={phase:'P2.13',decision:'NOT_A_RELEASE_OR_PILOT_DECISION'};

/** Legacy V19 data/elements.json, field by field. Identity is compared with canonical identity; name with the locale
 *  catalog; period / group with the layout rule — reviewed only when its assertion is effectively reviewed; mass and
 *  category have nothing to compare with. A legacy value is never taken over. */
export function legacyParity(root:string,ruleReviewed=false,catalogReviewed=false){
  const legacy=readJson(root,'data/elements.json') as Array<{z:number;sym:string;name:string;group:number|null;period:number;category:string;mass:number}>;
  const names=readJson(root,'content-src/locales/uz-latn/chemistry-elements.json').names as Record<string,string>;
  const rows=legacy.map(e=>{
    const z=e.z, canonical=ELEMENT_SYMBOLS[z-1];
    const identity:LegacyStatus=canonical===e.sym?'CANONICAL_MATCH':'CONFLICT';
    const name:LegacyStatus=!(e.sym in names)?'SOURCE_REQUIRED':names[e.sym]===e.name?(catalogReviewed?'REVIEWED_MATCH':'UNREVIEWED_MATCH'):'CONFLICT';
    const match:LegacyStatus=ruleReviewed?'REVIEWED_MATCH':'UNREVIEWED_MATCH';
    const f=isFBlock(z), pos=displayPosition(z);
    // the legacy page draws Z 57–71 / 89–103 in rows 9 / 10; their legacy "period" 8 / 9 is a display row, not a period
    const row=layoutRow(z), g=layoutColumn(z);
    const period:LegacyStatus=e.period===row?match:f&&e.period!==row?'DISPLAY_ONLY':'CONFLICT';
    // f-block: the legacy "group" equals the display column (or 3 for La / Ac); the layout rule assigns none
    const group:LegacyStatus=f?(e.group===pos.column&&e.group!==3?'DISPLAY_ONLY':'SOURCE_REQUIRED'):e.group===g?match:'CONFLICT';
    return {z,symbol:e.sym,identity,name,period,group,mass:'SOURCE_REQUIRED' as LegacyStatus,category:'SOURCE_REQUIRED' as LegacyStatus,
      ...(period!==match?{legacyPeriod:e.period,layoutRow:row}:{}),...(group!==match?{legacyGroup:e.group,layoutColumn:g}:{}),
      ...(name==='CONFLICT'?{legacyName:e.name,localeName:names[e.sym]}:{})};
  });
  const count=(field:'identity'|'name'|'period'|'group'|'mass'|'category')=>Object.fromEntries(LEGACY_STATUSES.map(s=>[s,rows.filter(r=>r[field]===s).length]));
  // layout: where the legacy script draws each cell (js/periodic.js) vs the V20 display position
  const legacyPos=(e:{z:number;group:number|null;period:number})=>e.z>=57&&e.z<=71?{row:9,column:e.z-54}:e.z>=89&&e.z<=103?{row:10,column:e.z-86}:{row:e.period,column:e.group||3};
  const layoutDiff=legacy.map(e=>({z:e.z,legacy:legacyPos(e),v20:(({row,column})=>({row,column}))(displayPosition(e.z))})).filter(d=>d.legacy.row!==d.v20.row||d.legacy.column!==d.v20.column);
  return {legacy,rows,summary:{elements:legacy.length,identity:count('identity'),name:count('name'),period:count('period'),group:count('group'),mass:count('mass'),category:count('category')},layoutDiff};
}

/** learner-facing state of one hub field across the 118 elements */
const fieldStats=(els:HubElement[],get:(e:HubElement)=>HubField<unknown>)=>{
  const fs_=els.map(get);
  const gaps=fs_.filter(f=>f.status==='GAP') as Array<{status:'GAP';reason:string}>;
  return {reviewedShown:fs_.filter(f=>f.status==='REVIEWED').length,computedShown:fs_.filter(f=>f.status==='COMPUTED').length,gap:gaps.length,
    gapReasons:Object.fromEntries([...new Set(gaps.map(g=>g.reason))].sort().map(r=>[r,gaps.filter(g=>g.reason===r).length]))};
};
/** governance state of the authored claims of one metadata field */
const claimStats=(gov:HubGovernance,field:string)=>{
  const xs=gov.metadata.filter(m=>m.field===field);
  const by=(st:string)=>xs.filter(x=>x.state===st).length;
  return {authored:xs.length,sourceEligible:xs.filter(x=>x.sources.some(s=>s.eligible)).length,effectiveReviewed:by('REVIEWED'),reviewPending:by('REVIEW_PENDING'),sourceNotEligible:by('SOURCE_NOT_ELIGIBLE'),
    staleDecisions:xs.filter(x=>x.review==='stale').length};
};

export function periodicOutputs(root=ROOT):Record<string,string>{
  const {hub,stats,governance}=buildElementHub(root);
  const els=hub.elements;
  const names=readJson(root,'content-src/locales/uz-latn/chemistry-elements.json');
  const rule=governance.periodGroupRule;
  const parity=legacyParity(root,rule.state==='REVIEWED',names.reviewStatus==='approved');
  const reviews=readJson(root,'content-src/periodic/element-reviews.json').records as unknown[];
  const put=(v:unknown)=>`${JSON.stringify(v,null,2)}\n`;
  const identity={canonicalSource:'src/domain/chemistry/periodic-table.ts (ELEMENT_SYMBOLS)',elements:els.length,atomicNumbers:{min:els[0]!.z,max:els.at(-1)!.z,contiguous:els.every((e,i)=>e.z===i+1)},symbolsEqualCanonical:els.every((e,i)=>e.symbol===ELEMENT_SYMBOLS[i]),duplicateZ:els.length-new Set(els.map(e=>e.z)).size,duplicateSymbols:els.length-new Set(els.map(e=>e.symbol)).size};

  const inventory={schema:'kimyolab.periodic-table-inventory.v1',...BASE,
    semantics:'Every source the periodic table and Element Hub read, and what each is used for. Legacy V19 files are audited, never used as truth.',
    canonical:[
      {source:'src/domain/chemistry/periodic-table.ts',role:'element identity (Z, symbol) — the only element list',status:'CANONICAL'},
      {source:'src/domain/chemistry/periodic-layout.ts',role:'display layout (cell row / column) — UI placement only; as a period / group claim it is the assertion periodic.period-group-rule, unreviewed and unsourced',status:'LAYOUT_ONLY'},
      {source:'src/domain/chemistry/electron-configuration.ts',role:`electron configuration — engine range Z ${ELECTRON_CONFIGURATION_RANGE.min}–${ELECTRON_CONFIGURATION_RANGE.max}, known gaps Z ${ELECTRON_CONFIGURATION_KNOWN_GAPS.join(', ')} not shown`,status:'DERIVED'},
      {source:'src/domain/chemistry/formula-parser.ts',role:'elements of canonical species / reaction formulas (relations)',status:'CANONICAL'},
      {source:'content-src/locales/uz-latn/chemistry-elements.json',role:'localized element names (review pending)',status:'CANONICAL'},
      {source:'content-src/periodic/element-metadata.json',role:'authored metadata claims (mass, category, oxidation states, teaching description) with registry source ids; sources for the period/group rule',status:'CANONICAL',entries:Object.keys(readJson(root,'content-src/periodic/element-metadata.json').entries).length},
      {source:'content-src/periodic/element-relations.json',role:'authored PRIMARY / RELATED relations with typed, existing targets',status:'CANONICAL',relations:readJson(root,'content-src/periodic/element-relations.json').relations.length},
      {source:'content-src/periodic/element-reviews.json',role:'human decision register (hash-bound) — the only source of effective review',status:'CANONICAL',records:reviews.length},
      {source:'content-src/source-registry.json',role:'the only source of source titles, categories and acceptance',status:'CANONICAL'},
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
    semantics:'Separate dimensions, never merged: canonical identity (code); learner-facing state per field (reviewedShown = human-reviewed and sourced; computedShown = domain engine; gap with reason); authored claims and their governance (source-eligible, effective human review from the hash-bound decision register, pending, stale); unreviewed derivations that exist in code but are NOT scientific evidence.',
    metadataSchema:hub.metadataSchema,authoredFields:METADATA_FIELDS,
    canonicalIdentity:els.length,
    learnerFacing:{
      chemicalPeriod:fieldStats(els,e=>e.period),
      group:fieldStats(els,e=>e.group),
      relativeAtomicMass:fieldStats(els,e=>e.relativeAtomicMass),
      category:fieldStats(els,e=>e.category),
      electronConfiguration:fieldStats(els,e=>e.electronConfiguration),
      oxidationStates:fieldStats(els,e=>e.oxidationStates),
      teachingDescription:fieldStats(els,e=>e.teachingDescription),
    },
    authoredClaims:Object.fromEntries(METADATA_FIELDS.map(f=>[f,claimStats(governance,f)])),
    periodGroupRule:{assertionId:PERIOD_GROUP_ASSERTION_ID,hash:rule.hash,sourceRefs:rule.sourceRefs,state:rule.state,review:rule.review,
      unreviewedDerivationAvailable:rule.unreviewedDerivation,note:'the layout rule places cells; as chemical period / group it is a scientific claim: no registered, human-accepted source and no human decision — the learner sees a gap'},
    computedEngineFields:{electronConfiguration:{computed:els.filter(e=>e.electronConfiguration.status==='COMPUTED').length,engineRange:ELECTRON_CONFIGURATION_RANGE,knownGaps:ELECTRON_CONFIGURATION_KNOWN_GAPS,knownGapSource:'scripts/lib/computed-model-interaction.ts (P2.6 MODEL_KNOWN_GAP: no exception records)',extendedTo118:false}},
    effectiveHumanReviewed:governance.metadata.filter(m=>m.state==='REVIEWED').length+(rule.state==='REVIEWED'?1:0),
    decisionRegister:{file:'content-src/periodic/element-reviews.json',records:reviews.length},
    sourceGaps:{periodGroup:'no registered source is acceptable and human-accepted (source-registry: 5 sources, all PROPOSED)',relativeAtomicMass:'no repository source; legacy data/elements.json masses have no provenance',category:'no repository source; legacy categories have no provenance',oxidationStates:'no element-level source (species oxidationStates arrays are empty)',teachingDescription:'no authored descriptions',fBlockGroup:'which of La/Lu (Ac/Lr) is group 3 needs a reviewed convention'},
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
    semantics:'Element → Substance → Reaction → Lab → Topic, only from canonical records: formula-derived PARTICIPATES (formula parser), explicit mappings (lab profile shelf, guided-step reaction map, mapping links) and human-reviewed authored relations. No keyword matching, no inference. PARTICIPATES is never promoted to PRIMARY; an unreviewed authored relation is never shown or counted as reviewed.',
    elementsWith:{substances:has('substances'),reactions:has('reactions'),labs:has('labs'),topics:has('topics'),reviewedPrimary:els.filter(e=>e.relations.authored.some(r=>r.kind==='PRIMARY')).length},
    totals:{substances:hub.substances.length,reactions:hub.reactions.length,labs:hub.labs.length,topics:hub.topics.length},
    formulaDerived:[...prov].filter(([k])=>k.includes('DERIVED_FROM_FORMULA')).reduce((n,[,v])=>n+v,0),
    explicit:[...prov].filter(([k])=>k.includes('EXPLICIT_MAPPING')).reduce((n,[,v])=>n+v,0),
    authoredReviewedShown:[...prov].filter(([k])=>k.includes('AUTHORED_RELATION')).reduce((n,[,v])=>n+v,0),
    authoredClaims:{total:governance.relations.length,effectiveReviewed:governance.relations.filter(r=>r.state==='REVIEWED').length,notReviewed:governance.relations.filter(r=>r.state!=='REVIEWED').length,
      contract:'targetType ∈ SUBSTANCE | REACTION | TOPIC | LAB, targetId exists in that canonical registry, registry source ids; reviewed on the exact hash (chemistry role: substance / reaction; didactic role: topic / lab)'},
    byKindAndProvenance:Object.fromEntries([...prov].sort(([a],[b])=>a.localeCompare(b))),
    gradesCovered:[...new Set(hub.topics.map(t=>t.grade))].sort((a,b)=>a-b),
    unparsedSpecies:stats.unparsedSubstances,unparsedReactionFormulas:stats.unparsedReactionFormulas,
    perElement:els.filter(e=>e.relations.substances.length).map(e=>({symbol:e.symbol,substances:e.relations.substances.length,reactions:e.relations.reactions.length,labs:e.relations.labs.map(l=>l.id),topics:e.relations.topics.map(t=>t.id)})),
  };

  const conflicts=parity.rows.filter(r=>Object.values(r).includes('CONFLICT'));
  const sci=['period','group','mass','category'] as const;
  const countIn=(fields:readonly string[],st:string)=>parity.rows.reduce((n,r:any)=>n+fields.filter(f=>r[f]===st).length,0);
  const parityReport={schema:'kimyolab.legacy-periodic-parity.v1',...BASE,
    semantics:'V19 periodic table (periodic.html + js/periodic.js + data/elements.json) against V20. Statuses: CANONICAL_MATCH (equals canonical identity — code), REVIEWED_MATCH (equals a human-reviewed, sourced value), UNREVIEWED_MATCH (equals an unreviewed derivation or catalog — not scientific evidence), DISPLAY_ONLY (a display position used as a field), SOURCE_REQUIRED (nothing in the repository to compare with), CONFLICT, NOT_USED. A legacy value is never accepted as canonical.',
    statuses:LEGACY_STATUSES,
    identityCoverage:{legacy:parity.summary.elements,canonical:identity.elements,matching:parity.summary.identity.CANONICAL_MATCH},
    fieldStatus:parity.summary,
    comparisons:{
      identityConflicts:parity.summary.identity.CONFLICT,
      layoutDifferences:parity.layoutDiff.length,
      againstReviewedScientificData:{compared:countIn(sci,'REVIEWED_MATCH')+(rule.state==='REVIEWED'?countIn(['period','group'],'CONFLICT'):0),matches:countIn(sci,'REVIEWED_MATCH'),conflicts:rule.state==='REVIEWED'?countIn(['period','group'],'CONFLICT'):0,note:'no scientific field is human-reviewed yet, so nothing legacy states has been checked against reviewed data'},
      againstUnreviewedDerivations:{compared:countIn(['period','group'],'UNREVIEWED_MATCH')+(rule.state==='REVIEWED'?0:countIn(['period','group'],'CONFLICT')),matches:countIn(['period','group'],'UNREVIEWED_MATCH'),conflicts:rule.state==='REVIEWED'?0:countIn(['period','group'],'CONFLICT'),note:'agreement with an unreviewed layout rule is not scientific evidence'},
      againstUnreviewedCatalog:{field:'name',matches:parity.summary.name.UNREVIEWED_MATCH,conflicts:parity.summary.name.CONFLICT},
      displayOnly:countIn(sci,'DISPLAY_ONLY'),
      notAssessable:{fields:countIn(['period','group','mass','category','name'],'SOURCE_REQUIRED'),mass:parity.summary.mass.SOURCE_REQUIRED,category:parity.summary.category.SOURCE_REQUIRED,name:parity.summary.name.SOURCE_REQUIRED,fBlockGroup:parity.rows.filter(r=>r.group==='SOURCE_REQUIRED').length},
    },
    conflictRows:conflicts,
    displayOnly:parity.rows.filter(r=>r.period==='DISPLAY_ONLY'||r.group==='DISPLAY_ONLY').map(r=>({z:r.z,symbol:r.symbol,...(r.period==='DISPLAY_ONLY'?{legacyPeriod:(r as any).legacyPeriod,layoutRow:(r as any).layoutRow}:{}),...(r.group==='DISPLAY_ONLY'?{legacyGroup:(r as any).legacyGroup}:{})})),
    layoutDifferences:{cellsAtDifferentPositions:parity.layoutDiff.length,cells:parity.layoutDiff,addedInV20:['placeholders 57–71 / 89–103 at group 3, periods 6 / 7 (display only)','narrow screens: cells wrap in Z order (48 px targets) instead of an 18-column grid']},
    functionalDifferences:[
      {feature:'element detail',v19:'Bootstrap modal with Z, mass, group, period, category from data/elements.json',v20:'profile with a deep link (/periodic/<symbol>), proven values only, explicit gaps in plain Uzbek'},
      {feature:'mass / category / period / group',v19:'shown',v20:'not shown (no reviewed, sourced value) — "Bu ma’lumot hali tasdiqlangan manbada mavjud emas."'},
      {feature:'names',v19:'118 names in data/elements.json',v20:`locale catalog (${named.length}/118, review pending); otherwise the symbol`},
      {feature:'electron configuration',v19:'none',v20:`engine Z ${ELECTRON_CONFIGURATION_RANGE.min}–${ELECTRON_CONFIGURATION_RANGE.max} except the known gaps`},
      {feature:'relations',v19:'none',v20:'substances, reactions, topics, labs from canonical evidence'},
      {feature:'filters / search',v19:'none',v20:'grade, has topic, has lab; group / period / category disabled with a note until reviewed data exists; elements in the learner search'},
      {feature:'keyboard / screen reader',v19:'buttons without names beyond their text; modal focus by Bootstrap',v20:'links with full accessible names, focus to the profile heading, Escape closes, focus returns'},
      {feature:'category colour',v19:'category → CSS class colours',v20:'no category colour while no category is sourced'},
    ],
    sourceProvenanceGaps:{periodGroupRule:rule.state,mass:parity.summary.mass.SOURCE_REQUIRED,category:parity.summary.category.SOURCE_REQUIRED,names:parity.summary.name.SOURCE_REQUIRED,fBlockGroup:parity.rows.filter(r=>r.group==='SOURCE_REQUIRED').length},
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
      sourcedScientificClaims:governance.metadata.length,
      effectiveHumanReviewedMetadata:metadata.effectiveHumanReviewed,
      unreviewedDerivations:{periodGroupRule:rule.state==='REVIEWED'?0:1,periodValuesNotShown:rule.unreviewedDerivation.period,groupValuesNotShown:rule.unreviewedDerivation.group},
      sourceRequiredGaps:Object.fromEntries(Object.entries(metadata.learnerFacing).map(([k,v])=>[k,(v.gapReasons as any).SOURCE_REQUIRED??0])),
      computedEngineFields:metadata.computedEngineFields.electronConfiguration.computed,
      localizedNames:localization.localizedNames,reviewedLocalizedNames:localization.reviewedLocalizedNames,
      formulaDerivedRelations:relationships.formulaDerived,explicitMappings:relationships.explicit,humanReviewedAuthoredRelations:relationships.authoredClaims.effectiveReviewed,
      legacy:{identityConflicts:parityReport.comparisons.identityConflicts,layoutDifferences:parityReport.comparisons.layoutDifferences,conflictsAgainstReviewed:parityReport.comparisons.againstReviewedScientificData.conflicts,comparedAgainstReviewed:parityReport.comparisons.againstReviewedScientificData.compared,matchesAgainstUnreviewed:parityReport.comparisons.againstUnreviewedDerivations.matches,notAssessable:parityReport.comparisons.notAssessable.fields},
    },
    search:{system:'the existing learner search (src/features/search/model.ts) — no second search',matches:['atomic number (exact)','symbol (exact)','localized name (exact first, then part)'],flagged:'elements join the index only with periodicTableV1'},
    accessibility:{tested:'tests/e2e/periodic-table.spec.mjs',checks:['every cell a link with a full accessible name','visible focus','profile heading focused on open; Escape closes; focus returns to the cell','no colour-only semantics (filters list matches as text; no category colour)','320 px: cells wrap in Z order, 48 px targets, no page scroll','reduced motion'],learnerInvariant:'140 / 5 / 0 / 1 (the sweep covers learning activities; the periodic page is tested by its own suite)'},
    bundle:{phase:bd.phases['P2.13'],report:'reports/guided-dynamic-lab-readiness.json#bundleDelta.phases["P2.13"]',note:'the Element Hub is a pack file loaded only on /periodic and on a flagged search'},
    isolation:{contentStudio:'no element editor; the Studio is unchanged',learnerProgress:'none: no profile, no attempt, no evidence written',otherFeatures:'curriculum, practice, dynamic lab, textbook excerpt and Content Studio do not import the periodic feature'},
    notInScope:['Substance Passport (P2.14)','Reaction Explorer (P2.14)','extending the electron-configuration engine','authoring metadata or names (human, sourced, reviewed)'],
    humanDecisions:[
      {decision:'sources for relative atomic mass, category, oxidation states and teaching descriptions',status:'human review required'},
      {decision:'review of the 20 localized element names and names for the remaining 98',status:'human review required'},
      {decision:'a registered, human-accepted source for the period / group rule and a chemistry decision on its hash',status:'human review required'},
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
  console.log(JSON.stringify({identity:r.identity.elements,localizedNames:r.coverage.localizedNames,reviewedMetadata:r.coverage.effectiveHumanReviewedMetadata,check}));
}
