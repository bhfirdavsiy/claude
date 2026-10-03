// P2.12 — the SEPARATE Content Studio build (ADR-P2-013 §2). Output: dist-studio/ (never part of the learner
// deployment: deploy:build, production, release and standalone builds do not read src/studio/ or dist-studio/).
//
//   dist-studio/index.html          entry (uz-Latn, strict CSP, no external origin)
//   dist-studio/app/**              type-stripped ES modules: the import closure of src/studio/ui/main.ts — the Studio's
//                                   own modules plus the SHARED learner/domain modules it reuses (no second copy of any
//                                   contract, the preview runs the learner renderers themselves)
//   dist-studio/assets/*.css        the learner stylesheet + the Studio layout
//   dist-studio/content/**          a byte copy of the built learner content pack (integrity-checked by ContentClient)
//   dist-studio/studio-data.json    build-time data copied from the canonical sources (kimyolab.content-studio-data.v1)
//
// Deterministic: the same repository state gives byte-identical output. Usage: node scripts/build-content-studio.ts [out]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const STUDIO_ENTRY='src/studio/ui/main.ts';
const readJson=(root:string,rel:string)=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const IMPORT_FROM=/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"](\.[^'"]+)['"]/g;

/** the runtime import closure of an entry (type-only imports are erased by the stripper and so not followed) */
export function studioModuleClosure(root:string,entry=STUDIO_ENTRY):Array<{rel:string;js:string}>{
  const seen=new Map<string,string>();
  const visit=(rel:string)=>{
    if(seen.has(rel)) return;
    const src=fs.readFileSync(path.join(root,rel),'utf8');
    const js=stripTypeScriptTypes(src,{mode:'strip'});
    seen.set(rel,js);
    for(const m of js.matchAll(IMPORT_FROM)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel),m[1]!)));
  };
  visit(entry);
  return [...seen.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([rel,js])=>({rel,js:js.replace(/from\s+(['"])([^'"]+)\.ts\1/g,'from $1$2.js$1')}));
}

/** kimyolab.content-studio-data.v1 — copied from the canonical sources at build time */
export function studioData(root:string){
  const units=(readJson(root,'content-src/learning-units.json') as any[]).map(u=>({id:u.id,grade:u.grade,title:u.title,chapter:u.chapter??''})).sort((a,b)=>a.grade-b.grade||a.id.localeCompare(b.id,'en',{numeric:true}));
  const activities=readJson(root,'content-src/practice-activities.json') as any[];
  const mappings=readJson(root,'content-src/mapping-links.json') as any[];
  const overlays=(readJson(root,'content-src/topic-lab-profiles.json').overlays as any[]);
  const labSources=activities.filter(a=>a.type==='experiment'&&Array.isArray(a.legacyContent?.steps)&&a.legacyContent.steps.length).flatMap(a=>{
    const lus=[...new Set(mappings.filter(m=>m.practiceActivityId===a.id).map(m=>m.learningUnitId as string))];
    return lus.map(lu=>({learningUnitId:lu,practiceActivityId:a.id,goal:a.goal??'',legacy:{equipment:a.legacyContent.equipment??'',materials:a.legacyContent.materials??'',safety:a.legacyContent.safety??'',steps:[...a.legacyContent.steps]},profiled:overlays.some(o=>o.activityId===a.id)}));
  }).sort((a,b)=>a.learningUnitId.localeCompare(b.learningUnitId,'en',{numeric:true})||a.practiceActivityId.localeCompare(b.practiceActivityId,'en',{numeric:true}));
  // one lab source per topic: a profiled activity first (it is the one the lab view exists for)
  const byUnit=new Map<string,any>(); for(const s of labSources){ const cur=byUnit.get(s.learningUnitId); if(!cur||(!cur.profiled&&s.profiled)) byUnit.set(s.learningUnitId,s); }
  const j=(rel:string)=>readJson(root,`content-src/chemistry/${rel}`);
  return {
    schema:'kimyolab.content-studio-data.v1',
    units,
    labSources:[...byUnit.values()],
    registryData:{reactions:j('reactions.json'),solutionRules:j('solubility.json'),species:j('species.json'),electrolysis:j('electrolysis.json'),conditionVocabulary:j('condition-vocabulary.json'),schoolLabModels:j('school-lab-models.json'),qualitativeTests:j('qualitative-tests.json')},
    studioLabels:readJson(root,'content-src/studio/content-studio.uz-latn.json').labels,
    learnerLabels:readJson(root,'content-src/locales/uz-latn/learner-interaction.json').labels,
  };
}

export const STUDIO_CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'self' blob:; connect-src 'self'; frame-src 'none'; base-uri 'none'; form-action 'none'";

export function studioIndexHtml(){
  return `<!doctype html>
<html lang="uz-Latn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${STUDIO_CSP}">
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="data:,">
<title>KimyoLab — Kontent studiyasi</title>
<link rel="stylesheet" href="assets/kimyolab.css">
<link rel="stylesheet" href="assets/studio.css">
</head>
<body>
<div id="studio"></div>
<script type="module" src="app/studio/ui/main.js"></script>
</body>
</html>
`;
}

export function buildContentStudio(root=ROOT,out=path.join(ROOT,'dist-studio')){
  const pack=path.join(root,'public/content');
  if(!fs.existsSync(path.join(pack,'manifest.json'))) throw new Error('STUDIO_BUILD_NEEDS_CONTENT_PACK: run npm run content:pack first');
  fs.rmSync(out,{recursive:true,force:true});
  const modules=studioModuleClosure(root);
  for(const m of modules){ const target=path.join(out,'app',m.rel.replace(/^src\//,'').replace(/\.ts$/,'.js')); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,m.js); }
  fs.mkdirSync(path.join(out,'assets'),{recursive:true});
  fs.copyFileSync(path.join(root,'src/ui/tokens/kimyolab.css'),path.join(out,'assets/kimyolab.css'));
  fs.copyFileSync(path.join(root,'src/studio/ui/studio.css'),path.join(out,'assets/studio.css'));
  fs.cpSync(pack,path.join(out,'content'),{recursive:true});
  fs.writeFileSync(path.join(out,'studio-data.json'),`${JSON.stringify(studioData(root))}\n`);
  fs.writeFileSync(path.join(out,'index.html'),studioIndexHtml());
  const studioOnly=modules.filter(m=>m.rel.startsWith('src/studio/')||m.rel.startsWith('src/authoring/'));
  return {out,modules:modules.length,moduleBytes:modules.reduce((n,m)=>n+Buffer.byteLength(m.js),0),studioOnlyModules:studioOnly.length,studioOnlyBytes:studioOnly.reduce((n,m)=>n+Buffer.byteLength(m.js),0),sharedModules:modules.length-studioOnly.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const out=process.argv[2]?path.resolve(process.argv[2]):path.join(ROOT,'dist-studio');
  console.log(JSON.stringify(buildContentStudio(ROOT,out)));
}
