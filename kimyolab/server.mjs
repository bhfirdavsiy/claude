import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const nobookFrameSource=process.env.NOBOOK_FRAME_SOURCE || 'https://*.nobook.com';
const csp=`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src ${nobookFrameSource}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`;
const securityHeaders = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
};
function headers(contentType) {return contentType ? {...securityHeaders, 'Content-Type': contentType} : securityHeaders;}
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2'};
function isInsideRoot(filePath) {const relative=path.relative(root,filePath);return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);}
function isInternalPath(filePath) {const relative=path.relative(root,filePath);return relative==='source'||relative.startsWith(`source${path.sep}`);}
function json(res,status,value){res.writeHead(status,headers('application/json; charset=utf-8'));res.end(JSON.stringify(value));}
async function readJsonBody(req,limit=32_768){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('BODY_TOO_LARGE');chunks.push(chunk);}return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};}
const nobookSdkPath=path.join(root,'public','vendor','nobook','postmate.js');
function nobookPartnerConfigured(){return Boolean(process.env.NOBOOK_APP_KEY&&process.env.NOBOOK_APP_SECRET&&process.env.NOBOOK_PID_SCOPE&&process.env.NOBOOK_EXPERIMENT_URL);}
function nobookSdkReady(){return fs.existsSync(nobookSdkPath);}
function nobookSdkChecksum(){if(!nobookSdkReady())return null;return crypto.createHash('sha256').update(fs.readFileSync(nobookSdkPath)).digest('hex');}
function nobookSdkChecksumValid(){const expected=process.env.NOBOOK_SDK_SHA256;return Boolean(expected&&/^[a-f0-9]{64}$/i.test(expected)&&nobookSdkChecksum()===expected.toLowerCase());}
function nobookConfigured(){return nobookPartnerConfigured()&&nobookSdkReady()&&nobookSdkChecksumValid();}
function nobookMissingConfig(){const missing=[];if(!process.env.NOBOOK_APP_KEY)missing.push('NOBOOK_APP_KEY');if(!process.env.NOBOOK_APP_SECRET)missing.push('NOBOOK_APP_SECRET');if(!process.env.NOBOOK_PID_SCOPE)missing.push('NOBOOK_PID_SCOPE');if(!process.env.NOBOOK_EXPERIMENT_URL)missing.push('NOBOOK_EXPERIMENT_URL');if(!nobookSdkReady())missing.push('NOBOOK_SDK_ARTIFACT');if(!process.env.NOBOOK_SDK_SHA256)missing.push('NOBOOK_SDK_SHA256');return missing;}
function validateNobookExperimentUrl(){const raw=process.env.NOBOOK_EXPERIMENT_URL;if(!raw)return false;try{const url=new URL(raw);return url.protocol==='https:'&&(url.hostname==='nobook.com'||url.hostname.endsWith('.nobook.com'));}catch{return false;}}
async function nobookAuth(uniqueId){
  const app_key=process.env.NOBOOK_APP_KEY;const app_secret=process.env.NOBOOK_APP_SECRET;const pid_scope=process.env.NOBOOK_PID_SCOPE;const version=process.env.NOBOOK_SDK_VERSION||'2.2.1';
  if(!app_key||!app_secret||!pid_scope) throw new Error('NOBOOK_CREDENTIALS_MISSING');
  const timestamp=Math.round(Date.now()/1000);const sign=crypto.createHash('md5').update(`${app_key}${app_secret}${pid_scope}${timestamp}${uniqueId}${version}`).digest('hex');
  const response=await fetch('https://nbapi.nobook.com/v1/auth',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({app_key,pid_scope,timestamp,unique_id:uniqueId,version,sign})});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`NOBOOK_AUTH_HTTP_${response.status}`);return body;
}
async function handleApi(req,res,requestPath){
  if(requestPath==='/api/external-labs/nobook/status'&&req.method==='GET'){json(res,200,{configured:nobookConfigured()&&validateNobookExperimentUrl(),partnerConfigured:nobookPartnerConfigured(),sdkReady:nobookSdkReady(),sdkChecksumValid:nobookSdkChecksumValid(),experimentUrlValid:validateNobookExperimentUrl(),sdkVersion:process.env.NOBOOK_SDK_VERSION||'2.2.1'});return true;}
  if(requestPath==='/api/external-labs/status'&&req.method==='GET'){json(res,200,{providers:{nobook:{configured:nobookConfigured()&&validateNobookExperimentUrl(),partnerConfigured:nobookPartnerConfigured(),sdkReady:nobookSdkReady(),sdkChecksumValid:nobookSdkChecksumValid(),experimentUrlValid:validateNobookExperimentUrl()},chemai:{configured:true,mode:'deep-link'},'chem-lab-station':{configured:true,mode:'reference'}}});return true;}
  if(requestPath==='/api/external-labs/nobook/auth'&&req.method==='POST'){
    if(!process.env.NOBOOK_APP_KEY||!process.env.NOBOOK_APP_SECRET||!process.env.NOBOOK_PID_SCOPE){json(res,503,{error:'NOBOOK_CREDENTIALS_MISSING'});return true;}
    try{const body=await readJsonBody(req);const uniqueId=String(body.uniqueId||'kimyolab-anonymous').replace(/[^A-Za-z0-9._-]/g,'').slice(0,80)||'kimyolab-anonymous';json(res,200,await nobookAuth(uniqueId));}catch(error){json(res,502,{error:error instanceof Error?error.message:'NOBOOK_AUTH_FAILED'});}return true;
  }
  if(requestPath==='/api/external-labs/nobook/session'&&req.method==='POST'){
    if(!nobookConfigured()||!validateNobookExperimentUrl()){json(res,503,{error:'NOBOOK_PARTNER_CONFIGURATION_REQUIRED'});return true;}
    try{const body=await readJsonBody(req);const moduleId=Number(body.moduleId);if(![9,10,27].includes(moduleId)){json(res,400,{error:'NOBOOK_MODULE_INVALID'});return true;}const uniqueId=String(body.learningUnitId||'kimyolab-anonymous').replace(/[^A-Za-z0-9._-]/g,'').slice(0,80);const auth=await nobookAuth(uniqueId);json(res,200,{experimentalUrl:process.env.NOBOOK_EXPERIMENT_URL,moduleId,authAvailable:Boolean(auth)});}catch(error){json(res,502,{error:error instanceof Error?error.message:'NOBOOK_SESSION_FAILED'});}return true;
  }
  return false;
}

http.createServer(async(req,res)=>{
  let requestPath;try{requestPath=decodeURIComponent((req.url||'/').split('?')[0]);}catch{res.writeHead(400,headers());res.end('Bad request');return;}
  if(requestPath.startsWith('/api/')){if(await handleApi(req,res,requestPath))return;json(res,404,{error:'API_NOT_FOUND'});return;}
  if(requestPath==='/'||requestPath==='/curriculum'||requestPath==='/labs'||requestPath.startsWith('/external-lab/')||requestPath.startsWith('/learn/')||requestPath.startsWith('/practice/')||requestPath.startsWith('/worksheet/')||requestPath==='/progress'||requestPath==='/search') requestPath='/index.html';
  if(requestPath.startsWith('/content/')||requestPath.startsWith('/app-preview/')) requestPath=`/public${requestPath}`;
  const filePath=path.normalize(path.join(root,requestPath));
  if(!isInsideRoot(filePath)){res.writeHead(403,headers());res.end('Forbidden');return;}
  if(isInternalPath(filePath)){res.writeHead(404,headers());res.end('Not found');return;}
  fs.readFile(filePath,(error,body)=>{if(error){res.writeHead(404,headers());res.end('Not found');return;}res.writeHead(200,headers(types[path.extname(filePath)]||'application/octet-stream'));res.end(body);});
}).listen(4173,process.env.HOST||'127.0.0.1',()=>{console.log(`KimyoLab v20 Sinco: http://${process.env.HOST||'127.0.0.1'}:4173`);});
