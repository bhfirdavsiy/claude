                                                                                        

const ALLOWED                               ={
  route_opened:['route'],
  activity_loaded:['activityType','grade'],
  engine_error:['code','engine'],
  performance:['metric','value','unit','route'],
};

export function sanitizeTelemetryEvent(input                                             ){
  if(!(input.kind in ALLOWED)) throw new Error('TELEMETRY_EVENT_NOT_ALLOWED');
  const kind=input.kind                 ;
  const payload                       ={};
  for(const key of ALLOWED[kind]){
    const value=input.payload?.[key];
    if(value===undefined) continue;
    if(typeof value==='string'||typeof value==='number'||typeof value==='boolean') payload[key]=value;
  }
  return {kind,payload};
}
