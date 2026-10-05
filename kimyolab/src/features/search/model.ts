// P2.13: element entries join the SAME learner search (no second search system). An entry may name `exact` terms
// (an element's symbol and atomic number) that score only on an exact match, so "11" finds sodium by its number
// and "Na" by its symbol without every text that merely contains those characters ranking above it.
export interface SearchIndexEntry {kind:'topic'|'practice'|'element';title:string;description:string;href:string;searchText:string;grade?:number;exact?:string[];kicker?:string;}
export interface SearchResult {kind:'topic'|'practice'|'element';title:string;description:string;href:string;grade?:number;kicker?:string;}
function normalize(value:string){return value.toLocaleLowerCase('uz-Latn').normalize('NFKD').replace(/[ʻ’‘`]/g,"'").trim();}
export function searchStudentContent(query:string,index:SearchIndexEntry[],limit=20):SearchResult[]{
  const q=normalize(query); if(!q) return [];
  const terms=q.split(/\s+/).filter(Boolean);
  return index.map(entry=>{const hay=normalize(`${entry.title} ${entry.description} ${entry.searchText}`);const hits=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0);const titleBoost=terms.reduce((n,t)=>n+(normalize(entry.title).includes(t)?2:0),0);const exact=(entry.exact??[]).map(normalize);const exactBoost=terms.reduce((n,t)=>n+(exact.includes(t)?10:0),0);
      // an element entry scores by its exact symbol / number or by its localized name, never by its description text
      const score=entry.kind==='element'?exactBoost+(normalize(entry.searchText)&&terms.some(t=>normalize(entry.searchText).includes(t))?titleBoost+1:0):hits+titleBoost;
      return {entry,score};})
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title,'uz')).slice(0,limit)
    .map(({entry})=>({kind:entry.kind,title:entry.title,description:entry.description,href:entry.href,grade:entry.grade,...(entry.kicker?{kicker:entry.kicker}:{})}));
}
