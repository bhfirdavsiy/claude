export type ExternalLabProviderId='nobook'|'chemai'|'chem-lab-station';
export type ExternalLabMode='embed'|'deep-link'|'reference';
export type ExternalLabStatus='active'|'requires_partner_access'|'disabled';
export type ExternalEvidencePolicy='scene_state'|'self_report'|'none';
export type ExternalProviderReadinessCode='READY'|'PARTNER_CONFIGURATION_REQUIRED'|'PROVIDER_UNAVAILABLE'|'DISABLED';

export interface ExternalLabBinding {
  id:string;
  provider:ExternalLabProviderId;
  mode:ExternalLabMode;
  status:ExternalLabStatus;
  title:string;
  description:string;
  learningUnitIds:string[];
  externalUrl?:string;
  nobookModuleId?:9|10|27;
  nobookResourceId?:string;
  evidencePolicy:ExternalEvidencePolicy;
  localAssessmentRequired:boolean;
}

export interface ExternalProviderReadiness {
  provider:ExternalLabProviderId;
  ready:boolean;
  code:ExternalProviderReadinessCode;
  retryable:boolean;
}

export interface ExternalLabEvidence {
  provider:ExternalLabProviderId;
  bindingId:string;
  learningUnitId:string;
  evidencePolicy:ExternalEvidencePolicy;
  capturedAt:string;
  sceneData?:string;
  screenshotDataUrl?:string;
  note?:string;
}

export interface ExternalLabSession {
  binding:ExternalLabBinding;
  saveState?():Promise<ExternalLabEvidence>;
  restoreState?(evidence:ExternalLabEvidence):Promise<void>;
  close():Promise<void>;
}

export interface ExternalLabProvider {
  readonly id:ExternalLabProviderId;
  readiness(binding:ExternalLabBinding):Promise<ExternalProviderReadiness>|ExternalProviderReadiness;
  canLaunch(binding:ExternalLabBinding):Promise<boolean>|boolean;
  launch(binding:ExternalLabBinding,context:{learningUnitId:string;mount?:HTMLElement}):Promise<ExternalLabSession>;
}
