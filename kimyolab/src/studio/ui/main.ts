// P2.12 — the Content Studio entry (dist-studio/index.html). It runs only from the separate Studio build and only with
// ?ff=contentStudioV1 (the existing feature-flag convention). That flag is NOT authentication: the Studio is an internal
// tool served on the author's own machine (npm run studio:serve, 127.0.0.1) and is never part of the learner deployment.
import {el,clear} from '../../ui/components/dom.ts';
import {isFeatureEnabled} from '../../app/feature-flags.ts';
import {ContentClient} from '../../app/content-client.ts';
import {renderContentStudio} from './app.ts';
import {STUDIO_DATA_SCHEMA,type StudioData} from '../studio-data.ts';

const root=document.getElementById('studio')!;
const url=new URL(window.location.href);
async function start(){
  const data=await (await fetch(new URL('studio-data.json',url).href)).json() as StudioData;
  if(data.schema!==STUDIO_DATA_SCHEMA) throw new Error('STUDIO_DATA_SCHEMA');
  if(!isFeatureEnabled('contentStudioV1',url.searchParams)){ clear(root); root.append(el('main',{className:'kl-shell'})); root.firstElementChild!.append(el('h1',{text:data.studioLabels['studio.title']!}),el('p',{className:'kl-notice',text:data.studioLabels['studio.disabled']!,attrs:{role:'status'}})); return; }
  const client=new ContentClient({baseUrl:new URL('content',url).pathname});
  renderContentStudio(root,data,client,{createObjectUrl:(bytes,type)=>URL.createObjectURL(new Blob([bytes as BlobPart],{type})),revokeObjectUrl:u=>URL.revokeObjectURL(u)});
}
// the catalog is part of studio-data.json, so a failed load can only show this fixed uz-Latn line
start().catch(()=>{ clear(root); root.append(el('p',{className:'kl-notice',text:'Studiya ma’lumotlarini yuklab bo‘lmadi. Sahifani qayta oching.',attrs:{role:'alert'}})); });
