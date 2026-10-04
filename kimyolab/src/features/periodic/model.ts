// P2.13 — view logic of the periodic table page over the Element Hub. Pure: no DOM, no chemistry (every value comes
// from the hub, which the content build derived from canonical sources). Filters only read the hub; an element's
// identity never changes and nothing is remembered beyond the open page.
import type {ElementHub,HubElement,HubField} from './hub.ts';
import type {SearchIndexEntry} from '../search/model.ts';

export interface PeriodicFilters { group:number|null; period:number|null; category:string|null; grade:number|null; hasTopic:boolean; hasLab:boolean }
export const NO_FILTERS:PeriodicFilters=Object.freeze({group:null,period:null,category:null,grade:null,hasTopic:false,hasLab:false});

/** a field's value when it is backed by a source, a derivation or an engine; null for a gap */
export function fieldValue<T>(f:HubField<T>):T|null{ return f.status==='GAP'?null:f.value; }

export function elementBySymbol(hub:ElementHub,symbol:string):HubElement|null{ return hub.elements.find(e=>e.symbol===symbol)??null; }

/** grades of the topics an element is linked to (through its labs), ascending */
export function elementGrades(hub:ElementHub,e:HubElement):number[]{
  const ids=new Set(e.relations.topics.map(t=>t.id));
  return [...new Set(hub.topics.filter(t=>ids.has(t.id)).map(t=>t.grade))].sort((a,b)=>a-b);
}

/** categories that a source actually states (none while no category is authored) */
export function availableCategories(hub:ElementHub):string[]{
  return [...new Set(hub.elements.map(e=>fieldValue(e.category)).filter((c):c is string=>c!==null))].sort((a,b)=>a.localeCompare(b,'uz'));
}
export function availableGrades(hub:ElementHub):number[]{ return [...new Set(hub.topics.map(t=>t.grade))].sort((a,b)=>a-b); }

export function isFiltered(f:PeriodicFilters):boolean{ return f.group!==null||f.period!==null||f.category!==null||f.grade!==null||f.hasTopic||f.hasLab; }

export function matchesFilters(hub:ElementHub,e:HubElement,f:PeriodicFilters):boolean{
  if(f.group!==null&&fieldValue(e.group)!==f.group) return false;
  if(f.period!==null&&fieldValue(e.period)!==f.period) return false;
  if(f.category!==null&&fieldValue(e.category)!==f.category) return false;
  if(f.grade!==null&&!elementGrades(hub,e).includes(f.grade)) return false;
  if(f.hasTopic&&!e.relations.topics.length) return false;
  if(f.hasLab&&!e.relations.labs.length) return false;
  return true;
}

/** Element entries for the existing learner search (one search system): symbol, atomic number and the localized name
 *  (only where the catalog has one) match exactly and rank first; a part of the name matches as text. No name is ever made up for the entry. */
export function elementSearchEntries(hub:ElementHub,nameOf:(symbol:string)=>string|null,label:{kicker:string;description:(z:number)=>string},query:string):SearchIndexEntry[]{
  return hub.elements.map(e=>{
    const name=nameOf(e.symbol);
    return {kind:'element' as const,title:name?`${name} (${e.symbol})`:e.symbol,description:label.description(e.z),href:`/periodic/${e.symbol}${query}`,searchText:name??'',exact:[e.symbol,String(e.z),...(name?[name]:[])],kicker:label.kicker};
  });
}
