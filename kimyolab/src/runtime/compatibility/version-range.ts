// Version-range matching shared by renderer resolution and build checks (P1.4 §15). No dependency: the
// comparison is the same numeric one the content-pack compatibility check uses. Supported ranges:
//   "1.2.3" (exact)   "^1.2.3" (same major, ≥)   ">=1 <2" (space-separated comparator set)   "*"
import {compareVersion} from './content-pack.ts';

const SEMVER=/^\d+(\.\d+){0,2}$/;

export function isVersion(value:unknown):boolean{ return typeof value==="string"&&SEMVER.test(value); }

/** true when `version` satisfies `range`; an unparsable range or version never matches (fail closed). */
export function satisfiesVersionRange(version:string,range:string):boolean{
  if(!isVersion(version)||typeof range!=='string') return false;
  const r=range.trim();
  if(r==='*') return true;
  if(isVersion(r)) return compareVersion(version,r)===0;
  const caret=/^\^(\d+)(\.\d+){0,2}$/.exec(r);
  if(caret) return version.split('.')[0]===caret[1]&&compareVersion(version,r.slice(1))>=0;
  const parts=r.split(/\s+/);
  if(!parts.length) return false;
  return parts.every(part=>{
    const m=/^(>=|<=|>|<|=)(\d+(?:\.\d+){0,2})$/.exec(part);
    if(!m) return false;
    const c=compareVersion(version,m[2]!);
    return m[1]==='>='?c>=0:m[1]==='<='?c<=0:m[1]==='>'?c>0:m[1]==='<'?c<0:c===0;
  });
}

export function isVersionRange(range:unknown):range is string{
  if(typeof range!=='string'||!range.trim()) return false;
  const r=range.trim();
  return r==='*'||isVersion(r)||/^\^\d+(\.\d+){0,2}$/.test(r)||r.split(/\s+/).every(p=>/^(>=|<=|>|<|=)\d+(\.\d+){0,2}$/.test(p));
}
