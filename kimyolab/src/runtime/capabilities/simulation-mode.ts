export interface SimulationCapabilities {
  webgl:boolean;
  canvas2d:boolean;
  svg:boolean;
  memoryGb?:number;
  reducedMotion:boolean;
  rendererFailures:number;
}

export type SimulationMode='3d'|'2d'|'static'|'text';

export function selectSimulationMode(capabilities:SimulationCapabilities):SimulationMode{
  const constrained=!capabilities.webgl
    || (typeof capabilities.memoryGb==='number'&&capabilities.memoryGb<2)
    || capabilities.reducedMotion
    || capabilities.rendererFailures>=2;
  if(!constrained) return '3d';
  if(capabilities.canvas2d) return '2d';
  if(capabilities.svg) return 'static';
  return 'text';
}
