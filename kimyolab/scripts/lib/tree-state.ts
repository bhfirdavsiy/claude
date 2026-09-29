// Single definition of "is the source tree clean?" shared by the acceptance runner (verify) and
// release:freeze, so both agree on which paths are verify's own report artefacts.
import {spawnSync} from 'node:child_process';

/** Tracked files that `npm run verify` rewrites as reports; they never count as source changes. */
export const VERIFY_ARTEFACTS:readonly RegExp[]=[/^reports\//,/^review-packets\//];

export const isVerifyArtefact=(p:string)=>VERIFY_ARTEFACTS.some(r=>r.test(p));

/**
 * Parses `git status --porcelain=v1 -z` without trimming (the two status columns are significant,
 * e.g. " M path") and returns paths relative to `prefix` (the app directory inside the repo).
 */
export function parsePorcelainZ(raw:string,prefix:string):string[]{
  const entries=raw.split('\0'); const out:string[]=[];
  for(let i=0;i<entries.length;i++){
    const entry=entries[i]!; if(entry.length<4) continue;
    const status=entry.slice(0,2); out.push(entry.slice(3));
    if(status[0]==='R'||status[0]==='C') i++; // next NUL field is the rename/copy source
  }
  return out.map(p=>prefix&&p.startsWith(prefix)?p.slice(prefix.length):p);
}

/** Changed/untracked paths under `cwd`, relative to it; undefined when `cwd` is not a git checkout. */
export function changedPaths(cwd:string):string[]|undefined{
  const prefix=spawnSync('git',['rev-parse','--show-prefix'],{cwd,encoding:'utf8'});
  if(prefix.status!==0) return undefined;
  const r=spawnSync('git',['status','--porcelain=v1','-z','--untracked-files=normal','--','.'],{cwd,encoding:'utf8'});
  if(r.status!==0) return undefined;
  return parsePorcelainZ(r.stdout,prefix.stdout.trim());
}

/** Source changes = changed paths that are not verify report artefacts. */
export function sourceChanges(cwd:string):string[]|undefined{
  return changedPaths(cwd)?.filter(p=>!isVerifyArtefact(p));
}
