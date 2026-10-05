export type AppRoute =
  | {name:'home'}
  | {name:'curriculum'}
  | {name:'labs'}
  | {name:'external-lab';bindingId:string}
  | {name:'learning-unit';learningUnitId:string}
  | {name:'learning-guide';learningUnitId:string}
  | {name:'learning-practice';learningUnitId:string}
  | {name:'learning-quiz';learningUnitId:string}
  | {name:'practice';practiceActivityId:string}
  | {name:'dynamic-lab';practiceActivityId:string}
  | {name:'worksheet';learningUnitId:string}
  | {name:'progress'}
  | {name:'search'}
  | {name:'periodic';symbol:string|null}
  | {name:'substance';key:string}
  | {name:'reactions'}
  | {name:'not-found';path:string};

export function parseAppRoute(pathname:string):AppRoute {
  const path=(pathname||'/').split('?')[0].split('#')[0]||'/';
  if(path==='/') return {name:'home'};
  if(path==='/curriculum') return {name:'curriculum'};
  if(path==='/labs') return {name:'labs'};
  if(path==='/progress') return {name:'progress'};
  if(path==='/search') return {name:'search'};
  // P2.13: the periodic table and an element's profile (feature flag periodicTableV1; the page checks the flag and the
  // symbol — an unknown symbol is a notice on the page, never a guess)
  const periodic=path.match(/^\/periodic(?:\/([A-Z][a-z]?))?$/);
  if(periodic) return {name:'periodic',symbol:periodic[1]??null};
  // P2.14: the Substance Passport (key = canonical species id without the species. namespace; never a formula) and the
  // Reaction Explorer (state in the query); flags substancePassportV1 / reactionExplorerV1 — the page checks them
  const substance=path.match(/^\/substance\/([a-z0-9][a-z0-9_-]*)$/);
  if(substance) return {name:'substance',key:substance[1]!};
  if(path==='/reactions') return {name:'reactions'};
  const external=path.match(/^\/external-lab\/(ext\.[A-Za-z0-9.-]+)$/);
  if(external) return {name:'external-lab',bindingId:decodeURIComponent(external[1])};
  const worksheet=path.match(/^\/worksheet\/(lu\.(?:7|8|9|10|11)\.[A-Za-z0-9.-]+)$/);
  if(worksheet) return {name:'worksheet',learningUnitId:decodeURIComponent(worksheet[1])};
  const practice=path.match(/^\/practice\/(practice\.(?:experiment|simulation|trainer|calculation|case)\.[A-Za-z0-9.-]+)$/);
  if(practice) return {name:'practice',practiceActivityId:decodeURIComponent(practice[1])};
  // P2.10: guided dynamic lab vertical slices (feature flag guidedDynamicLabV1; the page checks the flag)
  const dynamicLab=path.match(/^\/dynamic-lab\/(practice\.experiment\.[A-Za-z0-9.-]+)$/);
  if(dynamicLab) return {name:'dynamic-lab',practiceActivityId:decodeURIComponent(dynamicLab[1]!)};
  const staged=path.match(/^\/learn\/(lu\.(?:7|8|9|10|11)\.[A-Za-z0-9.-]+)\/(guide|practice|quiz)$/);
  if(staged){
    const learningUnitId=decodeURIComponent(staged[1]);
    if(staged[2]==='guide') return {name:'learning-guide',learningUnitId};
    if(staged[2]==='practice') return {name:'learning-practice',learningUnitId};
    return {name:'learning-quiz',learningUnitId};
  }
  const learning=path.match(/^\/learn\/(lu\.(?:7|8|9|10|11)\.[A-Za-z0-9.-]+)$/);
  if(learning) return {name:'learning-unit',learningUnitId:decodeURIComponent(learning[1])};
  return {name:'not-found',path};
}
