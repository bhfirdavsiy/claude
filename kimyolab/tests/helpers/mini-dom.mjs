// Minimal DOM for host unit tests (no jsdom dependency): enough of Element/document for src/ui/components/dom.ts
// and the practice host — createElement, append, removeChild, attributes, dataset, textContent, querySelector
// by [attr] / [attr="v"] / .class / tag.
class Node_ {
  constructor(tag){ this.tagName=String(tag).toUpperCase(); this.childNodes=[]; this.parentNode=null; this.attributes=new Map(); this.dataset={}; this.className=''; this._text=''; this.listeners={}; this.disabled=false; }
  get firstChild(){ return this.childNodes[0]??null; }
  get firstElementChild(){ return this.childNodes[0]??null; }
  get childElementCount(){ return this.childNodes.length; }
  get children(){ return this.childNodes; }
  append(...nodes){ for(const n of nodes){ if(typeof n==='string'){ const t=new Node_('#text'); t._text=n; this.childNodes.push(t); t.parentNode=this; continue; } n.parentNode?.removeChild(n); this.childNodes.push(n); n.parentNode=this; } }
  appendChild(n){ this.append(n); return n; }
  removeChild(n){ const i=this.childNodes.indexOf(n); if(i<0) throw new Error('NotFoundError'); this.childNodes.splice(i,1); n.parentNode=null; return n; }
  remove(){ this.parentNode?.removeChild(this); }
  setAttribute(k,v){ this.attributes.set(k,String(v)); if(k==='id') this.id=String(v); }
  getAttribute(k){ return this.attributes.has(k)?this.attributes.get(k):null; }
  hasAttribute(k){ return this.attributes.has(k); }
  addEventListener(type,fn){ (this.listeners[type]??=[]).push(fn); }
  dispatch(type){ for(const fn of this.listeners[type]??[]) fn({type,target:this,preventDefault(){}}); }
  click(){ if(!this.disabled) this.dispatch('click'); }
  get textContent(){ return this.tagName==='#TEXT'?this._text:this._text+this.childNodes.map(c=>c.textContent).join(''); }
  set textContent(v){ this.childNodes=[]; this._text=String(v??''); }
  matches(sel){
    let m;
    if((m=/^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel))){ const key=m[1]; const dataKey=key.startsWith('data-')?key.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase()):null; const v=dataKey&&dataKey in this.dataset?this.dataset[dataKey]:this.getAttribute(key); return v!==null&&v!==undefined&&(m[2]===undefined||v===m[2]); }
    if(sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    if(sel.startsWith('#')) return this.getAttribute('id')===sel.slice(1);
    return this.tagName===sel.toUpperCase();
  }
  querySelectorAll(sel){ const out=[]; const walk=(n)=>{ for(const c of n.childNodes){ if(c.tagName!=='#TEXT'&&c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel){ return this.querySelectorAll(sel)[0]??null; }
}
export function installMiniDom(){
  const previous=globalThis.document;
  globalThis.document={createElement:(tag)=>new Node_(tag)};
  return {root:new Node_('main'),restore(){ if(previous===undefined) delete globalThis.document; else globalThis.document=previous; }};
}
