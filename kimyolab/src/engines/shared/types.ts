export interface EngineCapabilities {
  keyboard:boolean;
  touch:boolean;
  offline:boolean;
  reducedMotion:boolean;
  lowEndFallback:boolean;
  serializable:boolean;
}

export function completeCapabilities():EngineCapabilities {
  return {keyboard:true,touch:true,offline:true,reducedMotion:true,lowEndFallback:true,serializable:true};
}

function major(version:string):number|null {
  const m=/^(?:\^)?(\d+)\./.exec(version.trim());
  return m?Number(m[1]):null;
}

export function checkEngineCompatibility(engineVersion:string,range:string):{compatible:true}|{compatible:false;code:'ENGINE_CONFIG_INCOMPATIBLE'} {
  const e=major(engineVersion), r=major(range);
  return e!==null&&r!==null&&e===r?{compatible:true}:{compatible:false,code:'ENGINE_CONFIG_INCOMPATIBLE'};
}
