// P2.2 — the ONE host boundary (ADR-P2-003). KimyoLab is one product with one runtime, one content pack and one
// persistence engine; it is delivered through different HOSTS:
//   * path host     — served over HTTP at a base path: `/` (local server) or `/kimyolab/` (portal simulation, P3 portal);
//   * embedded host — the single-file standalone presentation artifact (hash routes, embedded content bytes).
// Everything that differs between hosts lives here: URL ↔ logical route mapping, content/asset/API bases, content
// transport and the storage/lock namespace. Domain, runtime, renderers, assessment, mastery and chemistry never import
// this module and never learn which host they run in. Only src/app/bootstrap.ts resolves a host.

                                                                                                                                                        
                                                                               

                               
                         
                                                                                                   
                  
                   
                     
                 
                                                                           
                          
                                                                                          
                                 
                                                                  
                              
                                                                                                       
                              
                                                                                         
                            
                                
                                           
                                                                                                                           
                         
                        
 

export const DEFAULT_STORAGE_NAMESPACE='kimyolab';
const LEGACY_RUNTIME_DB='kimyolab-runtime';
const LEGACY_LOCK_PREFIX='kimyolab.attempt.';

export function normalizeBasePath(value                      )       {
  const raw=String(value??'/').trim()||'/';
  if(!/^\/[A-Za-z0-9._~\-/]*$/.test(raw)||raw.includes('//')||raw.split('/').some(s=>s==='.'||s==='..')) throw new Error(`HOST_BASE_PATH_INVALID:${raw}`);
  return raw.endsWith('/')?raw:`${raw}/`;
}

/** `/` (root deployment, standalone) keeps the historical namespace, so existing learner data stays where it is;
 *  any other mount gets its own namespace, so two deployments on one origin never share a database or a lock. */
export function storageNamespaceFor(basePath       )       {
  const base=normalizeBasePath(basePath);
  return base==='/'?DEFAULT_STORAGE_NAMESPACE:`${DEFAULT_STORAGE_NAMESPACE}@${base}`;
}
/** IndexedDB name. The default namespace maps to the pre-P2.2 name `kimyolab-runtime` exactly (no migration needed). */
export function runtimeDbName(namespace       )       {
  return namespace===DEFAULT_STORAGE_NAMESPACE?LEGACY_RUNTIME_DB:`${namespace}.runtime`;
}
/** Web Locks prefix for practice-attempt liveness. The default namespace keeps `kimyolab.attempt.`. */
export function attemptLockPrefix(namespace       )       {
  return namespace===DEFAULT_STORAGE_NAMESPACE?LEGACY_LOCK_PREFIX:`${namespace}.attempt.`;
}

/** Browser pathname → logical app path, or null when the path is outside this product's base. */
export function toLogicalPath(pathname       ,basePath       )            {
  const base=normalizeBasePath(basePath);
  if(base==='/') return pathname||'/';
  if(pathname===base.slice(0,-1)) return '/';
  if(!pathname.startsWith(base)) return null;
  return `/${pathname.slice(base.length)}`;
}
/** Logical app href (`/learn/x?q=1`) → browser href under the base path (`/kimyolab/learn/x?q=1`). */
export function toHostHref(appHref       ,basePath       )       {
  if(!appHref.startsWith('/')) return appHref;
  const base=normalizeBasePath(basePath);
  return base==='/'?appHref:`${base}${appHref.slice(1)}`;
}
/** Logical app href → standalone hash href (`#/learn/x`). */
export function toHashHref(appHref       )       { return appHref.startsWith('/')?`#${appHref}`:appHref; }

function parseLogical(value       )             {
  const parsed=new URL(value.startsWith('/')?value:'/','https://kimyolab.invalid');
  return {pathname:parsed.pathname,searchParams:parsed.searchParams};
}

                                                                                                                                                                                                    

export function createPathHost(options                                                                       )             {
  const basePath=normalizeBasePath(options.basePath); const {win}=options;
  const listeners                =[];
  const notify=()=>{ for(const l of listeners) l(); };
  win.addEventListener('popstate',notify);
  return {
    kind:'path',basePath,assetBase:basePath,contentBase:`${basePath}content`,apiBase:`${basePath}api/`,storageNamespace:storageNamespaceFor(basePath),
    currentLocation(){ const logical=toLogicalPath(win.location.pathname,basePath); return {...parseLogical(logical??'/__outside__'),searchParams:new URLSearchParams(win.location.search)}; },
    href:(appHref)=>toHostHref(appHref,basePath),
    assetUrl:(rel)=>`${basePath}${rel.replace(/^\/+/,'')}`,
    apiUrl:(rel)=>`${basePath}${rel.replace(/^\/+/,'')}`,
    navigate(appHref){ win.history.pushState({},'',toHostHref(appHref,basePath)); notify(); },
    onLocationChange(listener){ listeners.push(listener); },
    fetchContent:options.fetch,
    ...(options.portalHomeUrl?{portalHomeUrl:options.portalHomeUrl}:{}),
  };
}

/** The standalone content transport: serves the embedded pack bytes under the same `<contentBase>/…` URLs, so the
 *  ContentClient runs the SAME manifest, checksum and version checks (fail-closed) as over HTTP. */
export function embeddedContentFetch(files                                ,contentBase='/content')          {
  const prefix=`${contentBase.replace(/\/$/,'')}/`;
  return async(url)=>{
    const pathname=new URL(url,'https://kimyolab.invalid').pathname;
    const key=pathname.startsWith(prefix)?decodeURIComponent(pathname.slice(prefix.length)):null;
    const found=key!==null&&Object.prototype.hasOwnProperty.call(files,key);
    const body=found?files[key ] :JSON.stringify({error:'NOT_FOUND'});
    return new Response(body,{status:found?200:404,headers:{'Content-Type':'application/json; charset=utf-8'}});
  };
}

export function createEmbeddedHost(options                                                                                                                         )             {
  const {win}=options; const listeners                =[];
  const notify=()=>{ for(const l of listeners) l(); };
  win.addEventListener('hashchange',notify);
  return {
    kind:'embedded',basePath:'/',assetBase:'embedded:',contentBase:'/content',apiBase:'/api/',storageNamespace:DEFAULT_STORAGE_NAMESPACE,
    currentLocation(){ const raw=win.location.hash.startsWith('#')?win.location.hash.slice(1):win.location.hash; return parseLogical(raw&&raw.startsWith('/')?raw:'/'); },
    href:toHashHref,
    // assets are embedded as data: URLs by the standalone build; a missing one is an empty URL, never a site-root path
    assetUrl:(rel)=>options.assets[rel.replace(/^\/+/,'')]??'',
    apiUrl:(rel)=>`/${rel.replace(/^\/+/,'')}`,
    navigate(appHref){ const next=toHashHref(appHref); if(win.location.hash===next) notify(); else win.location.hash=next; },
    onLocationChange(listener){ listeners.push(listener); },
    fetchContent:embeddedContentFetch(options.content),
  };
}

/** Bootstrap-only: the standalone shell provides an embedded host config; an HTTP page declares its base path in
 *  `<meta name="kimyolab-base-path">` (written by the production build). No other module reads either. */
export function resolveHost(globals    ,doc                                                                              ,win                                    )             {
  const embedded=globals.__KIMYOLAB_HOST__;
  if(embedded&&embedded.kind==='embedded') return createEmbeddedHost({content:embedded.content??{},assets:embedded.assets??{},win});
  const meta=doc.querySelector('meta[name="kimyolab-base-path"]')?.getAttribute('content');
  const portalHome=doc.querySelector('meta[name="kimyolab-portal-home"]')?.getAttribute('content')??undefined;
  return createPathHost({basePath:meta??'/',win,fetch:globals.fetch.bind(globals),...(portalHome?{portalHomeUrl:portalHome}:{})});
}
