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

export function link(text       ,href       ,className        ){
  return el('a',{text,className,attrs:{href}});
}
