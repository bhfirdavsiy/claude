// Version-range matching for renderer resolution and build checks (P1.4 §15, hardened in the P1.4 closeout).
//
// This is a deliberately SMALL, KimyoLab-specific subset. It is NOT npm-semver and does not claim npm
// semantics; anything outside the subset is rejected (fail closed), never approximated.
//
// Version:  MAJOR.MINOR.PATCH — exactly three numeric parts, no leading zeros, no pre-release/build tags.
// Range (no leading/trailing whitespace; comparators separated by exactly one space):
//   "*"                    any version
//   "1.2.3"                exactly this version
//   "^1.2.3"               ≥ 1.2.3 and < 2.0.0 — MAJOR must be ≥ 1 ("^0.x" is unsupported: npm gives it
//                          different semantics, so it is rejected instead of guessed)
//   ">=1.0.0 <2.0.0"       one or two comparators (>=, <=, >, <, =), all must hold
// Unsupported (→ invalid): "||", "~", "x"/"X" wildcards, partial versions ("1", "1.2"), hyphen ranges, "^0.x",
// pre-release ("1.0.0-beta"), build metadata, surrounding or repeated whitespace.
//
// isVersionRange and satisfiesVersionRange share ONE parser, so "the build accepts the range" and "the runtime
// can evaluate the range" can never disagree.

const NUM='(?:0|[1-9]\\d*)';
const VERSION=new RegExp(`^${NUM}\\.${NUM}\\.${NUM}$`);

                              
                                                                

const parts=(v       )=>v.split('.').map(Number)                                              ;
function cmp(a                  ,b                  ){
  for(let i=0;i<3;i++){ const d=a[i] -b[i] ; if(d) return d<0?-1:1; }
  return 0;
}

/** Orders two valid versions (−1/0/1); throws on an invalid one — callers compare only validated versions. */
export function compareVersions(a       ,b       )       {
  if(!isVersion(a)||!isVersion(b)) throw new Error('VERSION_INVALID');
  return cmp(parts(a),parts(b));
}

export function isVersion(value        )        { return typeof value==='string'&&VERSION.test(value); }

/** The one parser: a range → the comparator set it means, or null when the range is outside the subset. */
export function parseVersionRange(range        )                  {
  if(typeof range!=='string'||range===''||range!==range.trim()) return null;
  if(range==='*') return [];
  if(isVersion(range)) return [{op:'=',version:parts(range)}];
  if(range.startsWith('^')){
    const v=range.slice(1);
    if(!isVersion(v)) return null;
    const p=parts(v);
    if(p[0]<1) return null;
    return [{op:'>=',version:p},{op:'<',version:[p[0]+1,0,0]}];
  }
  const items=range.split(' ');
  if(items.length>2) return null;
  const out             =[];
  for(const item of items){
    const m=/^(>=|<=|>|<|=)(.+)$/.exec(item);
    if(!m||!isVersion(m[2])) return null;
    out.push({op:m[1]      ,version:parts(m[2] )});
  }
  return out;
}

export function isVersionRange(range        )                { return parseVersionRange(range)!==null; }

/** true when `version` satisfies `range`; an invalid version or a range outside the subset never matches. */
export function satisfiesVersionRange(version       ,range       )        {
  const set=parseVersionRange(range);
  if(!set||!isVersion(version)) return false;
  const v=parts(version);
  return set.every(({op,version:b})=>{
    const c=cmp(v,b);
    return op==='>='?c>=0:op==='<='?c<=0:op==='>'?c>0:op==='<'?c<0:c===0;
  });
}
