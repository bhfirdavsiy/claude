import type {LearningUnitProgress} from '../../runtime/progress/types.ts';
import {displayStatus,isReinforcementComplete,isPracticeComplete,isTheoryComplete,practiceActivityIds} from '../../runtime/learning-orchestrator/selectors.ts';

const LABELS:Record<string,string>={not_started:'Boshlanmagan',in_progress:'Jarayonda',practice_complete:'Amaliyot bajarildi',reinforcement_complete:'Mustahkamlash bajarildi',assessment_complete:'Test topshirildi',mastered:'O‘zlashtirilgan',needs_review:'Takrorlash kerak'};
export interface ProgressViewItem {learningUnitId:string;grade:number;title:string;status:string;statusLabel:string;lastVisitedAt:string;resumeHref:string;}
export function buildProgressViewModel(progress:LearningUnitProgress[],units:Array<{id:string;grade:number;title:string}>):ProgressViewItem[]{
  const byId=new Map(units.map(x=>[x.id,x]));
  return [...progress].sort((a,b)=>b.lastVisitedAt.localeCompare(a.lastVisitedAt)).map(row=>{
    const unit=byId.get(row.learningUnitId);
    const lastActivity=practiceActivityIds(row).at(-1);
    const id=encodeURIComponent(row.learningUnitId);
    let resumeHref=`/learn/${id}/guide`;
    if(isPracticeComplete(row)||isReinforcementComplete(row)) resumeHref=`/learn/${id}/quiz`;
    else if(lastActivity) resumeHref=`/practice/${encodeURIComponent(lastActivity)}`;
    else if(isTheoryComplete(row)) resumeHref=`/learn/${id}/practice`;
    const status=displayStatus(row);
    return {learningUnitId:row.learningUnitId,grade:unit?.grade??0,title:unit?.title??'Mavzu',status,statusLabel:LABELS[status]??status,lastVisitedAt:row.lastVisitedAt,resumeHref};
  });
}
