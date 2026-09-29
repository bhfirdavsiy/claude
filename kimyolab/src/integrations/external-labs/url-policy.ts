// Canonical external lab URL policy (P0.11).
// The SAME function is used by the content build validator, the browser runtime
// (binding validation) and the server API. HTTPS alone is not sufficient: every
// provider has an explicit host allow-list.

export type ExternalLabUrlProvider='nobook'|'chemai'|'chem-lab-station';

interface ProviderUrlPolicy {
  /** Exact hostnames that are approved. */
  hosts:readonly string[];
  /** Registrable domains owned by the partner; any subdomain is approved. Never use shared hosting domains here. */
  partnerDomains:readonly string[];
}

export const EXTERNAL_LAB_URL_POLICY:Readonly<Record<ExternalLabUrlProvider,ProviderUrlPolicy>>=Object.freeze({
  // NOBOOK partner experiment/SDK hosts live on the partner-owned nobook.com domain.
  nobook:{hosts:['nobook.com'],partnerDomains:['nobook.com']},
  chemai:{hosts:['chemai.in'],partnerDomains:[]},
  // vercel.app is shared hosting: only the exact approved deployment is allowed.
  'chem-lab-station':{hosts:['chemlaboratory.vercel.app'],partnerDomains:[]},
});

export type ExternalLabUrlVerdict =
  | {ok:true;url:string;host:string}
  | {ok:false;code:'EXTERNAL_URL_INVALID'|'EXTERNAL_URL_PROVIDER_UNKNOWN'|'EXTERNAL_URL_NOT_HTTPS'|'EXTERNAL_URL_CREDENTIALS'|'EXTERNAL_URL_PORT'|'EXTERNAL_URL_HOST_NOT_ALLOWED'};

function isIpLiteral(host:string){return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)||host.startsWith('[');}

export function validateExternalLabUrl(provider:string,rawUrl:unknown):ExternalLabUrlVerdict{
  const policy=(EXTERNAL_LAB_URL_POLICY as Record<string,ProviderUrlPolicy|undefined>)[provider];
  if(!policy||!Object.prototype.hasOwnProperty.call(EXTERNAL_LAB_URL_POLICY,provider)) return {ok:false,code:'EXTERNAL_URL_PROVIDER_UNKNOWN'};
  if(typeof rawUrl!=='string'||rawUrl.length===0||rawUrl.length>2048||/[\s\u0000-\u001f\\]/.test(rawUrl)) return {ok:false,code:'EXTERNAL_URL_INVALID'};
  let url:URL;
  try{url=new URL(rawUrl);}catch{return {ok:false,code:'EXTERNAL_URL_INVALID'};}
  if(url.protocol!=='https:') return {ok:false,code:'EXTERNAL_URL_NOT_HTTPS'};
  if(url.username||url.password) return {ok:false,code:'EXTERNAL_URL_CREDENTIALS'};
  if(url.port!=='') return {ok:false,code:'EXTERNAL_URL_PORT'};
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||isIpLiteral(host)) return {ok:false,code:'EXTERNAL_URL_HOST_NOT_ALLOWED'};
  const allowed=policy.hosts.includes(host)||policy.partnerDomains.some(domain=>host.endsWith(`.${domain}`));
  if(!allowed) return {ok:false,code:'EXTERNAL_URL_HOST_NOT_ALLOWED'};
  return {ok:true,url:url.href,host};
}

/** CSP frame-src sources derived from the same policy (used by the server). */
export function frameSourcesFor(provider:ExternalLabUrlProvider):string[]{
  const policy=EXTERNAL_LAB_URL_POLICY[provider];
  return [...policy.hosts.map(h=>`https://${h}`),...policy.partnerDomains.map(d=>`https://*.${d}`)];
}
