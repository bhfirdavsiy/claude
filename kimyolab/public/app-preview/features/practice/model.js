                                                                    

                                        
               
            
           
           
                    
                   
           
                     

                                           
            
                                
               
              
                         
                                                                                     
                                                                          
                                           
                                     
                         
                        
                       
                        
                            
                                                                                                      
             
                    
                                                                         
                    
                      
                        
                 
                  
                     
    
 

export function buildPracticePageModel(input  
                            
                                  
                                                                  
                                           
                                     
                        
                       
                        
                            
                  
                    
                  
                    
                      
               
                
                   
 )                          {
  return {
    id:input.activity.id,
    type:input.activity.type,
    title:input.activity.title,
    goal:input.activity.goal,
    accessibility:[...input.activity.accessibilityProfile],
    learningUnit:{id:input.unit.id,grade:input.unit.grade,title:input.unit.title,...(Array.isArray(input.unit.conceptIds)?{conceptIds:[...input.unit.conceptIds]}:{})},
    configFamily:input.configFamily,
    referenceConfig:structuredClone(input.referenceConfig),
    activityVersion:String(input.activity.version??'0'),
    contentVersion:input.contentVersion,
    schemaVersion:input.schemaVersion,
    scoringVersion:input.scoringVersion,
    ...(input.curriculumVersion?{curriculumVersion:input.curriculumVersion}:{}),
    legacyContent:structuredClone((input.activity       ).legacyContent??{}),
    chemistry:{
      reactions:structuredClone(input.reactions),
      solutionRules:structuredClone(input.solutionRules),
      hydrolysis:input.hydrolysis===undefined?undefined:structuredClone(input.hydrolysis),
      electrolysis:input.electrolysis===undefined?undefined:structuredClone(input.electrolysis),
      manganeseRedox:input.manganeseRedox===undefined?undefined:structuredClone(input.manganeseRedox),
      organic:input.organic===undefined?undefined:structuredClone(input.organic),
      kinetics:input.kinetics===undefined?undefined:structuredClone(input.kinetics),
      equilibrium:input.equilibrium===undefined?undefined:structuredClone(input.equilibrium),
    },
  };
}
