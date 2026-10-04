// P2.13 — builds the Element Hub (kimyolab.element-hub.v1, ADR-P2-014) from canonical repository sources only.
//   identity      src/domain/chemistry/periodic-table.ts (ELEMENT_SYMBOLS) — the only element list
//   period/group  src/domain/chemistry/periodic-layout.ts (DERIVED_FROM_Z; f-block group stays a gap)
//   e-config      src/domain/chemistry/electron-configuration.ts (ENGINE_COMPUTED inside its proven range only)
//   metadata      content-src/periodic/element-metadata.json (SOURCED entries only; empty = every field a gap)
//   relations     species.json formulas (formula parser) → reactions.json participants → guided-step reaction map
//                 and topic lab profiles (labs) → mapping-links (topics); content-src/periodic/element-relations.json
// No keyword or title matching, no inference: a relation exists only where a canonical record states it.
import fs from 'node:fs';
import path from 'node:path';
import {ELEMENT_SYMBOLS,ELEMENT_SYMBOL_SET} from '../../src/domain/chemistry/periodic-table.ts';
import {chemicalPeriod,displayPosition,groupNumber,isFBlock} from '../../src/domain/chemistry/periodic-layout.ts';
import {electronConfigurationStatus} from '../../src/domain/chemistry/electron-configuration.ts';
import {parseFormula} from '../../src/domain/chemistry/formula-parser.ts';
import {ELEMENT_HUB_SCHEMA,ELEMENT_METADATA_SCHEMA,type ElementHub,type HubElement,type HubField,type HubRelation} from '../../src/features/periodic/hub.ts';
import {compileTopicLabProfiles} from './topic-lab-profiles.ts';

const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
export const METADATA_FIELDS=['relativeAtomicMass','category','oxidationStates','teachingDescription'] as const;
type MetadataField=typeof METADATA_FIELDS[number];

/** Validates the authored metadata file: real symbols, known fields, typed values, at least one source each. */
export function parseElementMetadata(raw:any):Record<string,Partial<Record<MetadataField,{value:unknown;sourceRefs:{id:string;title:string}[];reviewStatus:'pending'|'approved'}>>>{
  if(raw?.schema!==ELEMENT_METADATA_SCHEMA||!raw.entries||typeof raw.entries!=='object'||Array.isArray(raw.entries)) throw new Error('ELEMENT_METADATA_INVALID:schema');
  const ok:Record<MetadataField,(v:unknown)=>boolean>={relativeAtomicMass:v=>typeof v==='number'&&v>0,category:v=>typeof v==='string'&&!!v.trim(),oxidationStates:v=>Array.isArray(v)&&v.length>0&&v.every(Number.isInteger),teachingDescription:v=>typeof v==='string'&&!!v.trim()};
  for(const [symbol,entry] of Object.entries<any>(raw.entries)){
    if(!ELEMENT_SYMBOL_SET.has(symbol)) throw new Error(`ELEMENT_METADATA_INVALID:symbol:${symbol}`);
    for(const [field,f] of Object.entries<any>(entry??{})){
      if(!(METADATA_FIELDS as readonly string[]).includes(field)) throw new Error(`ELEMENT_METADATA_INVALID:field:${symbol}.${field}`);
      if(!ok[field as MetadataField](f?.value)) throw new Error(`ELEMENT_METADATA_INVALID:value:${symbol}.${field}`);
      if(!Array.isArray(f.sourceRefs)||!f.sourceRefs.length||f.sourceRefs.some((s:any)=>!s?.id||!s?.title)) throw new Error(`ELEMENT_METADATA_INVALID:source:${symbol}.${field}`);
      if(f.reviewStatus!=='pending'&&f.reviewStatus!=='approved') throw new Error(`ELEMENT_METADATA_INVALID:review:${symbol}.${field}`);
    }
  }
  return raw.entries;
}

/** Validates the authored relations file (AUTHORED_RELATION); every relation names a real element and a source. */
export function parseElementRelations(raw:any):Array<{element:string;kind:'PRIMARY'|'RELATED';target:string;sourceRefs:{id:string;title:string}[]}>{
  if(raw?.schema!=='kimyolab.element-relations.v1'||!Array.isArray(raw.relations)) throw new Error('ELEMENT_RELATIONS_INVALID:schema');
  for(const r of raw.relations){
    if(!ELEMENT_SYMBOL_SET.has(r?.element)||(r.kind!=='PRIMARY'&&r.kind!=='RELATED')||typeof r.target!=='string'||!Array.isArray(r.sourceRefs)||!r.sourceRefs.length) throw new Error('ELEMENT_RELATIONS_INVALID:relation');
  }
  return raw.relations;
}

/** Elements of a formula by the canonical parser, or null when the text is not a parseable formula. */
export function formulaElements(formula:string):string[]|null{
  try{ return Object.keys(parseFormula(formula).atoms).sort(); }catch{ return null; }
}

export function buildElementHub(root:string):{hub:ElementHub;stats:{unparsedSubstances:string[];unparsedReactionFormulas:string[]}}{
  const metadata=parseElementMetadata(readJson(root,'content-src/periodic/element-metadata.json'));
  const authored=parseElementRelations(readJson(root,'content-src/periodic/element-relations.json'));
  const species=readJson(root,'content-src/chemistry/species.json') as any[];
  const reactions=readJson(root,'content-src/chemistry/reactions.json') as any[];
  const stepMap=readJson(root,'content-src/chemistry/guided-step-reaction-map.json') as Record<string,Record<string,string|string[]>>;
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const mappings=readJson(root,'content-src/mapping-links.json') as any[];
  const units=readJson(root,'content-src/learning-units.json') as any[];
  const {profiles}=compileTopicLabProfiles(root);

  // substances: canonical species whose formula the parser reads
  const unparsedSubstances:string[]=[];
  const substanceElements=new Map<string,string[]>();
  for(const s of species){ const els=formulaElements(s.formula); if(els) substanceElements.set(s.id,els); else unparsedSubstances.push(s.id); }

  // reactions: the elements of their participants' formulas
  const unparsedReactionFormulas:string[]=[];
  const reactionElements=new Map<string,string[]>();
  for(const r of reactions){
    const els=new Set<string>();
    for(const part of [...r.reactants,...r.products]){
      const e=formulaElements(part.formula); if(e) e.forEach(x=>els.add(x)); else unparsedReactionFormulas.push(`${r.id}:${part.formula}`);
    }
    reactionElements.set(r.id,[...els].sort());
  }

  // labs: species on a topic lab profile's shelf, reactions in the guided-step reaction map
  const labSpecies=new Map<string,Set<string>>(), labReactions=new Map<string,Set<string>>();
  const add=(m:Map<string,Set<string>>,k:string,v:string)=>{ if(!m.has(k)) m.set(k,new Set()); m.get(k)!.add(v); };
  for(const p of profiles) for(const s of p.substances??[]) if(s.speciesId&&substanceElements.has(s.speciesId)) add(labSpecies,p.activityId,s.speciesId);
  for(const [activityId,steps] of Object.entries(stepMap)) for(const v of Object.values(steps)) for(const rid of [v].flat()) if(reactionElements.has(rid)) add(labReactions,activityId,rid);
  const labIds=[...new Set([...labSpecies.keys(),...labReactions.keys()])].filter(id=>activities.some(a=>a.id===id)).sort();
  const labTopics=new Map(labIds.map(id=>[id,[...new Set(mappings.filter(m=>m.practiceActivityId===id).map(m=>m.learningUnitId))].sort()]));
  const topicIds=new Set([...labTopics.values()].flat());

  const field=<T,>(symbol:string,name:MetadataField):HubField<T>=>{
    const f=metadata[symbol]?.[name];
    return f?{status:'SOURCED',value:f.value as T,sourceRefs:f.sourceRefs,review:f.reviewStatus}:{status:'GAP',reason:'SOURCE_REQUIRED'};
  };
  const rel=(id:string,provenance:HubRelation['provenance'],via:string[]=[],kind:HubRelation['kind']='PARTICIPATES'):HubRelation=>({id,kind,provenance,via:[...via].sort()});

  const elements:HubElement[]=ELEMENT_SYMBOLS.map((symbol,i)=>{
    const z=i+1, pos=displayPosition(z), g=groupNumber(z), ec=electronConfigurationStatus(z);
    const subs=[...substanceElements].filter(([,els])=>els.includes(symbol)).map(([id])=>id).sort();
    const rxns=[...reactionElements].filter(([,els])=>els.includes(symbol)).map(([id])=>id).sort();
    const labs=labIds.map(id=>({id,via:[...[...(labSpecies.get(id)??[])].filter(s=>subs.includes(s)),...[...(labReactions.get(id)??[])].filter(r=>rxns.includes(r))]})).filter(l=>l.via.length);
    const topics=new Map<string,string[]>();
    for(const l of labs) for(const t of labTopics.get(l.id)??[]){ if(!topics.has(t)) topics.set(t,[]); topics.get(t)!.push(l.id); }
    return {
      z,symbol,display:{row:pos.row,column:pos.column},
      period:{status:'DERIVED',value:chemicalPeriod(z),provenance:'DERIVED_FROM_Z',review:'NOT_REVIEWED'},
      group:g===null?{status:'GAP',reason:isFBlock(z)?'F_BLOCK_GROUP_CONVENTION':'SOURCE_REQUIRED'}:{status:'DERIVED',value:g,provenance:'DERIVED_FROM_Z',review:'NOT_REVIEWED'},
      relativeAtomicMass:field<number>(symbol,'relativeAtomicMass'),
      category:field<string>(symbol,'category'),
      electronConfiguration:ec.status==='COMPUTED'?{status:'DERIVED',value:ec.value,provenance:'ENGINE_COMPUTED',review:'NOT_REVIEWED'}:{status:'GAP',reason:ec.reason},
      oxidationStates:field<number[]>(symbol,'oxidationStates'),
      teachingDescription:field<string>(symbol,'teachingDescription'),
      relations:{
        substances:subs.map(id=>rel(id,'DERIVED_FROM_FORMULA')),
        reactions:rxns.map(id=>rel(id,'DERIVED_FROM_FORMULA')),
        labs:labs.map(l=>rel(l.id,'EXPLICIT_MAPPING',l.via)),
        topics:[...topics].sort(([a],[b])=>a.localeCompare(b)).map(([id,via])=>rel(id,'EXPLICIT_MAPPING',via)),
        authored:authored.filter(r=>r.element===symbol).map(r=>rel(r.target,'AUTHORED_RELATION',[],r.kind)),
      },
    };
  });
  const usedSubs=new Set(elements.flatMap(e=>e.relations.substances.map(r=>r.id)));
  const usedRx=new Set(elements.flatMap(e=>e.relations.reactions.map(r=>r.id)));
  const hub:ElementHub={
    schema:ELEMENT_HUB_SCHEMA,metadataSchema:ELEMENT_METADATA_SCHEMA,elements,
    substances:species.filter(s=>usedSubs.has(s.id)).map(s=>({id:s.id,formula:s.formula,nameKey:s.nameKey})),
    reactions:reactions.filter(r=>usedRx.has(r.id)).map(r=>({id:r.id,equation:r.molecularEquation})),
    labs:labIds.map(id=>({id,title:activities.find(a=>a.id===id)!.title})),
    topics:units.filter(u=>topicIds.has(u.id)).map(u=>({id:u.id,grade:Number(u.grade),title:u.title})),
  };
  return {hub,stats:{unparsedSubstances,unparsedReactionFormulas}};
}
