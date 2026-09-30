import {appHref} from '../host-paths.js';
export function el                                       (tag  ,options                                                              ={})                         {
  const node=document.createElement(tag);
  if(options.className) node.className=options.className;
  if(options.text!==undefined) node.textContent=options.text;
  for(const [name,value] of Object.entries(options.attrs??{})) node.setAttribute(name,value);
  return node;
}

export function clear(node        ){
  while(node.firstChild) node.removeChild(node.firstChild);
}

/** An in-app link takes a LOGICAL href (`/learn/…`); the host mapping turns it into the real href and the logical
 *  route is kept in `data-kl-route` for client-side navigation (P2.2). External hrefs are left as they are. */
export function link(text       ,href       ,className        ){
  const internal=href.startsWith('/')&&!href.startsWith('//');
  return el('a',{text,className,attrs:{href:appHref(href),...(internal?{'data-kl-route':href}:{})}});
}
