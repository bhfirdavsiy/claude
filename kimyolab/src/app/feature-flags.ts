// P2.10 — explicit feature flags (ADR-P2-011). A flag is OFF unless the request names it: `?ff=<name>` (several:
// `?ff=a,b`). Nothing is persisted, no account or profile is involved, and an unknown name enables nothing.
export const FEATURE_FLAGS={
  guidedDynamicLabV1:{default:false,enable:'?ff=guidedDynamicLabV1',description:'Guided dynamic lab vertical slices at /dynamic-lab/<activityId>; the existing practice runtime is unchanged.'},
  /** P2.12: the Content Studio is a SEPARATE build (dist-studio/, never deployed with the learner app); this flag only
   *  gates the Studio's own entry page. It is not authentication: the Studio is an internal tool for a local machine. */
  contentStudioV1:{default:false,enable:'?ff=contentStudioV1',description:'Content Studio MVP (separate build: npm run studio:build / studio:serve); not part of the learner deployment.'},
  /** P2.13: the periodic table and Element Hub at /periodic and /periodic/<symbol>; elements join the learner search. */
  periodicTableV1:{default:false,enable:'?ff=periodicTableV1',description:'Periodic table + Element Hub at /periodic (element profile deep link /periodic/<symbol>); with the flag off the route does not exist.'},
} as const;
export type FeatureFlag=keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(flag:FeatureFlag,searchParams:URLSearchParams):boolean{
  const requested=searchParams.getAll('ff').flatMap(v=>v.split(',')).map(v=>v.trim());
  return requested.includes(flag)||FEATURE_FLAGS[flag].default;
}
