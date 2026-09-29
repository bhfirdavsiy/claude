import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {validateExternalLabBindings} from '../src/integrations/external-labs/registry.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bindings=validateExternalLabBindings(JSON.parse(fs.readFileSync(path.join(root,'content-src/external-lab-bindings.json'),'utf8')));
const sdkArtifact=path.join(root,'public','vendor','nobook','postmate.js');
const requiredEnv=['NOBOOK_APP_KEY','NOBOOK_APP_SECRET','NOBOOK_PID_SCOPE','NOBOOK_EXPERIMENT_URL','NOBOOK_SDK_SHA256'];
const missingEnv=requiredEnv.filter(name=>!process.env[name]);
const sdkReady=fs.existsSync(sdkArtifact);
const sdkChecksum=sdkReady?crypto.createHash('sha256').update(fs.readFileSync(sdkArtifact)).digest('hex'):null;
const sdkChecksumValid=Boolean(sdkChecksum&&process.env.NOBOOK_SDK_SHA256&&/^[a-f0-9]{64}$/i.test(process.env.NOBOOK_SDK_SHA256)&&sdkChecksum===process.env.NOBOOK_SDK_SHA256.toLowerCase());
let experimentUrlValid=false;
if(process.env.NOBOOK_EXPERIMENT_URL){try{const u=new URL(process.env.NOBOOK_EXPERIMENT_URL);experimentUrlValid=u.protocol==='https:'&&(u.hostname==='nobook.com'||u.hostname.endsWith('.nobook.com'));}catch{}}
const nobookBindings=bindings.filter(x=>x.provider==='nobook');
const linkBindings=bindings.filter(x=>x.provider!=='nobook'&&x.status==='active');
const partnerConfigured=missingEnv.length===0&&experimentUrlValid;
const nobookReady=partnerConfigured&&sdkReady&&sdkChecksumValid;
const report={
  generatedAt:new Date().toISOString(),
  status:nobookReady?'READY':'READY_WITH_EXTERNAL_BLOCKER',
  bindingCount:bindings.length,
  readyReferenceBindings:linkBindings.length,
  nobook:{bindings:nobookBindings.length,partnerConfigured,sdkReady,sdkChecksumValid,experimentUrlValid,missing:missingEnv.concat(sdkReady?[]:['NOBOOK_SDK_ARTIFACT']),sdkVersion:process.env.NOBOOK_SDK_VERSION||'2.2.1'},
  safety:{secretsExposed:false,localAssessmentRequired:bindings.every(x=>x.localAssessmentRequired),externalCompletionAwardsMastery:false},
  next:nobookReady?'Run production browser evidence on the configured provider.':'Obtain NOBOOK partner credentials, an official HTTPS experiment URL, and a licensed SDK artifact at public/vendor/nobook/postmate.js with its SHA-256 pinned in NOBOOK_SDK_SHA256.',
};
fs.mkdirSync(path.join(root,'reports'),{recursive:true});
fs.writeFileSync(path.join(root,'reports/external-provider-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
