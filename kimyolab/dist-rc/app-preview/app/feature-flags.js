// P2.10 — explicit feature flags (ADR-P2-011). A flag is OFF unless the request names it: `?ff=<name>` (several:
// `?ff=a,b`). Nothing is persisted, no account or profile is involved, and an unknown name enables nothing.
export const FEATURE_FLAGS={
  guidedDynamicLabV1:{default:false,enable:'?ff=guidedDynamicLabV1',description:'Guided dynamic lab vertical slices at /dynamic-lab/<activityId>; the existing practice runtime is unchanged.'},
}         ;
                                                   

export function isFeatureEnabled(flag            ,searchParams                )        {
  const requested=searchParams.getAll('ff').flatMap(v=>v.split(',')).map(v=>v.trim());
  return requested.includes(flag)||FEATURE_FLAGS[flag].default;
}
