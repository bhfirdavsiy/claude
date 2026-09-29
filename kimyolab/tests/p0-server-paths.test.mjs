// P0.15.2 — the server finds dist/ regardless of OS, drive letter, spaces or Unicode in the install path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolvePublicRoot} from '../server/paths.mjs';
import {resolvePublicRoot as appResolvePublicRoot} from '../server/app.mjs';

const cases=[
  ['POSIX path','posix','file:///opt/kimyolab/server/app.mjs','/opt/kimyolab/dist'],
  ['Windows drive path','win32','file:///C:/KimyoLab/server/app.mjs','C:\\KimyoLab\\dist'],
  ['spaces in path (Windows)','win32','file:///C:/Program%20Files/KimyoLab/server/app.mjs','C:\\Program Files\\KimyoLab\\dist'],
  ['apostrophe + other drive','win32',"file:///D:/Ta'lim/KimyoLab/server/app.mjs","D:\\Ta'lim\\KimyoLab\\dist"],
  ['Unicode path (Windows)','win32','file:///D:/%D0%A2%D0%B0%CA%BC%D0%BB%D0%B8%D0%BC/%D0%9A%D0%B8%D0%BC%D1%91/server/app.mjs','D:\\Таʼлим\\Кимё\\dist'],
  ['spaces + Unicode (POSIX)','posix','file:///home/o%CA%BBqituvchi/Kimyo%20Lab/server/app.mjs','/home/oʻqituvchi/Kimyo Lab/dist'],
];
for(const [name,platform,moduleUrl,expected] of cases){
  test(`resolvePublicRoot: ${name}`,()=>{
    assert.equal(resolvePublicRoot({moduleUrl,platform,env:{}}),expected);
  });
}

test('KIMYOLAB_PUBLIC_ROOT overrides the default, relative values resolve against the app root',()=>{
  assert.equal(resolvePublicRoot({moduleUrl:'file:///C:/Program%20Files/KimyoLab/server/app.mjs',platform:'win32',env:{KIMYOLAB_PUBLIC_ROOT:'E:\\deploy\\dist'}}),'E:\\deploy\\dist');
  assert.equal(resolvePublicRoot({moduleUrl:'file:///opt/kimyolab/server/app.mjs',platform:'posix',env:{KIMYOLAB_PUBLIC_ROOT:'build/public'}}),'/opt/kimyolab/build/public');
});

test('URL.pathname would have produced a broken Windows path (regression guard)',()=>{
  const url='file:///C:/Program%20Files/KimyoLab/server/app.mjs';
  assert.equal(new URL(url).pathname,'/C:/Program%20Files/KimyoLab/server/app.mjs');
  assert.notEqual(path.win32.resolve(path.win32.dirname(new URL(url).pathname),'..','dist'),'C:\\Program Files\\KimyoLab\\dist');
});

test('a real install directory with spaces and Unicode on this OS is served correctly',async()=>{
  const {createKimyoLabServer}=await import('../server/app.mjs');
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'Kimyo Lab Taʼlim Кимё-'));
  fs.mkdirSync(path.join(base,'server'));
  fs.mkdirSync(path.join(base,'dist'));
  fs.writeFileSync(path.join(base,'dist','index.html'),'<!doctype html><title>ok</title>');
  const root=resolvePublicRoot({moduleUrl:pathToFileURL(path.join(base,'server','app.mjs')).href,env:{}});
  assert.equal(root,path.join(base,'dist'));
  assert.equal(appResolvePublicRoot({cwd:base,env:{}}),path.join(base,'dist'));
  const server=createKimyoLabServer({publicRoot:root,env:{},logger:()=>{}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const res=await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(res.status,200);
    assert.match(await res.text(),/<title>ok<\/title>/);
  }finally{await new Promise(r=>server.close(r));}
});
