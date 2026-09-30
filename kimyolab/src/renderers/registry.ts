// RendererRegistry (P1.4 §12). Resolution key: capability id + compatible version — never an activity id.
// Fail closed: duplicate registration, missing accessibility commitments, and unmatched requirements are
// errors; there is no first-match-wins and no silent fallback to a generic form.
import {satisfiesVersionRange,isVersion,isVersionRange,compareVersions} from '../runtime/compatibility/version-range.ts';
import {RendererError,type RendererCapability,type RendererImplementation,type RendererRequirement} from './contract.ts';

const REDUCED_MOTION=new Set(['static','reduced']);
const NON_VISUAL=new Set(['text-state','table','steps']);

/** Validates a capability declaration; accessibility is a registration gate, not decoration. */
export function validateCapability(c:RendererCapability):void{
  if(!c||typeof c.id!=='string'||!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/.test(c.id)) throw new RendererError('RENDERER_CAPABILITY_INVALID','id');
  if(!isVersion(c.version)) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: version`);
  if(typeof c.rendererModelSchema!=='string'||!/^kimyolab\.renderer\.[a-z0-9.-]+\.v\d+$/.test(c.rendererModelSchema)) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: rendererModelSchema`);
  if(!Array.isArray(c.intents)||!c.intents.length) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: intents`);
  const a=c.accessibility as any;
  const complete=a&&a.keyboard===true&&a.nonColorCues===true&&a.screenReaderSummary===true&&REDUCED_MOTION.has(a.reducedMotion)&&NON_VISUAL.has(a.nonVisualAlternative);
  if(!complete) throw new RendererError('RENDERER_ACCESSIBILITY_INCOMPLETE',c.id);
}

export function validateRequirement(r:unknown):asserts r is RendererRequirement{
  const x=r as RendererRequirement;
  if(!x||typeof x.capability!=='string'||!x.capability||!isVersionRange(x.range)) throw new RendererError('RENDERER_REQUIREMENT_INVALID',JSON.stringify(r));
}

/**
 * The capability that satisfies a requirement among declarations (build time uses the catalog, runtime the
 * registry — same rule). Several compatible versions → the highest one; none → RENDERER_UNAVAILABLE.
 */
export function selectCapability<T extends {capability:RendererCapability}>(entries:readonly T[],requirement:RendererRequirement):T{
  validateRequirement(requirement);
  const matches=entries.filter(e=>e.capability.id===requirement.capability&&satisfiesVersionRange(e.capability.version,requirement.range));
  if(!matches.length) throw new RendererError('RENDERER_UNAVAILABLE',`${requirement.capability}@${requirement.range}`);
  return [...matches].sort((a,b)=>compareVersions(b.capability.version,a.capability.version))[0]!;
}

export class RendererRegistry {
  #entries:RendererImplementation[]=[];

  register(implementation:RendererImplementation):void{
    validateCapability(implementation?.capability);
    const {id,version}=implementation.capability;
    if(this.#entries.some(e=>e.capability.id===id&&e.capability.version===version)) throw new RendererError('RENDERER_DUPLICATE',`${id}@${version}`);
    if(typeof implementation.mount!=='function') throw new RendererError('RENDERER_CAPABILITY_INVALID',`${id}: mount`);
    this.#entries.push(implementation);
  }

  resolve(requirement:RendererRequirement):RendererImplementation{
    return selectCapability(this.#entries,requirement);
  }

  capabilities():RendererCapability[]{ return this.#entries.map(e=>({...e.capability,intents:[...e.capability.intents],accessibility:{...e.capability.accessibility}})); }
}
