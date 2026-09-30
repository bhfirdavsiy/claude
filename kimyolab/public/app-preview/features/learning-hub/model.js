                                                                                                                          
                                                                                  
import {launchDecision,readinessMessage,resolveReadiness,                  } from '../../domain/readiness/readiness.js';
                                                                                     
import {assessmentIdFor,isApproved,toPromptView,validatePromptPack,                         } from '../../domain/assessment/model.js';

                                         
                       
                            
                               
                         
                     
                                     
                                                                                                           
                             
                                                                                                          
                           
 

                                       
            
                                
               
              
                         
                                                                                                       
                     
                             
 

/** Objective assessment as the learner sees it: prompts only — no key, no explanation, no scoring rule. */
                                         
                      
                 
                               
                      
 

                                   
            
               
               
                  
                            
                                               
                                          
          
              
                 
                                            
                                 
    
                                       
                                             
                                                                                                            
                                    
                                                                                       
                
                                                                                    
                                                                         
 

function studentPractice(activity                 ,pack               )                      {
  // Without a readiness pack (legacy callers/tests) nothing is decided here; the page itself still gates.
  const readiness=pack?resolveReadiness(pack,activity.id):undefined;
  const decision=pack?launchDecision(readiness):{allowed:true         };
  return {
    id:activity.id,
    type:activity.type,
    title:activity.title,
    goal:activity.goal,
    accessibility:[...activity.accessibilityProfile],
    launchable:decision.allowed,
    ...(decision.allowed?{}:{unavailableMessage:readinessMessage(decision.reasons)}),
  };
}

export function buildLearningHubModel(learningUnitId       ,data                       )                  {
  const unit=data.units.find(x=>x.id===learningUnitId);
  if(!unit) throw new Error(`LEARNING_UNIT_NOT_FOUND:${learningUnitId}`);
  const primary=data.mappings.find(x=>x.learningUnitId===learningUnitId&&x.role==='primary');
  if(!primary) throw new Error(`PRIMARY_MAPPING_NOT_FOUND:${learningUnitId}`);
  if(!primary.theoryActivityId) throw new Error(`THEORY_ACTIVITY_NOT_FOUND:${learningUnitId}`);
  const theory=data.theories.find(x=>x.id===primary.theoryActivityId);
  if(!theory) throw new Error(`THEORY_ACTIVITY_NOT_FOUND:${primary.theoryActivityId}`);
  const practice=data.practices.find(x=>x.id===primary.practiceActivityId);
  if(!practice) throw new Error(`PRACTICE_ACTIVITY_NOT_FOUND:${primary.practiceActivityId}`);
  const conceptMap=new Map(data.concepts.map(x=>[x.id,x]));
  const resolveConcept=(id       )=>({id,name:conceptMap.get(id)?.name??id});
  const supporting=data.mappings
    .filter(x=>x.learningUnitId===learningUnitId&&x.role==='supporting')
    .map(x=>data.practices.find(p=>p.id===x.practiceActivityId))
    .filter((x)                      =>Boolean(x))
    .map(p=>studentPractice(p,data.readiness));

  return {
    id:unit.id,
    grade:unit.grade,
    title:unit.title,
    chapter:unit.chapter,
    learningOutcomes:[...unit.learningOutcomes],
    prerequisites:unit.prerequisiteConceptIds.map(resolveConcept),
    concepts:unit.conceptIds.map(resolveConcept),
    theory:{
      id:theory.id,
      title:theory.title,
      blocks:theory.explanationBlocks.map(block=>({type:block.type,text:block.text})),
      representationModes:[...theory.representationModes],
    },
    primaryPractice:studentPractice(practice,data.readiness),
    supportingPractices:supporting,
    externalLabs:(data.externalLabs??[]).map(x=>({id:x.id,provider:x.provider,title:x.title,description:x.description,mode:x.mode,status:x.status})),
    assessment:(()=>{
      const pack=data.assessmentPrompts===undefined?undefined:validatePromptPack(data.assessmentPrompts);
      const all=(pack?.items??[]).filter(x=>x.learningUnitId===learningUnitId);
      const approved=all.filter(isApproved);
      return {assessmentId:assessmentIdFor(learningUnitId),version:String(pack?.version??'0.0.0'),items:approved.map(toPromptView),pendingCount:all.length-approved.length};
    })(),
    pilot:Boolean(data.readiness?.pilotLearningUnitIds.includes(learningUnitId)),
    assessmentAvailability:(()=>{
      const unitReadiness=data.readiness?.units?.find(u=>u.learningUnitId===learningUnitId);
      const status                       =unitReadiness?.assessment.status??'NONE';
      return status==='AVAILABLE'?{status}:{status,message:readinessMessage(unitReadiness?.assessment.reasons.length?unitReadiness.assessment.reasons:['ASSESSMENT_NOT_AVAILABLE'])};
    })(),
  };
}
