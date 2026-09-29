export interface ReleaseManifestFile {path:string;sourcePath:string}

export function validateReleaseLicensing(input:{files:ReleaseManifestFile[];unlicensedSourceRefs:string[]}){
  const allowed=(sourcePath:string)=>sourcePath==='index.html'||sourcePath.startsWith('public/app-preview/')||sourcePath.startsWith('public/content/')||sourcePath.startsWith('public/assets/home/');
  const disallowedProvenance=input.files.filter(file=>!allowed(file.sourcePath)).map(file=>file.sourcePath).sort();
  return {
    totalReleaseFiles:input.files.length,
    disallowedProvenance,
    unlicensedSourceRefs:[...input.unlicensedSourceRefs].sort(),
    releaseReady:disallowedProvenance.length===0&&input.unlicensedSourceRefs.length===0,
  };
}
