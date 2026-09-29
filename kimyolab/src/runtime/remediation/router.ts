export type RemediationReason =
  | 'concept-misunderstanding'
  | 'visual-misconception'
  | 'procedure-error'
  | 'formula-error'
  | 'equation-error'
  | 'calculation-error'
  | 'reasoning-error';

export type RemediationTarget =
  | 'theory'
  | 'simulation'
  | 'experiment-step'
  | 'trainer'
  | 'balancing'
  | 'calculation-hint'
  | 'case-example';

const ROUTES:Record<RemediationReason,RemediationTarget>={
  'concept-misunderstanding':'theory',
  'visual-misconception':'simulation',
  'procedure-error':'experiment-step',
  'formula-error':'trainer',
  'equation-error':'balancing',
  'calculation-error':'calculation-hint',
  'reasoning-error':'case-example',
};

export function routeRemediation(reason:string):{target:RemediationTarget}{
  if(!(reason in ROUTES)) throw new Error('REMEDIATION_REASON_UNSUPPORTED');
  return {target:ROUTES[reason as RemediationReason]};
}
