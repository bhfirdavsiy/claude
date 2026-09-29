// P0.10 / P0.13 / P0.14 — external lab API abuse, validation and error semantics.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {startServer,cloneDist,rawRequest} from '../helpers/dist.mjs';

const SESSION='/api/external-labs/nobook/session';
const good={bindingId:'ext.nobook.electrochem',learningUnitId:'lu.9.15'};
function post(server,body,{origin=server.url,type='application/json',raw}={}){
  const headers={}; if(origin) headers.origin=origin; if(type) headers['content-type']=type;
  return fetch(`${server.url}${SESSION}`,{method:'POST',headers,body:raw??JSON.stringify(body)});
}
async function expectError(response,status,code){
  assert.equal(response.status,status);
  const body=await response.json();
  assert.equal(body.code,code);
  assert.equal(typeof body.message,'string');
  assert.match(body.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get('x-request-id'),body.requestId);
  return body;
}

let server;
test.before(async()=>{server=await startServer({env:{KIMYOLAB_SESSION_RATE_LIMIT:'1000'}});});
test.after(async()=>{await server.close();});

test('the browser-facing /auth endpoint no longer exists',async()=>{
  await expectError(await post(server,{},{raw:'{}'}).then(()=>fetch(`${server.url}/api/external-labs/nobook/auth`,{method:'POST',headers:{origin:server.url,'content-type':'application/json'},body:'{}'})),404,'API_NOT_FOUND');
});
test('missing Origin → 403',async()=>{await expectError(await post(server,good,{origin:null}),403,'ORIGIN_REQUIRED');});
test('foreign Origin → 403',async()=>{await expectError(await post(server,good,{origin:'https://evil.example'}),403,'ORIGIN_FORBIDDEN');});
test('wrong content type → 400',async()=>{await expectError(await post(server,good,{type:'text/plain'}),400,'CONTENT_TYPE_UNSUPPORTED');});
test('invalid JSON → 400',async()=>{await expectError(await post(server,null,{raw:'{"bindingId":'}),400,'JSON_INVALID');});
test('non-object JSON → 400',async()=>{await expectError(await post(server,[1,2]),400,'JSON_OBJECT_REQUIRED');});
test('oversized payload → 413',async()=>{await expectError(await post(server,{bindingId:'x'.repeat(10_000)}),413,'PAYLOAD_TOO_LARGE');});
test('client cannot choose provider/module → 422',async()=>{
  await expectError(await post(server,{...good,moduleId:9}),422,'REQUEST_FIELD_NOT_ALLOWED');
  await expectError(await post(server,{...good,provider:'nobook'}),422,'REQUEST_FIELD_NOT_ALLOWED');
});
test('malformed ids → 422',async()=>{await expectError(await post(server,{bindingId:'../../etc',learningUnitId:'lu.7.01'}),422,'REQUEST_FIELD_INVALID');});
test('unknown binding → 422',async()=>{await expectError(await post(server,{...good,bindingId:'ext.nobook.unknown'}),422,'BINDING_UNKNOWN');});
test('binding of another provider → 422',async()=>{await expectError(await post(server,{bindingId:'ext.chemai.rate',learningUnitId:'lu.8.19'}),422,'BINDING_PROVIDER_MISMATCH');});
test('learning unit not bound to the lab → 422',async()=>{await expectError(await post(server,{...good,learningUnitId:'lu.7.01'}),422,'BINDING_LEARNING_UNIT_MISMATCH');});
test('valid request without partner configuration → 503',async()=>{await expectError(await post(server,good),503,'NOBOOK_PARTNER_CONFIGURATION_REQUIRED');});
test('wrong method on a known endpoint → 405 with Allow',async()=>{
  const r=await fetch(`${server.url}${SESSION}`);
  await expectError(r,405,'METHOD_NOT_ALLOWED');
  assert.equal(r.headers.get('allow'),'POST');
});
test('unknown API → 404 JSON',async()=>{await expectError(await fetch(`${server.url}/api/nope`),404,'API_NOT_FOUND');});
test('status endpoints expose booleans only, never secret values',async()=>{
  const s=await startServer({env:{NOBOOK_APP_KEY:'key-123',NOBOOK_APP_SECRET:'secret-456',NOBOOK_PID_SCOPE:'scope',NOBOOK_EXPERIMENT_URL:'https://school.nobook.com/lab'}});
  try{
    const text=await (await fetch(`${s.url}/api/external-labs/status`)).text();
    assert.doesNotMatch(text,/key-123|secret-456|scope/);
  }finally{await s.close();}
});

test('rate limiting → 429 with Retry-After',async()=>{
  const s=await startServer({env:{KIMYOLAB_SESSION_RATE_LIMIT:'3'}});
  try{
    for(let i=0;i<3;i++) assert.notEqual((await post(s,good)).status,429);
    const r=await post(s,good);
    await expectError(r,429,'RATE_LIMITED');
    assert.ok(Number(r.headers.get('retry-after'))>=1);
  }finally{await s.close();}
});

async function configuredServer(upstream){
  const dist=cloneDist();
  const sdk=path.join(dist,'vendor','nobook','postmate.js');
  fs.mkdirSync(path.dirname(sdk),{recursive:true}); fs.writeFileSync(sdk,'export default class Postmate{}');
  const env={NOBOOK_APP_KEY:'key-123',NOBOOK_APP_SECRET:'secret-456',NOBOOK_PID_SCOPE:'scope-789',NOBOOK_EXPERIMENT_URL:'https://school.nobook.com/lab',NOBOOK_SDK_SHA256:crypto.createHash('sha256').update(fs.readFileSync(sdk)).digest('hex')};
  const calls=[];
  const s=await startServer({publicRoot:dist,env,fetchImpl:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return upstream();}});
  return {s,calls};
}

test('configured session derives module from the binding and never returns partner secrets',async()=>{
  const {s,calls}=await configuredServer(()=>new Response(JSON.stringify({token:'partner-token-SECRET'}),{status:200}));
  try{
    const r=await post(s,good);
    assert.equal(r.status,200);
    const text=await r.text();
    assert.deepEqual(JSON.parse(text),{experimentalUrl:'https://school.nobook.com/lab',moduleId:27,bindingId:'ext.nobook.electrochem'});
    assert.doesNotMatch(text,/partner-token|secret-456|key-123/);
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://nbapi.nobook.com/v1/auth');
    assert.equal('app_secret' in calls[0].body,false,'secret is only used for the signature');
  }finally{await s.close();}
});

test('upstream provider failure → 502',async()=>{
  const {s}=await configuredServer(()=>new Response('{}',{status:500}));
  try{await expectError(await post(s,good),502,'UPSTREAM_REJECTED');}finally{await s.close();}
});

test('tampered external-lab-bindings in the served pack → 500 CONTENT_INTEGRITY_ERROR (fail closed)',async()=>{
  const dist=cloneDist();
  const pointer=JSON.parse(fs.readFileSync(path.join(dist,'content','manifest.json'),'utf8'));
  const file=path.join(dist,'content',pointer.activeVersion,'external-lab-bindings.json');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('"lu.9.15"','"lu.7.01"'));
  const s=await startServer({publicRoot:dist});
  try{await expectError(await post(s,good),500,'CONTENT_INTEGRITY_ERROR');}finally{await s.close();}
});

test('API logs carry requestId/code but no request bodies or client addresses',async()=>{
  await post(server,{...good,note:'PII-Ali-Valiyev'});
  const last=server.logs.at(-1);
  assert.equal(last.route,SESSION);
  assert.equal(last.code,'REQUEST_FIELD_NOT_ALLOWED');
  assert.doesNotMatch(JSON.stringify(server.logs),/PII-Ali-Valiyev|127\.0\.0\.1/);
});

test('malformed percent-encoding on the API path → 400',async()=>{
  assert.equal((await rawRequest(server.url,'/api/%E0%A4%A')).status,400);
});
