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

export function link(text:string,href:string,className?:string){
  return el('a',{text,className,attrs:{href}});
}
