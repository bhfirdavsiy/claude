// P1.1 readiness baselines for P1.2 (read-only: nothing here is enforced at runtime — C4 is deferred).
import {compileExecutionPlans,CONFIG_SOURCE_NAMES,type RoutingReport} from '../../src/runtime/practice-router/execution-plan.ts';
import {itemReadiness,splitAssessmentBank,isApproved} from '../../src/domain/assessment/model.ts';

export function activityRoutingReport(activities:any[],configs:Record<string,Record<string,unknown>>):RoutingReport&{fatal:number}{
  const {report,fatal}=compileExecutionPlans(activities,Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,configs[n]??{}])));
  return {...report,fatal:fatal.length};
}

export interface AssessmentRuntimeReadiness {
  totalLearningUnits:number;
  unitsWithObjectiveAssessment:number;
  approvedItems:number;
  pendingItems:number;
  itemsWithConceptMapping:number;
  itemsWithOutcomeMapping:number;
  itemsRuntimeReady:number;
  itemsBlocked:number;
  blockedReasons:Record<string,number>;
  bankVersion:string;
  itemsByLearningUnit:Record<string,{total:number;runtimeReady:number}>;
}

export function assessmentRuntimeReadiness(bank:any,learningUnits:any[]):AssessmentRuntimeReadiness{
  const {prompts,keys}=splitAssessmentBank(bank);
  const keyById=new Map(keys.keys.map(k=>[k.itemId,k]));
  const blockedReasons:Record<string,number>={};
  const byUnit:Record<string,{total:number;runtimeReady:number}>={};
  let ready=0;
  for(const p of prompts.items){
    const r=itemReadiness(p,keyById.get(p.id));
    const u=byUnit[p.learningUnitId]??={total:0,runtimeReady:0};
    u.total++;
    if(r.ready){ready++;u.runtimeReady++;} else for(const reason of r.reasons) blockedReasons[reason]=(blockedReasons[reason]??0)+1;
  }
  const approved=prompts.items.filter(isApproved).length;
  return {
    totalLearningUnits:learningUnits.length,
    unitsWithObjectiveAssessment:Object.values(byUnit).filter(u=>u.runtimeReady>0).length,
    approvedItems:approved,
    pendingItems:prompts.items.length-approved,
    itemsWithConceptMapping:prompts.items.filter(p=>p.conceptIds.length>0).length,
    itemsWithOutcomeMapping:prompts.items.filter(p=>p.outcomeIds.length>0).length,
    itemsRuntimeReady:ready,
    itemsBlocked:prompts.items.length-ready,
    blockedReasons,
    bankVersion:prompts.version,
    itemsByLearningUnit:byUnit,
  };
}
