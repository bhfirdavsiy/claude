export function registerNobookPostmate(Postmate:unknown){
  if(typeof Postmate!=='function') throw new Error('NOBOOK_POSTMATE_INVALID');
  (globalThis as any).__KIMYOLAB_NOBOOK_POSTMATE__=Postmate;
}
