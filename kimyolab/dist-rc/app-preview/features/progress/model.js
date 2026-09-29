                                                                          

const LABELS                      ={not_started:'Boshlanmagan',in_progress:'Jarayonda',practice_complete:'Amaliyot bajarildi',assessment_complete:'Mustahkamlash bajarildi',mastered:'O‘zlashtirilgan',needs_review:'Takrorlash kerak'};
                                                                                                                                                            
function truthyState(value                 ){if(!value)return false;if(value==='complete')return true;try{return Boolean(JSON.parse(value)?.complete);}catch{return false;}}
export function buildProgressViewModel(progress                       ,units                                             )                   {
  const byId=new Map(units.map(x=>[x.id,x]));
  return [...progress].sort((a,b)=>b.lastVisitedAt.localeCompare(a.lastVisitedAt)).map(row=>{
    const unit=byId.get(row.learningUnitId);
    const realActivities=Object.keys(row.activityStates).filter(id=>id.startsWith('practice.'));
    const lastActivity=realActivities.at(-1);
    const guideComplete=truthyState(row.activityStates['cycle.guide']);
    let resumeHref=`/learn/${encodeURIComponent(row.learningUnitId)}/guide`;
    if(['assessment_complete','mastered','needs_review','practice_complete'].includes(row.status)||truthyState(row.activityStates['cycle.reinforcement'])) resumeHref=`/learn/${encodeURIComponent(row.learningUnitId)}/quiz`;
    else if(lastActivity) resumeHref=`/practice/${encodeURIComponent(lastActivity)}`;
    else if(guideComplete) resumeHref=`/learn/${encodeURIComponent(row.learningUnitId)}/practice`;
    return {learningUnitId:row.learningUnitId,grade:unit?.grade??0,title:unit?.title??'Mavzu',status:row.status,statusLabel:LABELS[row.status]??row.status,lastVisitedAt:row.lastVisitedAt,resumeHref};
  });
}
