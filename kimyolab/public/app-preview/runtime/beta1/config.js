                                                                                       

                                                                                             
                                                                
                    
                                                                                                                                                                                                   
                        
                       
 
                                                                
                    
                                                    
                                                   
                  
                    
 
                                                             
                 
                    
                
                           
                  
 
                                                                 
                     
                                                                      
 
                                                          
              
                              
                               
                            
                              
                             
                                                                                                
 
                                                                                                                                      
                                                                   

function obj(v        )                            { return !!v&&typeof v==='object'&&!Array.isArray(v); }
function nonempty(v        )             { return typeof v==='string'&&v.length>0; }
function fail(id       ,reason       )       { throw new Error(`BETA1_CONFIG_INVALID:${id}:${reason}`); }

function validateBase(id       ,v                       )     {
  if(!['experiment','simulation','trainer','calculation','case'].includes(String(v.type))) fail(id,'type');
  if(!nonempty(v.version)) fail(id,'version');
  if(!nonempty(v.conceptId)) fail(id,'conceptId');
}

function validateConfig(id       ,v                       )     {
  validateBase(id,v);
  switch(v.type){
    case 'experiment': {
      if(!obj(v.scenario)||!nonempty(v.scenario.id)||!Array.isArray(v.scenario.steps)||!v.scenario.steps.length) fail(id,'scenario');
      for(const step of v.scenario.steps){
        if(!obj(step)||!nonempty(step.id)||!nonempty(step.actionType)||!nonempty(step.label)) fail(id,'experiment-step');
      }
      break;
    }
    case 'simulation':
      if(!obj(v.initialState)||!obj(v.targetState)||!nonempty(v.targetId)||!Array.isArray(v.controls)||!v.controls.length) fail(id,'simulation');
      break;
    case 'trainer':
      if(!nonempty(v.questionId)||!nonempty(v.prompt)||!Array.isArray(v.acceptedAnswers)||!v.acceptedAnswers.length||v.acceptedAnswers.some(x=>!nonempty(x))) fail(id,'trainer');
      break;
    case 'calculation':
      if(!Array.isArray(v.steps)||!v.steps.length) fail(id,'calculation');
      for(const step of v.steps){
        if(!obj(step)||!nonempty(step.id)||typeof step.value!=='number'||!Number.isFinite(step.value)||!nonempty(step.unit)) fail(id,'calculation-step');
      }
      break;
    case 'case':
      if(!Array.isArray(v.allowedEvidenceIds)||!v.allowedEvidenceIds.length||typeof v.minEvidenceSelections!=='number'||v.minEvidenceSelections<1||!obj(v.rubric)) fail(id,'case');
      for(const key of ['decisionKeywords','scientificKeywords','reasoningKeywords']) if(!Array.isArray(v[key])) fail(id,`case-${key}`);
      break;
  }
}

export function loadBeta1ConfigRegistry(raw        )                    {
  if(!obj(raw)) throw new Error('BETA1_CONFIG_INVALID:root');
  const out                    ={};
  for(const [id,value] of Object.entries(raw)){
    if(!obj(value)) fail(id,'record');
    validateConfig(id,value);
    out[id]=value                                  ;
  }
  return out;
}
