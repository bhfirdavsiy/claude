import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function get(url){for(let i=0;i<40;i++){try{return await fetch(url);}catch{await sleep(75)}}throw new Error('server unavailable');}
test('app-preview browser assets are served from public with security headers', async()=>{
  const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1'},stdio:'ignore'});
  try{
    const js=await get('http://127.0.0.1:4173/app-preview/app/bootstrap.js');
    assert.equal(js.status,200); assert.match(js.headers.get('content-type')??'',/javascript/); assert.ok(js.headers.get('content-security-policy'));
    const css=await get('http://127.0.0.1:4173/app-preview/ui/tokens/kimyolab.css');
    assert.equal(css.status,200); assert.match(css.headers.get('content-type')??'',/css/);
  } finally {child.kill('SIGTERM');}
});
