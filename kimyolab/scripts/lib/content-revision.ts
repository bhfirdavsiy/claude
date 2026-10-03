// P2.9 — the deployment layout of the content pack: semantic content version vs artifact/cache revision.
//
//   contentVersion  (e.g. 2026.09.1) is SEMANTIC. Activity versions, review targets and learner evidence refer to it;
//                   it changes only by a content release decision, never because deployment bytes changed.
//   contentRevision is the DEPLOY/CACHE identity: the first 16 hex of the pack's canonical aggregate checksum (every
//                   file's path, sha256 and size). Any changed byte changes it.
//
// In the deployment artefact the pack lives at content/<contentVersion>/<contentRevision>/ and the pointer
// (content/manifest.json, revalidated on every load) names that exact directory. Only such a revision-qualified URL
// is served as immutable, so ONE immutable URL can never serve two different byte sequences, and switching the
// pointer (deploy, rollback) switches the whole pack atomically. The source build (public/content/<version>/) keeps
// the semantic layout and is never served as immutable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {contentRevisionOf,packLocation,CONTENT_REVISION_LENGTH} from '../../src/runtime/compatibility/release-pointer.ts';

export {contentRevisionOf,CONTENT_REVISION_LENGTH};
const readJson=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const sha256=(file:string)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir:string,base=dir):string[]{
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{ const full=path.join(dir,e.name); return e.isDirectory()?walk(full,base):[path.relative(base,full).split(path.sep).join('/')]; }).sort();
}

/** Move the active pack of a SOURCE-layout content directory to <version>/<revision>/ and point at it. */
export function applyRevisionLayout(contentDir:string):{contentVersion:string;contentRevision:string}{
  const pointerFile=path.join(contentDir,'manifest.json');
  const pointer=readJson(pointerFile);
  const location=packLocation(pointer);
  if(!location||location.revision!==null) throw Object.assign(new Error('the content pointer is not a source-layout pointer (<version>/manifest.json)'),{code:'DEPLOY_CONTENT_REVISION_INVALID'});
  const version=pointer.activeVersion as string;
  const manifest=readJson(path.join(contentDir,version,'manifest.json'));
  const revision=contentRevisionOf(manifest.checksum);
  const versionDir=path.join(contentDir,version), staging=path.join(contentDir,`.${version}.${revision}`);
  fs.renameSync(versionDir,staging);
  fs.mkdirSync(versionDir,{recursive:true});
  fs.renameSync(staging,path.join(versionDir,revision));
  // only the active pack belongs to this artefact: a previous pack is a previous ARTEFACT (release registry)
  fs.writeFileSync(pointerFile,`${JSON.stringify({activeVersion:version,activeRevision:revision,checksum:pointer.checksum,manifest:`${version}/${revision}/manifest.json`},null,2)}\n`);
  return {contentVersion:version,contentRevision:revision};
}

/** Every reason the content directory of a DEPLOYMENT artefact breaks the revision contract (empty = valid). */
export function revisionLayoutProblems(contentDir:string):string[]{
  const problems:string[]=[];
  const pointerFile=path.join(contentDir,'manifest.json');
  if(!fs.existsSync(pointerFile)) return ['POINTER_MISSING'];
  let pointer:any; try{ pointer=readJson(pointerFile); }catch{ return ['POINTER_NOT_JSON']; }
  if(typeof pointer.activeRevision!=='string'||!new RegExp(`^[a-f0-9]{${CONTENT_REVISION_LENGTH}}$`).test(pointer.activeRevision)) problems.push('POINTER_REVISION_MISSING');
  const location=packLocation(pointer);
  if(!location||location.revision===null) return [...problems,'POINTER_NOT_REVISION_QUALIFIED'];
  const packDir=path.join(contentDir,...location.dir.split('/'));
  const manifestFile=path.join(packDir,'manifest.json');
  if(!fs.existsSync(manifestFile)) return [...problems,'PACK_MANIFEST_MISSING'];
  const manifest=readJson(manifestFile);
  if(manifest.contentVersion!==pointer.activeVersion) problems.push('PACK_VERSION_MISMATCH');
  if(manifest.checksum!==pointer.checksum) problems.push('PACK_CHECKSUM_MISMATCH');
  const listed=(manifest.files??[]) as Array<{path:string;checksum:string;size:number}>;
  const aggregate=crypto.createHash('sha256').update(listed.map(f=>`${f.path}:${f.checksum}:${f.size}`).join('\n')).digest('hex');
  if(aggregate!==manifest.checksum) problems.push('PACK_AGGREGATE_MISMATCH');
  if(/^[a-f0-9]{64}$/.test(String(manifest.checksum))&&contentRevisionOf(manifest.checksum)!==location.revision) problems.push('REVISION_NOT_DERIVED_FROM_PACK');
  // every byte under the revision directory is covered by the pack hash (a stray file would be immutable but unhashed)
  const present=walk(packDir).filter(f=>f!=='manifest.json');
  const listedPaths=new Set(listed.map(f=>f.path));
  for(const f of present) if(!listedPaths.has(f)) problems.push(`UNLISTED_FILE:${f}`);
  for(const f of listed){ const full=path.join(packDir,...f.path.split('/')); if(!fs.existsSync(full)) problems.push(`FILE_MISSING:${f.path}`); else if(sha256(full)!==f.checksum) problems.push(`FILE_CHECKSUM_MISMATCH:${f.path}`); }
  // nothing else is served from content/: no un-revisioned copy of a pack, no other version
  const outside=walk(contentDir).filter(f=>f!=='manifest.json'&&!f.startsWith(`${location.dir}/`));
  for(const f of outside) problems.push(`OUTSIDE_REVISION:${f}`);
  return problems;
}

/** Immutable (revision-qualified) content URLs that two artefacts both serve, with DIFFERENT bytes. A correct
 *  revision layout makes this empty by construction; the rollback drill and the preflight prove it. */
export function immutableUrlCollisions(contentDirA:string,contentDirB:string):string[]{
  const immutable=(f:string)=>new RegExp(`^[A-Za-z0-9.-]+/[a-f0-9]{${CONTENT_REVISION_LENGTH}}/.+`).test(f)&&!f.endsWith('/manifest.json');
  const a=new Set(walk(contentDirA).filter(immutable));
  return walk(contentDirB).filter(f=>immutable(f)&&a.has(f)).filter(f=>sha256(path.join(contentDirA,...f.split('/')))!==sha256(path.join(contentDirB,...f.split('/'))));
}
