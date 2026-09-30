// Chemistry knowledge base (P1.7): inventory, assertions, coverage, the validation gate and the review packet —
// built from content only. It never adds, removes or "fixes" a chemistry claim: it measures, classifies and
// packages for HUMAN review. Candidates (e.g. a pair that the solubility rules suggest might precipitate) are
// review suggestions, never canonical truth.
import fs from 'node:fs';
import path from 'node:path';
import {ReactionMatcher,classifyMatch,isNoReaction,NO_REACTION_TYPE} from '../../src/domain/chemistry/reaction-matcher.ts';
import {IonicEngine} from '../../src/domain/chemistry/ionic-engine.ts';
import {SpeciesRegistry} from '../../src/domain/chemistry/species-registry.ts';
import {parseFormula} from '../../src/domain/chemistry/formula-parser.ts';
import {HydrolysisModel,validateIndicator,HYDROLYSIS_MEDIA} from '../../src/domain/chemistry/hydrolysis-model.ts';
import {parseConditionVocabulary,dimensionsOf,type ConditionVocabulary} from '../../src/domain/chemistry/condition-vocabulary.ts';
import {parseSourceRegistry,provenanceOf,claimKindOf} from '../../src/domain/governance/source-policy.ts';
import {assertionHash,candidateHash,parseReviewRegister,reviewStateOf,ASSERTION_CATEGORIES,type ChemistryAssertion,type AssertionCategory,type ReviewState} from '../../src/domain/chemistry/kb-review.ts';

export const REVIEW_REGISTER_FILE='content-src/chemistry-reviews.json';
/** P1.8: human triage of review candidates (authoring input, never KB truth). Written only by the chemistry importer. */
export const CANDIDATE_REGISTER_FILE='content-src/chemistry-candidate-reviews.json';
export const CANDIDATE_BADGE='CANDIDATE — NOT PART OF CANONICAL KB';
export const PACKET_DIR='review-packets/chemistry-kb';
export const REPORTS={
  inventory:'reports/chemistry-kb-inventory.json',
  coverage:'reports/chemistry-kb-coverage.json',
  ionic:'reports/ionic-pair-coverage.json',
  electrolysis:'reports/electrolysis-model-readiness.json',
};
const PHASES=new Set(['aq','s','l','g']);

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const readOptional=(root:string,rel:string,fallback:any)=>fs.existsSync(path.join(root,rel))?readJson(root,rel):fallback;
const refIds=(refs:any[]|undefined)=>(refs??[]).map(r=>typeof r==='string'?r:r?.id).filter(Boolean).sort();
const formulasOf=(r:any)=>[...r.reactants,...r.products].map((x:any)=>x.formula);
const key=(xs:string[])=>[...xs].sort().join('+');

export function loadKb(root:string){
  const chem=(f:string)=>readJson(root,`content-src/chemistry/${f}`);
  const configsDir=path.join(root,'content-src/activity-configs');
  const configs:Record<string,Record<string,any>>={};
  for(const f of fs.readdirSync(configsDir).filter(f=>f.endsWith('.json'))) configs[f.replace(/\.json$/,'')]=readJson(root,`content-src/activity-configs/${f}`);
  return {
    species:chem('species.json') as any[],
    reactions:chem('reactions.json') as any[],
    solubility:chem('solubility.json'),
    hydrolysis:chem('hydrolysis.json'),
    electrolysis:chem('electrolysis.json'),
    vocabularyRaw:chem('condition-vocabulary.json'),
    guidedMap:readOptional(root,'content-src/chemistry/guided-step-reaction-map.json',{}),
    elementNames:readOptional(root,'content-src/locales/uz-latn/chemistry-elements.json',{names:{},reviewStatus:'missing'}),
    speciesNames:readOptional(root,'content-src/locales/uz-latn/chemistry-species.json',{names:{},reviewStatus:'missing'}),
    register:readOptional(root,REVIEW_REGISTER_FILE,{schema:'kimyolab.chemistry-reviews.v1',records:[]}),
    sourceRegistryRaw:readOptional(root,'content-src/source-registry.json',{schema:'kimyolab.source-registry.v1',sources:[]}),
    nameProvenance:readOptional(root,'content-src/locales/uz-latn/name-provenance.json',{entries:[]}),
    configs,
    pilot:readJson(root,'content-src/learning-pilot.json'),
    mappings:readJson(root,'content-src/mapping-links.json') as any[],
    pilotMatrix:readOptional(root,'reports/pilot-acceptance-matrix.json',{rows:[]}),
  };
}
export type Kb=ReturnType<typeof loadKb>;

// ------------------------------------------------------------------ usage (which activities rely on what)

function activityUsage(kb:Kb){
  const reactions=new Map<string,Set<string>>(), salts=new Map<string,Set<string>>(), electrolytes=new Map<string,Set<string>>(), shelves:Array<{activityId:string;shelf:string[];targetReactionId:string}>=[];
  const hydrolysisRenderer=new Set<string>();
  const add=(m:Map<string,Set<string>>,k:string,a:string)=>{ if(!m.has(k)) m.set(k,new Set()); m.get(k)!.add(a); };
  for(const cfgs of Object.values(kb.configs)) for(const [activityId,c] of Object.entries(cfgs)){
    const text=JSON.stringify(c);
    for(const m of text.matchAll(/"(rxn\.[a-z0-9-]+)(?:\.[a-z]+)?"/g)) add(reactions,m[1]!,activityId);
    if(typeof c?.salt==='string') add(salts,c.salt,activityId);
    if(c?.query?.electrolyte) add(electrolytes,c.query.electrolyte,activityId);
    if(Array.isArray(c?.reagentShelf)) shelves.push({activityId,shelf:[...c.reagentShelf],targetReactionId:c.reactionId});
    if(c?.rendererRequirement?.capability==='hydrolysis-medium') hydrolysisRenderer.add(activityId);
  }
  for(const [activityId,steps] of Object.entries(kb.guidedMap as Record<string,Record<string,string>>)) for(const id of Object.values(steps)) add(reactions,id,activityId);
  const list=(m:Map<string,Set<string>>,k:string)=>[...(m.get(k)??[])].sort();
  return {reactions:(id:string)=>list(reactions,id),salts:(s:string)=>list(salts,s),electrolytes:(e:string)=>list(electrolytes,e),shelves,hydrolysisRenderer:[...hydrolysisRenderer].sort()};
}

// ------------------------------------------------------------------ observation integrity (structural flags only)

function observationFlags(r:any,kb:Kb,phaseOf:(f:string)=>string|undefined):string[]{
  const flags:string[]=[];
  const insoluble=new Set(kb.solubility.insoluble??[]);
  for(const o of r.observations??[]){
    if(o.type==='color-change'&&(!o.to||o.to==='changed')) flags.push('OBSERVATION_NONSPECIFIC: colour change without a stated colour');
    if(o.type==='precipitate'&&!r.products.some((p:any)=>p.phase==='s'||insoluble.has(p.formula))) flags.push('OBSERVATION_PRODUCT_MISMATCH: precipitate observed but no product is insoluble (solubility rules) or solid');
    if(o.type==='gas'&&!r.products.some((p:any)=>p.phase==='g'||phaseOf(p.formula)==='g')) flags.push('OBSERVATION_PRODUCT_MISMATCH: gas observed but no product is a gas');
  }
  if(!(r.observations??[]).length) flags.push('OBSERVATION_MISSING');
  return flags;
}

// ------------------------------------------------------------------ assertions

export function buildAssertions(kb:Kb){
  const usage=activityUsage(kb);
  const vocabulary=parseConditionVocabulary(kb.vocabularyRaw);
  const phaseOf=(f:string)=>kb.species.find(s=>s.formula===f)?.phase;
  const out:Array<ChemistryAssertion&{flags:string[]}>=[];
  const push=(a:Omit<ChemistryAssertion,'hash'>&{flags?:string[]})=>out.push({...a,flags:a.flags??[],hash:assertionHash(a)});
  const reactionActivities=(formula:string)=>[...new Set(kb.reactions.filter(r=>formulasOf(r).includes(formula)).flatMap(r=>usage.reactions(r.id)))].sort();
  for(const r of kb.reactions){
    const sources=refIds(r.sourceRefs), acts=usage.reactions(r.id);
    if(isNoReaction(r)) push({id:`no-reaction:${r.id}`,category:'no-reaction',claim:`${r.reactants.map((x:any)=>x.formula).join(' + ')}: reaksiya bormaydi`,data:{reactants:r.reactants,conditions:r.conditions},sourceRefs:sources,affectedActivities:acts,dataReviewStatus:r.reviewStatus??null});
    else push({id:`reaction:${r.id}`,category:'reaction',claim:r.molecularEquation,data:{reactants:r.reactants,products:r.products,reactionType:r.reactionType,direction:r.direction},sourceRefs:sources,affectedActivities:acts,dataReviewStatus:r.reviewStatus??null});
    if((r.conditions?.tags??[]).length) push({id:`condition:${r.id}`,category:'condition',claim:`${r.id} talab qiladi: ${r.conditions.tags.join(', ')}`,data:{tags:r.conditions.tags,dimensions:dimensionsOf(r.conditions.tags,vocabulary).dimensions},sourceRefs:sources,affectedActivities:acts,dataReviewStatus:null});
    const flags=observationFlags(r,kb,phaseOf);
    push({id:`observation:${r.id}`,category:'observation',claim:`${r.id}: ${JSON.stringify(r.observations)}`,data:{observations:r.observations},sourceRefs:sources,affectedActivities:acts,dataReviewStatus:null,flags:flags.length?['CHEMISTRY_REVIEW_REQUIRED',...flags]:[]});
  }
  for(const [tag,term] of Object.entries(vocabulary.terms)) push({id:`condition-term:${tag}`,category:'condition',claim:`“${tag}” = ${term.dimension}: ${term.value}`,data:term,sourceRefs:refIds(kb.vocabularyRaw.sourceRefs),affectedActivities:[...new Set(kb.reactions.filter(r=>(r.conditions?.tags??[]).includes(tag)).flatMap(r=>usage.reactions(r.id)))].sort(),dataReviewStatus:kb.vocabularyRaw.reviewStatus??null});
  for(const [id,ctx] of Object.entries(vocabulary.contexts)) push({id:`condition-context:${id}`,category:'condition',claim:ctx.description,data:ctx.dimensions,sourceRefs:refIds(kb.vocabularyRaw.sourceRefs),affectedActivities:usage.shelves.map(s=>s.activityId).sort(),dataReviewStatus:kb.vocabularyRaw.reviewStatus??null});
  const solSources=refIds(kb.solubility.sourceRefs);
  for(const d of kb.solubility.dissociation??[]) push({id:`dissociation:${d.formula}`,category:'solubility',claim:`${d.formula} → ${d.ions.map((i:any)=>`${i.coefficient>1?i.coefficient:''}${i.formula}`).join(' + ')}`,data:d,sourceRefs:solSources,affectedActivities:reactionActivities(d.formula),dataReviewStatus:null});
  for(const f of kb.solubility.insoluble??[]) push({id:`insoluble:${f}`,category:'solubility',claim:`${f} suvda erimaydi (cho‘kma)`,data:{formula:f},sourceRefs:solSources,affectedActivities:reactionActivities(f),dataReviewStatus:null});
  for(const h of kb.hydrolysis.records??[]) push({id:`hydrolysis:${h.salt}`,category:'hydrolysis',claim:`${h.salt} eritmasi: ${h.medium}`,data:{salt:h.salt,medium:h.medium,explanation:h.explanation},sourceRefs:refIds(h.sourceRefs),affectedActivities:usage.salts(h.salt).concat(usage.hydrolysisRenderer).filter((v,i,a)=>a.indexOf(v)===i).sort(),dataReviewStatus:h.reviewStatus??null});
  const ind=kb.hydrolysis.indicator;
  if(ind) for(const m of HYDROLYSIS_MEDIA) if(ind.colors?.[m]) push({id:`indicator:${ind.id}:${m}`,category:'indicator',claim:`${ind.id}: ${m} muhitda ${ind.colors[m]}`,data:{indicator:ind.id,medium:m,color:ind.colors[m]},sourceRefs:refIds(ind.sourceRefs),affectedActivities:usage.hydrolysisRenderer,dataReviewStatus:ind.reviewStatus??null});
  for(const e of kb.electrolysis.records??[]) push({id:`electrolysis:${e.electrolyte}|${e.phase}|${e.electrode}`,category:'electrolysis',claim:`${e.electrolyte}(${e.phase}), ${e.electrode} elektrod: katod ${e.cathode.product}, anod ${e.anode.product}`,data:{electrolyte:e.electrolyte,phase:e.phase,electrode:e.electrode,cathode:e.cathode,anode:e.anode},sourceRefs:refIds(e.sourceRefs),affectedActivities:usage.electrolytes(e.electrolyte),dataReviewStatus:e.reviewStatus??null});
  // P1.9: a localized name's provenance lives in name-provenance.json (display translation, not chemistry truth)
  const nameSource=(assertionId:string)=>{ const e=(kb.nameProvenance.entries??[]).find((x:any)=>x.assertionId===assertionId); return e?.sourceRef?[String(e.sourceRef)]:[]; };
  const byNameKey=new Map(kb.species.map(s=>[s.nameKey,s]));
  for(const [nameKey,name] of Object.entries(kb.speciesNames.names??{})){
    const s=byNameKey.get(nameKey);
    push({id:`species-name:${nameKey}`,category:'species-name',claim:`${s?.formula??'?'} — ${name}`,data:{nameKey,speciesId:s?.id??null,formula:s?.formula??null,name,locale:kb.speciesNames.locale},sourceRefs:nameSource(`species-name:${nameKey}`),affectedActivities:usage.shelves.filter(x=>s&&x.shelf.includes(s.id)).map(x=>x.activityId).concat(s?usage.salts(s.formula):[]).sort(),dataReviewStatus:kb.speciesNames.reviewStatus??null});
  }
  for(const [symbol,name] of Object.entries(kb.elementNames.names??{})) push({id:`element-name:${symbol}`,category:'species-name',claim:`${symbol} — ${name}`,data:{symbol,name,locale:kb.elementNames.locale},sourceRefs:nameSource(`element-name:${symbol}`),affectedActivities:['practice.simulation.7.07.planned'],dataReviewStatus:kb.elementNames.reviewStatus??null});
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ gate: FAIL (invalid) vs PENDING (incomplete)

export function evaluateGate(kb:Kb,assertions:ReturnType<typeof buildAssertions>){
  const fail:string[]=[], pending:string[]=[];
  let registry:SpeciesRegistry|undefined;
  try{ registry=SpeciesRegistry.from(kb.species); }catch(e:any){ fail.push(`SPECIES_REGISTRY_INVALID:${e.message}`); }
  const registered=new Set(kb.species.map(s=>s.formula));
  for(const s of kb.species) if(!PHASES.has(s.phase)) fail.push(`PHASE_INVALID:species:${s.id}:${s.phase}`);
  // species references: every molecular formula must be a registered species; ions must at least parse as charged
  const molecular:Array<[string,string]>=[];
  for(const r of kb.reactions){
    for(const x of [...r.reactants,...r.products]){ molecular.push([x.formula,`reaction:${r.id}`]); if(x.phase!==undefined&&!PHASES.has(x.phase)) fail.push(`PHASE_INVALID:${r.id}:${x.formula}:${x.phase}`); }
  }
  for(const d of kb.solubility.dissociation??[]){
    molecular.push([d.formula,`dissociation:${d.formula}`]);
    for(const ion of d.ions){
      let charge=0; try{ charge=parseFormula(ion.formula).charge; }catch{ fail.push(`ION_REF_INVALID:${d.formula}:${ion.formula}`); continue; }
      if(!charge) fail.push(`ION_REF_INVALID:${d.formula}:${ion.formula}:uncharged`);
      if(!registered.has(ion.formula)) pending.push(`ION_SPECIES_UNREGISTERED:${ion.formula}`);
    }
  }
  for(const f of kb.solubility.insoluble??[]) molecular.push([f,`insoluble:${f}`]);
  for(const h of kb.hydrolysis.records??[]) molecular.push([h.salt,`hydrolysis:${h.salt}`]);
  for(const e of kb.electrolysis.records??[]){
    molecular.push([e.electrolyte,'electrolysis'],[e.cathode.product,'electrolysis'],[e.anode.product,'electrolysis']);
    if(!PHASES.has(e.phase)) fail.push(`PHASE_INVALID:electrolysis:${e.electrolyte}:${e.phase}`);
  }
  for(const [f,where] of molecular) if(!registered.has(f)) fail.push(`SPECIES_REF_UNREGISTERED:${where}:${f}`);
  // localization keys must be real species nameKeys (a name for a non-existent species is invalid content)
  const nameKeys=new Set(kb.species.map(s=>s.nameKey));
  for(const k of Object.keys(kb.speciesNames.names??{})) if(!nameKeys.has(k)) fail.push(`SPECIES_NAME_KEY_UNKNOWN:${k}`);
  // condition schema
  let vocabulary:ConditionVocabulary|undefined;
  try{ vocabulary=parseConditionVocabulary(kb.vocabularyRaw); }catch(e:any){ fail.push(e.message); }
  if(vocabulary) for(const r of kb.reactions){
    const d=dimensionsOf(r.conditions?.tags??[],vocabulary);
    for(const t of d.unknown) fail.push(`CONDITION_TAG_UNKNOWN:${r.id}:${t}`);
    for(const c of d.conflicts) fail.push(`CONDITION_TAG_CONFLICT:${r.id}:${c}`);
  }
  // duplicates / conflicts / ambiguity
  let matcher:ReactionMatcher|undefined;
  try{ matcher=ReactionMatcher.from(kb.reactions,vocabulary?{vocabulary}:{}); }catch(e:any){ fail.push(`REACTION_KB_INVALID:${e.message}`); }
  const dimKey=(r:any)=>vocabulary?JSON.stringify(Object.entries(dimensionsOf(r.conditions?.tags??[],vocabulary).dimensions).sort()):JSON.stringify([...(r.conditions?.tags??[])].sort());
  const groups=new Map<string,any[]>();
  for(const r of kb.reactions){ const k=`${key(r.reactants.map((x:any)=>x.formula))}|${dimKey(r)}`; groups.set(k,[...(groups.get(k)??[]),r]); }
  for(const [k,rs] of groups) if(rs.length>1){
    const productSets=new Set(rs.map(r=>isNoReaction(r)?'∅':key(r.products.map((x:any)=>x.formula))));
    fail.push(`${productSets.size>1?'REACTION_CONFLICT':'REACTION_DUPLICATE'}:${rs.map(r=>r.id).join(',')}:${k}`);
  }
  if(matcher) for(const r of kb.reactions){
    const m=matcher.match({reactants:r.reactants.map((x:any)=>({formula:x.formula,...(x.phase?{phase:x.phase}:{})})),conditions:{tags:r.conditions?.tags??[]},conditionPolicy:'require-record-conditions'});
    if(!m.modeled||m.reaction.id!==r.id) fail.push(`MATCHER_AMBIGUOUS:${r.id}:${m.modeled?m.reaction.id:m.code}`);
  }
  // review register: invalid records, stale approvals, approvals claimed outside the register
  const reg=parseReviewRegister(kb.register);
  fail.push(...reg.issues);
  const known=new Set(assertions.map(a=>a.id));
  for(const r of reg.records) if(!known.has(r.assertionId)) fail.push(`CHEM_REVIEW_UNKNOWN_ASSERTION:${r.assertionId}`);
  // P1.9 source provenance: every cited source is registered; an approval counts only with acceptable provenance
  const sources=parseSourceRegistry(kb.sourceRegistryRaw);
  fail.push(...sources.issues);
  const provenance=new Map(assertions.map(a=>[a.id,provenanceOf(a.sourceRefs,sources.registry,claimKindOf(a.category))]));
  for(const e of kb.nameProvenance.entries??[]){
    const a=assertions.find(x=>x.id===e.assertionId);
    if(!a){ fail.push(`NAME_PROVENANCE_UNKNOWN:${e.assertionId}`); continue; }
    if((a.data as any)?.name!==e.displayName) fail.push(`NAME_PROVENANCE_MISMATCH:${e.assertionId}`);
  }
  for(const a of assertions){
    const s=reviewStateOf(a,reg.records);
    const p=provenance.get(a.id)!;
    for(const id of p.unregistered) fail.push(`SOURCE_UNREGISTERED:${a.id}:${id}`);
    if(s.state==='stale'&&s.record?.decision==='approve') fail.push(`APPROVAL_STALE:${a.id}`);
    if(s.state==='approved'&&!a.sourceRefs.length) fail.push(`APPROVED_WITHOUT_SOURCE:${a.id}`);
    else if(s.state==='approved'&&!p.acceptable) fail.push(`APPROVED_WITHOUT_ACCEPTABLE_SOURCE:${a.id}`);
    if(!p.acceptable) pending.push(`SOURCE_NOT_ACCEPTABLE:${a.id}`);
    if(a.dataReviewStatus==='approved'&&s.state!=='approved') fail.push(`APPROVAL_NOT_FROM_REGISTER:${a.id}`);
    if(s.state==='pending'||s.state==='stale') pending.push(`REVIEW_PENDING:${a.id}`);
    for(const f of a.flags) if(f==='CHEMISTRY_REVIEW_REQUIRED') pending.push(`CHEMISTRY_REVIEW_REQUIRED:${a.id}`);
  }
  if(!kb.reactions.some(isNoReaction)) pending.push('NO_REACTION_RECORDS_MISSING');
  for(const r of kb.reactions) if(!isNoReaction(r)){ const s=IonicEngine.from({reactions:kb.reactions,rules:kb.solubility}).support(r.id); if(!s.supported) pending.push(`NET_IONIC_UNSUPPORTED:${r.id}:${s.unsupported.join(',')}`); }
  if(kb.speciesNames.reviewStatus!=='approved'||kb.elementNames.reviewStatus!=='approved') pending.push('LOCALIZATION_PENDING');
  return {status:fail.length?'FAIL':pending.length?'PENDING':'PASS',fail:[...new Set(fail)].sort(),pending:[...new Set(pending)].sort()};
}

// ------------------------------------------------------------------ ionic pair coverage (every shelf pair classified)

function neutralCombos(cation:{formula:string;charge:number},anion:{formula:string;charge:number}){
  const g=(a:number,b:number):number=>b?g(b,a%b):a;
  const l=cation.charge*(-anion.charge)/g(cation.charge,-anion.charge);
  const nc=l/cation.charge, na=l/(-anion.charge);
  const atoms:Record<string,number>={};
  for(const [el,n] of Object.entries(parseFormula(cation.formula).atoms)) atoms[el]=(atoms[el]??0)+n*nc;
  for(const [el,n] of Object.entries(parseFormula(anion.formula).atoms)) atoms[el]=(atoms[el]??0)+n*na;
  return atoms;
}
const sameAtoms=(a:Record<string,number>,b:Record<string,number>)=>{const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();return ka.join()===kb.join()&&ka.every(k=>a[k]===b[k]);};

export function ionicPairCoverage(kb:Kb){
  const vocabulary=parseConditionVocabulary(kb.vocabularyRaw);
  const matcher=ReactionMatcher.from(kb.reactions,{vocabulary});
  const species=SpeciesRegistry.from(kb.species);
  const rules=new Map((kb.solubility.dissociation??[]).map((d:any)=>[d.formula,d]));
  const insoluble=(kb.solubility.insoluble??[]).map((f:string)=>({formula:f,atoms:parseFormula(f).atoms}));
  const soluble=(kb.solubility.dissociation??[]).map((d:any)=>({formula:d.formula,atoms:parseFormula(d.formula).atoms}));
  const mixing=vocabulary.contexts['solution-mixing'];
  const ions=(f:string)=>{ const d:any=rules.get(f); if(!d) return null; const ps=d.ions.map((i:any)=>({formula:parseFormula(i.formula).normalized,raw:i.formula,charge:parseFormula(i.formula).charge})); return {cation:ps.find((x:any)=>x.charge>0),anion:ps.find((x:any)=>x.charge<0)}; };
  const name=(atoms:Record<string,number>)=>insoluble.find((x:any)=>sameAtoms(x.atoms,atoms))?.formula??soluble.find((x:any)=>sameAtoms(x.atoms,atoms))?.formula??null;
  const usage=activityUsage(kb);
  return usage.shelves.map(({activityId,shelf,targetReactionId})=>{
    const pairs:any[]=[];
    for(let i=0;i<shelf.length;i++) for(let j=i+1;j<shelf.length;j++){
      const A=species.byId(shelf[i]!)!, B=species.byId(shelf[j]!)!;
      const m=matcher.match({reactants:[{formula:A.formula,phase:'aq'},{formula:B.formula,phase:'aq'}],conditions:{dimensions:{...(mixing?.dimensions??{})}},conditionPolicy:'require-record-conditions'});
      const cls=m.modeled?classifyMatch(m):m.code==='REACTION_CONDITIONS_NOT_MET'?'CONDITION_DEPENDENT':'NOT_MODELED';
      // review candidate from the SOLUBILITY RULES (a suggestion for the reviewer, never canonical truth)
      let candidate:any=null;
      if(cls==='NOT_MODELED'){
        const a=ions(A.formula), b=ions(B.formula);
        if(a&&b&&a.cation&&a.anion&&b.cation&&b.anion){
          const swaps=[[b.cation,a.anion],[a.cation,b.anion]].map(([c,x]:any)=>({ions:`${c.raw} + ${x.raw}`,formula:c.formula==='H'&&x.formula==='OH'?'H2O':name(neutralCombos(c,x)),water:c.formula==='H'&&x.formula==='OH'}));
          const precip=swaps.filter(s=>s.formula&&insoluble.some((x:any)=>x.formula===s.formula));
          const water=swaps.some(s=>s.water);
          const allSoluble=swaps.every(s=>s.formula&&soluble.some((x:any)=>x.formula===s.formula));
          candidate=precip.length||water
            ?{kind:'reaction-candidate',basis:precip.length?`solubility rules list ${precip.map(p=>p.formula).join(', ')} as insoluble`:'H+ and OH- would form water',swaps}
            :allSoluble?{kind:'no-reaction-candidate',basis:'every ion-swap product is listed as soluble (dissociation rules)',swaps}
            :{kind:'unclassifiable',basis:'the solubility rules do not cover every ion-swap product',swaps};
        }else candidate={kind:'unclassifiable',basis:'a reagent has no dissociation rule',swaps:[]};
      }
      pairs.push({reagents:[A.id,B.id],formulas:[A.formula,B.formula],class:cls,reactionId:m.modeled?m.reaction.id:null,coverageCode:m.modeled?null:m.code,currentBehavior:cls==='MODELED_REACTION'?'modeled reaction shown':cls==='MODELED_NO_REACTION'?'modeled no-reaction shown':'fails closed: "modelda yo‘q" (never shown as no reaction)',reviewDecisionRequired:cls==='NOT_MODELED'||cls==='CONDITION_DEPENDENT',candidate});
    }
    const count=(c:string)=>pairs.filter(p=>p.class===c).length;
    return {activityId,targetReactionId,reagents:shelf,pairs,summary:{pairs:pairs.length,MODELED_REACTION:count('MODELED_REACTION'),MODELED_NO_REACTION:count('MODELED_NO_REACTION'),CONDITION_DEPENDENT:count('CONDITION_DEPENDENT'),NOT_MODELED:count('NOT_MODELED'),classified:pairs.length,unclassified:0,reactionCandidates:pairs.filter(p=>p.candidate?.kind==='reaction-candidate').length,noReactionCandidates:pairs.filter(p=>p.candidate?.kind==='no-reaction-candidate').length,unclassifiableCandidates:pairs.filter(p=>p.candidate?.kind==='unclassifiable').length}};
  });
}

/**
 * P1.8: the review candidates of every learner shelf (NOT_MODELED / CONDITION_DEPENDENT pairs) with a stable id and
 * a content hash, so a reviewer's triage decision is pinned to exactly what they saw. Never canonical truth.
 */
export function reviewCandidates(ionic:{shelves:any[]}){
  return ionic.shelves.flatMap((s:any)=>s.pairs.filter((p:any)=>p.reviewDecisionRequired).map((p:any)=>({
    candidateId:`candidate:${s.activityId}:${[...p.reagents].sort().join('+')}`,
    candidateHash:candidateHash({reagents:p.reagents,candidate:p.candidate}),
    badge:CANDIDATE_BADGE,canonical:false,
    pair:p.formulas.join(' + '),reagents:p.reagents,class:p.class,currentBehavior:p.currentBehavior,
    whyNeeded:`both reagents are on the learner shelf of ${s.activityId}; a learner can mix them today and sees “modelda yo‘q”`,
    activitiesAffected:[s.activityId],candidate:p.candidate,
    reviewDecisionRequired:'add a reviewed reaction record, add a reviewed explicit no-reaction record, or confirm it stays not modeled (the agent adds nothing)',
  })));
}

// ------------------------------------------------------------------ electrolysis readiness (data only, no renderer)

export function electrolysisReadiness(kb:Kb){
  const records=kb.electrolysis.records??[];
  const usage=activityUsage(kb);
  const parts=(f:string)=>{ const m=/^([A-Z][a-z]?)(\d*)(.*)$/.exec(f); return {cation:m?.[1]??f,anion:(m?.[3]??'').replace(/^\d+/,'')||'?'}; };
  const dims={
    phase:{values:['aq','l'],covered:[...new Set(records.map((r:any)=>r.phase))]},
    electrode:{values:['inert','active'],covered:[...new Set(records.map((r:any)=>r.electrode))]},
    cation:{covered:[...new Set(records.map((r:any)=>parts(r.electrolyte).cation))]},
    anion:{covered:[...new Set(records.map((r:any)=>parts(r.electrolyte).anion))]},
  };
  const outcomes=new Set(records.map((r:any)=>`${r.cathode.product}|${r.anode.product}`));
  const learnerChoices=Object.entries(dims).filter(([,d]:any)=>d.covered.length>=2).map(([k])=>k);
  // start gate (black-swan): a renderer is model-based only if at least two learner choices each change the modeled
  // outcome — the smallest such design is a 2×2 matrix (two independent choices, two values each) with ≥3 distinct
  // cathode/anode outcomes, so that no single fixed script reproduces the result.
  const gate={
    rule:'≥ 2 independent learner choices with ≥ 2 modeled values each, and ≥ 3 distinct modeled cathode/anode outcomes (smallest non-canned 2×2 design)',
    rationale:'black-swan: with fewer, every learner path ends in the same observation — a canned animation, not a simulation (P1.3 renderer foundation)',
    learnerChoicesWithTwoValues:learnerChoices,
    distinctOutcomes:outcomes.size,
    status:learnerChoices.length>=2&&outcomes.size>=3?'READY':'NOT_READY',
  };
  return {
    schema:'kimyolab.electrolysis-model-readiness.v1',
    records:records.map((r:any)=>({electrolyte:r.electrolyte,phase:r.phase,electrode:r.electrode,cathode:r.cathode,anode:r.anode,sourceRefs:refIds(r.sourceRefs),reviewStatus:r.reviewStatus,usedByActivities:usage.electrolytes(r.electrolyte)})),
    recordCount:records.length,
    dimensions:dims,
    distinctOutcomes:outcomes.size,
    rendererStartGate:gate,
    renderer:'NOT_STARTED (P1.7 scope ban)',
  };
}

// ------------------------------------------------------------------ inventory + coverage

export function buildKbReports(root:string){
  const kb=loadKb(root);
  const assertions=buildAssertions(kb);
  const gate=evaluateGate(kb,assertions);
  const reg=parseReviewRegister(kb.register);
  const states=assertions.map(a=>({a,s:reviewStateOf(a,reg.records).state}));
  const count=(f:(x:{a:any;s:ReviewState})=>boolean)=>states.filter(f).length;
  const ionic=ionicPairCoverage(kb);
  const electrolysis=electrolysisReadiness(kb);
  const vocabulary=parseConditionVocabulary(kb.vocabularyRaw);
  const usage=activityUsage(kb);
  const engine=IonicEngine.from({reactions:kb.reactions,rules:kb.solubility});
  const matcher=ReactionMatcher.from(kb.reactions,{vocabulary});
  const reactionRows=kb.reactions.map(r=>{
    const support=engine.support(r.id);
    return {reactionId:r.id,reactants:r.reactants.map((x:any)=>x.formula),products:r.products.map((x:any)=>x.formula),reactionType:r.reactionType,conditions:{tags:r.conditions?.tags??[],dimensions:dimensionsOf(r.conditions?.tags??[],vocabulary).dimensions},observation:r.observations,netIonicDerivable:support.supported,netIonicUnsupported:support.supported?[]:support.unsupported,sourceRefs:refIds(r.sourceRefs),reviewStatus:reviewStateOf(assertions.find(a=>a.id===`reaction:${r.id}`)!,reg.records).state,usedByActivities:usage.reactions(r.id),observationFlags:assertions.find(a=>a.id===`observation:${r.id}`)!.flags};
  });
  const inventory={
    schema:'kimyolab.chemistry-kb-inventory.v1',
    counts:{
      species:kb.species.length,
      reactions:kb.reactions.length,
      solubilityRecords:{dissociation:(kb.solubility.dissociation??[]).length,insoluble:(kb.solubility.insoluble??[]).length},
      hydrolysisSalts:(kb.hydrolysis.records??[]).length,
      electrolysisRecords:(kb.electrolysis.records??[]).length,
      conditionedReactions:kb.reactions.filter(r=>(r.conditions?.tags??[]).length).length,
      explicitNoReactionRecords:kb.reactions.filter(isNoReaction).length,
      assertions:assertions.length,
      reviewed:count(x=>x.s==='approved'),
      pending:count(x=>x.s==='pending'),
      rejected:count(x=>x.s==='rejected'||x.s==='change_required'),
      stale:count(x=>x.s==='stale'),
      sourceBacked:assertions.filter(a=>a.sourceRefs.length).length,
      missingSource:assertions.filter(a=>!a.sourceRefs.length).length,
    },
    reactions:reactionRows,
    speciesIdentity:{registered:kb.species.length,formulasUnique:new Set(kb.species.map(s=>s.formula)).size===kb.species.length,unregisteredIons:gate.pending.filter(p=>p.startsWith('ION_SPECIES_UNREGISTERED')).map(p=>p.split(':')[1])},
    gate,
  };
  const byCat=Object.fromEntries(ASSERTION_CATEGORIES.map(c=>{const xs=states.filter(x=>x.a.category===c);return [c,{total:xs.length,approved:xs.filter(x=>x.s==='approved').length,pending:xs.filter(x=>x.s==='pending').length,stale:xs.filter(x=>x.s==='stale').length,rejected:xs.filter(x=>x.s==='rejected'||x.s==='change_required').length}];}));
  const pilotUnits=(kb.pilot.learningUnits??[]).map((u:any)=>u.id);
  const pilotImpact=pilotUnits.map((unit:string)=>{
    const activity=kb.mappings.find((m:any)=>m.learningUnitId===unit&&m.role==='primary')?.practiceActivityId;
    const related=assertions.filter(a=>a.affectedActivities.includes(activity));
    const row=(kb.pilotMatrix.rows??[]).find((r:any)=>r.learningUnitId===unit);
    return {learningUnitId:unit,primaryActivity:activity,chemistryAssertions:related.length,pendingChemistryAssertions:related.filter(a=>reviewStateOf(a,reg.records).state!=='approved').length,categories:[...new Set(related.map(a=>a.category))].sort(),pilotStatus:row?.finalPilotStatus??null,technical:row?.technical??null,effectOfP17:'none on status — P1.7 adds review structure and gates; it approves nothing and signs nothing off',signoffByAgent:false};
  });
  const shelfTotals=ionic.reduce((acc:any,s:any)=>{for(const k of ['pairs','MODELED_REACTION','MODELED_NO_REACTION','CONDITION_DEPENDENT','NOT_MODELED']) acc[k]=(acc[k]??0)+s.summary[k];return acc;},{});
  const coverage={
    schema:'kimyolab.chemistry-kb-coverage.v1',
    assertions:{total:assertions.length,approved:count(x=>x.s==='approved'),pending:count(x=>x.s==='pending'),stale:count(x=>x.s==='stale'),rejected:count(x=>x.s==='rejected'||x.s==='change_required'),missingSources:assertions.filter(a=>!a.sourceRefs.length).length,byCategory:byCat},
    reactions:{total:kb.reactions.length,modeledReactions:kb.reactions.filter(r=>!isNoReaction(r)).length,modeledNoReaction:kb.reactions.filter(isNoReaction).length,conditionDependent:kb.reactions.filter(r=>(r.conditions?.tags??[]).length).length,notReviewed:reactionRows.filter(r=>r.reviewStatus!=='approved').length,netIonicDerivable:reactionRows.filter(r=>r.netIonicDerivable).length,observationReviewRequired:reactionRows.filter(r=>r.observationFlags.length).map(r=>r.reactionId)},
    ionic:{shelves:ionic.map((s:any)=>({activityId:s.activityId,...s.summary})),totals:shelfTotals,classifiedShare:'100% (every pair has a class; unknown is shown as NOT_MODELED, never hidden)'},
    hydrolysis:{salts:(kb.hydrolysis.records??[]).length,indicatorMediaCovered:HYDROLYSIS_MEDIA.filter(m=>kb.hydrolysis.indicator?.colors?.[m]).length,indicatorMedia:HYDROLYSIS_MEDIA.length,classificationReviewSeparateFromIndicator:true},
    electrolysis:{records:electrolysis.recordCount,distinctOutcomes:electrolysis.distinctOutcomes,rendererStartGate:electrolysis.rendererStartGate.status},
    localization:{speciesNames:Object.keys(kb.speciesNames.names??{}).length,elementNames:Object.keys(kb.elementNames.names??{}).length,reviewStatus:{species:kb.speciesNames.reviewStatus,elements:kb.elementNames.reviewStatus}},
    pilotImpact,
    globalStrictEnforcement:false,
    gate:{status:gate.status,fail:gate.fail.length,pending:gate.pending.length},
  };
  const ionicReport={schema:'kimyolab.ionic-pair-coverage.v1',semantics:'MODELED_REACTION | MODELED_NO_REACTION | CONDITION_DEPENDENT (a record exists but needs other conditions) | NOT_MODELED (not yet reviewed — never "no reaction"). Candidates come from the solubility rules and are review suggestions only.',shelves:ionic};
  return {kb,assertions,gate,inventory,coverage,ionic:ionicReport,electrolysis,matcher};
}
