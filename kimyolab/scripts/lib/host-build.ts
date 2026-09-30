// P2.2 — deployment-time host configuration for the HTTP (path) host. The source shell (index.html) is written for
// the root mount; a subpath deployment rewrites the declared base path and every root-absolute src/href of the shell.
// Logical app routes stay in data-kl-route; the runtime host maps them. The final portal URL is configuration here,
// never core logic.
import {normalizeBasePath} from '../../src/app/host.ts';

export function applyBasePath(html:string,basePath:string):string{
  const base=normalizeBasePath(basePath);
  let out=html.replace(/(<meta\s+name="kimyolab-base-path"\s+content=")[^"]*(")/i,`$1${base}$2`);
  if(!/name="kimyolab-base-path"/.test(out)) throw new Error('HOST_BASE_META_MISSING');
  if(base==='/') return out;
  out=out.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g,(_m,attr,rest)=>`${attr}="${base}${rest}"`);
  return out;
}

/** Root-absolute URLs left in a built shell (must be none outside the base path). */
export function rootAbsoluteUrls(html:string,basePath:string):string[]{
  const base=normalizeBasePath(basePath);
  return [...html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)].map(m=>m[1]!).filter(u=>!u.startsWith(base)&&!u.startsWith('//'));
}
