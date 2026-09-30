                                                                    
                                                                                           
                                                                                   
                                                                         

                                           
            
                                
               
              
                         
                                                                                     
                                                                          
                                                                                            
                                      
                                                                                                  
                                      
                                     
                         
                        
                       
                        
                            
                                                                                                      
                                                                                                       
                                                   
             
                    
                                                                         
                    
                      
                        
                 
                  
                     
                                                                                         
                   
    
 

export function buildPracticePageModel(input  
                            
                                  
                                                                  
                                      
                                      
                                     
                        
                       
                        
                            
                  
                    
                  
                    
                      
               
                
                   
                 
                                   
 )                          {
  return {
    id:input.activity.id,
    type:input.activity.type,
    title:input.activity.title,
    goal:input.activity.goal,
    accessibility:[...input.activity.accessibilityProfile],
    learningUnit:{id:input.unit.id,grade:input.unit.grade,title:input.unit.title,...(Array.isArray(input.unit.conceptIds)?{conceptIds:[...input.unit.conceptIds]}:{})},
    executionPlan:(()=>{
      const plan=input.executionPlan;
      if(plan.activityId!==input.activity.id||plan.engine!==input.activity.type) throw new Error('EXECUTION_PLAN_ACTIVITY_MISMATCH');
      return {...plan};
    })(),
    readiness:(()=>{
      if(input.readiness.activityId!==input.activity.id) throw new Error('READINESS_ACTIVITY_MISMATCH');
      return structuredClone(input.readiness);
    })(),
    referenceConfig:structuredClone(input.referenceConfig),
    activityVersion:String(input.activity.version??'0'),
    contentVersion:input.contentVersion,
    schemaVersion:input.schemaVersion,
    scoringVersion:input.scoringVersion,
    ...(input.curriculumVersion?{curriculumVersion:input.curriculumVersion}:{}),
    legacyContent:structuredClone((input.activity       ).legacyContent??{}),
    ...(input.elementNames?{localization:{elementNames:input.elementNames}}:{}),
    chemistry:{
      reactions:structuredClone(input.reactions),
      solutionRules:structuredClone(input.solutionRules),
      hydrolysis:input.hydrolysis===undefined?undefined:structuredClone(input.hydrolysis),
      electrolysis:input.electrolysis===undefined?undefined:structuredClone(input.electrolysis),
      manganeseRedox:input.manganeseRedox===undefined?undefined:structuredClone(input.manganeseRedox),
      organic:input.organic===undefined?undefined:structuredClone(input.organic),
      kinetics:input.kinetics===undefined?undefined:structuredClone(input.kinetics),
      equilibrium:input.equilibrium===undefined?undefined:structuredClone(input.equilibrium),
      species:input.species===undefined?undefined:structuredClone(input.species),
    },
  };
}
