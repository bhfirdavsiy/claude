export interface ContentPointer {
  activeVersion:string;
  checksum:string;
  manifest:string;
  previousVersion?:string;
}

export interface RuntimeContentManifest {
  contentVersion:string;
  schemaVersion:string;
  checksum:string;
  compatibility:{minAppVersion:string;maxAppVersion?:string};
}

export interface AppCompatibility {
  appVersion:string;
  supportedSchemaRange:{min:string;max:string};
}

export type CompatibilityResult =
  | {status:'allow';version:string}
  | {status:'block';code:'CONTENT_POINTER_INVALID'|'CONTENT_VERSION_POINTER_MISMATCH'|'CONTENT_CHECKSUM_MISMATCH'|'APP_VERSION_INCOMPATIBLE'|'SCHEMA_VERSION_INCOMPATIBLE'};

function numericVersion(value:string):number[]{
  const parts=value.split('.').map((part)=>Number(part));
  return parts.every(Number.isFinite)?parts:[Number.NaN];
}

export function compareVersion(a:string,b:string):number{
  const left=numericVersion(a), right=numericVersion(b);
  if(Number.isNaN(left[0])||Number.isNaN(right[0])) return a.localeCompare(b,undefined,{numeric:true});
  const length=Math.max(left.length,right.length);
  for(let i=0;i<length;i++){
    const delta=(left[i]??0)-(right[i]??0);
    if(delta!==0) return delta<0?-1:1;
  }
  return 0;
}

export function evaluateContentPackCompatibility(
  pointer:ContentPointer,
  manifest:RuntimeContentManifest,
  app:AppCompatibility,
):CompatibilityResult {
  if(!pointer?.activeVersion||!pointer?.checksum||!pointer?.manifest) return {status:'block',code:'CONTENT_POINTER_INVALID'};
  if(pointer.activeVersion!==manifest.contentVersion) return {status:'block',code:'CONTENT_VERSION_POINTER_MISMATCH'};
  if(pointer.checksum!==manifest.checksum) return {status:'block',code:'CONTENT_CHECKSUM_MISMATCH'};
  if(compareVersion(app.appVersion,manifest.compatibility.minAppVersion)<0) return {status:'block',code:'APP_VERSION_INCOMPATIBLE'};
  if(manifest.compatibility.maxAppVersion&&compareVersion(app.appVersion,manifest.compatibility.maxAppVersion)>0) return {status:'block',code:'APP_VERSION_INCOMPATIBLE'};
  if(compareVersion(manifest.schemaVersion,app.supportedSchemaRange.min)<0||compareVersion(manifest.schemaVersion,app.supportedSchemaRange.max)>0) return {status:'block',code:'SCHEMA_VERSION_INCOMPATIBLE'};
  return {status:'allow',version:manifest.contentVersion};
}
