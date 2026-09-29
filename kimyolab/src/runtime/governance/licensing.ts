export interface LicenseRecord {
  pathPrefix:string;
  owner:string;
  source:string;
  license:string;
  allowedUse:string;
  status:'approved'|'pending';
}

export interface LicenseSourceRef {
  id:string;
  type:string;
  title:string;
  license?:string;
}

export function validateLicensing(input:{assets:string[];records:LicenseRecord[];sourceRefs:LicenseSourceRef[]}){
  const pendingAssets:string[]=[];
  const missingAssets:string[]=[];
  for(const asset of input.assets){
    const record=input.records.find((item)=>asset.startsWith(item.pathPrefix));
    if(!record) missingAssets.push(asset);
    else if(record.status!=='approved'||!record.license||record.license==='unknown'||record.allowedUse==='pending') pendingAssets.push(asset);
  }
  const unlicensedSourceRefs=input.sourceRefs
    .filter((ref)=>ref.type!=='internal'&&!ref.license)
    .map((ref)=>ref.id);
  return {
    totalAssets:input.assets.length,
    approvedAssets:input.assets.length-pendingAssets.length-missingAssets.length,
    pendingAssets,
    missingAssets,
    unlicensedSourceRefs,
    releaseReady:pendingAssets.length===0&&missingAssets.length===0&&unlicensedSourceRefs.length===0,
  };
}
