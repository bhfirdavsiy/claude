// Routing report helper (P1.1). Readiness/mastery reports are produced by scripts/learning-readiness.ts (P1.2).
import {compileExecutionPlans,CONFIG_SOURCE_NAMES,type RoutingReport} from '../../src/runtime/practice-router/execution-plan.ts';

export function activityRoutingReport(activities:any[],configs:Record<string,Record<string,unknown>>):RoutingReport&{fatal:number}{
  const {report,fatal}=compileExecutionPlans(activities,Object.fromEntries(CONFIG_SOURCE_NAMES.map(n=>[n,configs[n]??{}])));
  return {...report,fatal:fatal.length};
}
