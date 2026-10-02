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

/** P2.7: disable a control without dropping keyboard focus to <body>. When the control being disabled holds focus,
 *  focus moves to `fallback()` (the next control or the live result text — made programmatically focusable with
 *  tabindex=-1 if needed), so a keyboard / screen-reader learner keeps a meaningful position after a result update. */
export function setDisabled(control                               ,disabled        ,fallback                                ){
  const doc=(control       ).ownerDocument??(globalThis       ).document;
  const hadFocus=disabled&&!control.disabled&&doc?.activeElement===control;
  control.disabled=disabled;
  if(!hadFocus) return;
  const target=fallback?.();
  if(!target) return;
  if(typeof target.matches==='function'&&!target.matches('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]')) target.setAttribute('tabindex','-1');
  target.focus();
}
