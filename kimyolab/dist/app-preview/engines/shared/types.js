                                     
                   
                
                  
                        
                         
                       
 

export function completeCapabilities()                    {
  return {keyboard:true,touch:true,offline:true,reducedMotion:true,lowEndFallback:true,serializable:true};
}

function major(version       )             {
  const m=/^(?:\^)?(\d+)\./.exec(version.trim());
  return m?Number(m[1]):null;
}

export function checkEngineCompatibility(engineVersion       ,range       )                                                                        {
  const e=major(engineVersion), r=major(range);
  return e!==null&&r!==null&&e===r?{compatible:true}:{compatible:false,code:'ENGINE_CONFIG_INCOMPATIBLE'};
}
