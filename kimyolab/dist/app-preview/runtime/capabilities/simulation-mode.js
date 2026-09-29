                                         
                
                   
              
                   
                        
                          
 

                                                     

export function selectSimulationMode(capabilities                       )               {
  const constrained=!capabilities.webgl
    || (typeof capabilities.memoryGb==='number'&&capabilities.memoryGb<2)
    || capabilities.reducedMotion
    || capabilities.rendererFailures>=2;
  if(!constrained) return '3d';
  if(capabilities.canvas2d) return '2d';
  if(capabilities.svg) return 'static';
  return 'text';
}
