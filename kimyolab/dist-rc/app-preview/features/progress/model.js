                                                                          
import {displayStatus,isReinforcementComplete,isPracticeComplete,isTheoryComplete,practiceActivityIds} from '../../runtime/learning-orchestrator/selectors.js';

const LABELS                      ={not_started:'Boshlanmagan',in_progress:'Jarayonda',practice_complete:'Amaliyot bajarildi',reinforcement_complete:'Mustahkamlash bajarildi',assessment_complete:'Test topshirildi',mastered:'O‘zlashtirilgan',needs_review:'Takrorlash kerak'};
                                                                   
/** Lesson progress (Dars) and mastery (O‘zlashtirish) are separate indicators (P1.2 §32). */
                                                                                                                                                                                      
export function buildProgressViewModel(progress                       ,units                                             ,mastery                                     =new Map())                   {
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
    const view=mastery.get(row.learningUnitId);
    // P1.3 copy audit: where the mastery indicator is shown, the lesson line never borrows mastery words
    // ("O‘zlashtirilgan"/"Takrorlash kerak"): the lesson achievement behind those states is a submitted test.
    const lessonLabel=(view&&(status==='mastered'||status==='needs_review')?LABELS.assessment_complete:LABELS[status])??status;
    return {learningUnitId:row.learningUnitId,grade:unit?.grade??0,title:unit?.title??'Mavzu',status,statusLabel:lessonLabel,lastVisitedAt:row.lastVisitedAt,resumeHref,...(view?{mastery:view}:{})};
  });
}
