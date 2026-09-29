export function registerNobookPostmate(Postmate        ){
  if(typeof Postmate!=='function') throw new Error('NOBOOK_POSTMATE_INVALID');
  (globalThis       ).__KIMYOLAB_NOBOOK_POSTMATE__=Postmate;
}
