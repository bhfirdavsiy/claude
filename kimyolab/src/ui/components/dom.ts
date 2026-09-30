import {appHref} from '../host-paths.ts';
export function el<K extends keyof HTMLElementTagNameMap>(tag:K,options:{className?:string;text?:string;attrs?:Record<string,string>}={}):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);
  if(options.className) node.className=options.className;
  if(options.text!==undefined) node.textContent=options.text;
  for(const [name,value] of Object.entries(options.attrs??{})) node.setAttribute(name,value);
  return node;
}

export function clear(node:Element){
  while(node.firstChild) node.removeChild(node.firstChild);
}

/** An in-app link takes a LOGICAL href (`/learn/…`); the host mapping turns it into the real href and the logical
 *  route is kept in `data-kl-route` for client-side navigation (P2.2). External hrefs are left as they are. */
export function link(text:string,href:string,className?:string){
  const internal=href.startsWith('/')&&!href.startsWith('//');
  return el('a',{text,className,attrs:{href:appHref(href),...(internal?{'data-kl-route':href}:{})}});
}
