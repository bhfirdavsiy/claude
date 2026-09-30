import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceRoot=path.join(root,'src');
const outRoot=path.join(root,'public/app-preview');
fs.rmSync(outRoot,{recursive:true,force:true});

const roots=['app','features','ui','domain','runtime','engines','integrations','renderers'];
function copyTree(relative:string){
  const dir=path.join(sourceRoot,relative);
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=path.join(relative,entry.name);
    const full=path.join(sourceRoot,rel);
    if(entry.isDirectory()){copyTree(rel);continue;}
    if(entry.name.endsWith('.ts')){
      const code=fs.readFileSync(full,'utf8');
      let js=stripTypeScriptTypes(code,{mode:'strip'}).replace(/from\s+(['"])([^'"]+)\.ts\1/g,'from $1$2.js$1');
      const target=path.join(outRoot,rel.replace(/\.ts$/,'.js'));
      fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,js,'utf8');
    }else if(entry.name.endsWith('.css')){
      const target=path.join(outRoot,rel); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(full,target);
    }
  }
}
for(const rel of roots) copyTree(rel);
console.log(JSON.stringify({output:path.relative(root,outRoot),entry:'app/bootstrap.js'}));
