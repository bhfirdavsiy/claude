interface GateInput {
  mapping:{gate:Record<string,number>};
  content:{schemaErrors:number};
  chemistry:{formulaErrors:number;reactionBalanceErrors:number;referenceErrors:number;sourceErrors:number;expertApproval:string};
  beta1:{totalLearningUnits:number;technicalReady:number;releaseReady:number;technicalErrors:number;pendingApprovals:number};
  beta2:{totalLearningUnits:number;technicalReady:number;releaseReady:number;technicalErrors:number;pendingApprovals:number};
  beta3:{totalLearningUnits:number;technicalReady:number;releaseReady:number;technicalErrors:number;pendingApprovals:number};
  licensing:{releaseReady:boolean};
  packIntegrity:{valid:boolean};
  browser:{viteBuild:string;e2e:string;visual:string;accessibility:string;webVitals:string};
}

export function evaluateReleaseGate(input:GateInput){
  const blockers:string[]=[];
  const mappingErrors=Object.values(input.mapping.gate??{}).reduce((sum,value)=>sum+Number(value||0),0);
  if(mappingErrors>0) blockers.push('MAPPING_ERRORS');
  if(input.content.schemaErrors>0) blockers.push('CONTENT_SCHEMA_ERRORS');
  const chemistryErrors=input.chemistry.formulaErrors+input.chemistry.reactionBalanceErrors+input.chemistry.referenceErrors+input.chemistry.sourceErrors;
  if(chemistryErrors>0) blockers.push('CHEMISTRY_VALIDATION_ERRORS');
  if(input.beta1.technicalErrors>0||input.beta1.technicalReady!==input.beta1.totalLearningUnits) blockers.push('BETA1_TECHNICAL_ERRORS');
  if(input.beta2.technicalErrors>0||input.beta2.technicalReady!==input.beta2.totalLearningUnits) blockers.push('BETA2_TECHNICAL_ERRORS');
  if(input.beta3.technicalErrors>0||input.beta3.technicalReady!==input.beta3.totalLearningUnits) blockers.push('BETA3_TECHNICAL_ERRORS');
  if(!input.packIntegrity.valid) blockers.push('CONTENT_PACK_INTEGRITY_FAILED');

  const technicalBlockers=new Set(['MAPPING_ERRORS','CONTENT_SCHEMA_ERRORS','CHEMISTRY_VALIDATION_ERRORS','BETA1_TECHNICAL_ERRORS','BETA2_TECHNICAL_ERRORS','BETA3_TECHNICAL_ERRORS','CONTENT_PACK_INTEGRITY_FAILED']);
  const technicalReady=!blockers.some((item)=>technicalBlockers.has(item));

  if(input.chemistry.expertApproval!=='approved') blockers.push('CHEMISTRY_EXPERT_APPROVAL_PENDING');
  if(input.beta1.pendingApprovals>0||input.beta1.releaseReady!==input.beta1.totalLearningUnits) blockers.push('BETA1_APPROVALS_PENDING');
  if(input.beta2.pendingApprovals>0||input.beta2.releaseReady!==input.beta2.totalLearningUnits) blockers.push('BETA2_APPROVALS_PENDING');
  if(input.beta3.pendingApprovals>0||input.beta3.releaseReady!==input.beta3.totalLearningUnits) blockers.push('BETA3_APPROVALS_PENDING');
  if(!input.licensing.releaseReady) blockers.push('LICENSING_PENDING');
  if(Object.values(input.browser).some((status)=>status!=='pass')) blockers.push('BROWSER_GATES_PENDING');

  return {technicalReady,releaseReady:technicalReady&&blockers.length===0,blockers};
}
