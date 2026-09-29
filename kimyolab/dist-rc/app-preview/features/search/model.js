                                                                                                                                        
                                                                                                                  
function normalize(value       ){return value.toLocaleLowerCase('uz-Latn').normalize('NFKD').replace(/[ʻ’‘`]/g,"'").trim();}
export function searchStudentContent(query       ,index                   ,limit=20)               {
  const q=normalize(query); if(!q) return [];
  const terms=q.split(/\s+/).filter(Boolean);
  return index.map(entry=>{const hay=normalize(`${entry.title} ${entry.description} ${entry.searchText}`);const hits=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0);const titleBoost=terms.reduce((n,t)=>n+(normalize(entry.title).includes(t)?2:0),0);return {entry,score:hits+titleBoost};})
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title,'uz')).slice(0,limit)
    .map(({entry})=>({kind:entry.kind,title:entry.title,description:entry.description,href:entry.href,grade:entry.grade}));
}
