// P2.2 — presentation-level URL resolution. Feature code builds LOGICAL links (`/learn/lu.8.1/practice`) and names
// assets relative to the product root (`assets/home/results.png`); the bootstrap installs the host's mapping once.
// This module does not know which host it runs in — it only applies the mapping it was given. The defaults are the
// root deployment (`/`), which is also what Node tests see.
                                                                                                            
const ROOT          ={href:(h)=>h,asset:(rel)=>`/${rel.replace(/^\/+/,'')}`,api:(rel)=>`/${rel.replace(/^\/+/,'')}`};
let current          =ROOT;
export function configureHostPaths(paths          ){ current=paths; }
export function resetHostPaths(){ current=ROOT; }
/** logical in-app href → the href this host uses; external/fragment hrefs pass through unchanged */
export function appHref(logical       )       { return logical.startsWith('/')&&!logical.startsWith('//')?current.href(logical):logical; }
export function assetUrl(rel       )       { return current.asset(rel); }
export function apiUrl(rel       )       { return current.api(rel); }
