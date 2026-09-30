// RendererRegistry (P1.4 §12). Resolution key: capability id + compatible version — never an activity id.
// Fail closed: duplicate registration, missing accessibility commitments, and unmatched requirements are
// errors; there is no first-match-wins and no silent fallback to a generic form.
import {satisfiesVersionRange,isVersion,isVersionRange} from '../runtime/compatibility/version-range.js';
import {RendererError,                                                                            } from './contract.js';

const REDUCED_MOTION=new Set(['static','reduced']);
const NON_VISUAL=new Set(['text-state','table','steps']);

/** Validates a capability declaration; accessibility is a registration gate, not decoration. */
export function validateCapability(c                   )     {
  if(!c||typeof c.id!=='string'||!/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/.test(c.id)) throw new RendererError('RENDERER_CAPABILITY_INVALID','id');
  if(!isVersion(c.version)) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: version`);
  if(typeof c.rendererModelSchema!=='string'||!/^kimyolab\.renderer\.[a-z0-9.-]+\.v\d+$/.test(c.rendererModelSchema)) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: rendererModelSchema`);
  if(!Array.isArray(c.intents)||!c.intents.length) throw new RendererError('RENDERER_CAPABILITY_INVALID',`${c.id}: intents`);
  const a=c.accessibility       ;
  const complete=a&&a.keyboard===true&&a.nonColorCues===true&&a.screenReaderSummary===true&&REDUCED_MOTION.has(a.reducedMotion)&&NON_VISUAL.has(a.nonVisualAlternative);
  if(!complete) throw new RendererError('RENDERER_ACCESSIBILITY_INCOMPLETE',c.id);
}

export function validateRequirement(r        )                                 {
  const x=r                       ;
  if(!x||typeof x.capability!=='string'||!x.capability||!isVersionRange(x.range)) throw new RendererError('RENDERER_REQUIREMENT_INVALID',JSON.stringify(r));
}

/**
 * The capability that satisfies a requirement among declarations (build time uses the catalog, runtime the
 * registry — same rule). Several compatible versions → the highest one; none → RENDERER_UNAVAILABLE.
 */
export function selectCapability                                           (entries             ,requirement                    )  {
  validateRequirement(requirement);
  const matches=entries.filter(e=>e.capability.id===requirement.capability&&satisfiesVersionRange(e.capability.version,requirement.range));
  if(!matches.length) throw new RendererError('RENDERER_UNAVAILABLE',`${requirement.capability}@${requirement.range}`);
  return [...matches].sort((a,b)=>b.capability.version.localeCompare(a.capability.version,undefined,{numeric:true}))[0] ;
}

export class RendererRegistry {
  #entries                         =[];

  register(implementation                       )     {
    validateCapability(implementation?.capability);
    const {id,version}=implementation.capability;
    if(this.#entries.some(e=>e.capability.id===id&&e.capability.version===version)) throw new RendererError('RENDERER_DUPLICATE',`${id}@${version}`);
    if(typeof implementation.mount!=='function') throw new RendererError('RENDERER_CAPABILITY_INVALID',`${id}: mount`);
    this.#entries.push(implementation);
  }

  resolve(requirement                    )                       {
    return selectCapability(this.#entries,requirement);
  }

  capabilities()                     { return this.#entries.map(e=>({...e.capability,intents:[...e.capability.intents],accessibility:{...e.capability.accessibility}})); }
}
