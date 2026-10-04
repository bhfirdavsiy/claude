// P2.12 — serves the separate Content Studio build (dist-studio/) on the author's own machine only (127.0.0.1).
// GET/HEAD only, no directory listing, no path outside dist-studio/. This is a local tool, not an admin server:
// there is no authentication, so it never binds to a public interface. Usage: node scripts/serve-content-studio.mjs [port] [dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.yaml':'text/yaml; charset=utf-8','.pdf':'application/pdf','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};

export function createStudioServer(dir){
  const root=path.resolve(dir);
  return http.createServer((req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){ res.writeHead(405,{allow:'GET, HEAD'}).end(); return; }
    let rel;
    try{ rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname); }catch{ res.writeHead(400).end(); return; }
    if(rel.endsWith('/')) rel+='index.html';
    const file=path.resolve(root,`.${rel}`);
    if(file!==root&&!file.startsWith(root+path.sep)){ res.writeHead(403).end(); return; }
    fs.stat(file,(err,st)=>{
      if(err||!st.isFile()){ res.writeHead(404,{'content-type':'text/plain; charset=utf-8'}).end('not found'); return; }
      res.writeHead(200,{'content-type':TYPES[path.extname(file)]??'application/octet-stream','x-content-type-options':'nosniff','cache-control':'no-store','referrer-policy':'no-referrer'});
      if(req.method==='HEAD'){ res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.argv[2]??4174), dir=process.argv[3]??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist-studio');
  createStudioServer(dir).listen(port,'127.0.0.1',()=>console.log(`Content Studio: http://127.0.0.1:${port}/?ff=contentStudioV1`));
}
