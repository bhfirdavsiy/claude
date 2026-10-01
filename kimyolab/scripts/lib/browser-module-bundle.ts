// P2.4 — embeds browser-safe domain modules into an offline page (the reviewer workbench) WITHOUT a second
// implementation: the TypeScript sources are type-stripped (the same Node stripper the preview build uses) and each
// module is wrapped in its own scope. So a content hash or a review state the workbench shows is computed by exactly
// the code the governed apply runs.
import fs from 'node:fs';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';

const IMPORT=/^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm;
const REEXPORT_FROM=/^\s*export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm;
const EXPORT_LIST=/^\s*export\s*\{([^}]*)\};?\s*$/gm;
const names=(list:string)=>list.split(',').map(x=>x.trim()).filter(Boolean);

/** Returns a script that defines `globalName` = {exported names of every entry module}. */
export function bundleBrowserModules(entries:string[],globalName:string):string{
  const order:string[]=[]; const ids=new Map<string,number>(); const bodies=new Map<string,string>();
  const visit=(file:string)=>{
    if(ids.has(file)) return;
    ids.set(file,-1);
    let js=stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'strip'});
    if(/\b(?:require\(|from\s+['"]node:|import\(|process\.|Buffer\b)/.test(js)) throw new Error(`BROWSER_BUNDLE_NODE_DEPENDENCY:${file}`);
    const deps:Array<{file:string;bind:string}>=[]; const exported:string[]=[];
    const dep=(spec:string)=>{ if(!spec.startsWith('.')) throw new Error(`BROWSER_BUNDLE_BARE_IMPORT:${spec} in ${file}`); return path.resolve(path.dirname(file),spec); };
    js=js.replace(REEXPORT_FROM,(_m,list:string,spec:string)=>{ const f=dep(spec); deps.push({file:f,bind:list}); exported.push(...names(list).map(n=>n.split(/\s+as\s+/).pop()!)); return ''; });
    js=js.replace(IMPORT,(_m,list:string,spec:string)=>{ deps.push({file:dep(spec),bind:list}); return ''; });
    js=js.replace(EXPORT_LIST,(_m,list:string)=>{ exported.push(...names(list).map(n=>n.split(/\s+as\s+/).pop()!)); return ''; });
    js=js.replace(/^(\s*)export\s+((?:async\s+)?function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,(_m,ws:string,kind:string,name:string)=>{ exported.push(name); return `${ws}${kind} ${name}`; });
    if(/^\s*(?:import|export)\b/m.test(js)) throw new Error(`BROWSER_BUNDLE_UNSUPPORTED_SYNTAX:${file}`);
    for(const d of deps) visit(d.file);
    ids.set(file,order.length); order.push(file);
    const binds=deps.map(d=>`const {${names(d.bind).map(n=>n.replace(/\s+as\s+/,': ')).join(', ')}}=__m${ids.get(d.file)};`).join('\n');
    bodies.set(file,`const __m${ids.get(file)}=(()=>{\n${binds}\n${js}\nreturn {${[...new Set(exported)].join(', ')}};\n})();`);
  };
  for(const e of entries) visit(path.resolve(e));
  const entryExports=entries.map(e=>`...__m${ids.get(path.resolve(e))}`).join(', ');
  return `(()=>{\n${order.map(f=>bodies.get(f)).join('\n')}\nglobalThis.${globalName}=Object.freeze({${entryExports}});\n})();`;
}
