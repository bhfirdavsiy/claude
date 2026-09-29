                                                                                                 

// External lab evidence validation (P0.12). Applied on save AND on restore.

export const EXTERNAL_EVIDENCE_LIMITS=Object.freeze({
  /** Serialized record upper bound (bytes, UTF-16 length approximation is avoided by measuring UTF-8). */
  maxRecordBytes:1_500_000,
  maxSceneDataBytes:1_000_000,
  maxScreenshotBytes:400_000,
  maxNoteChars:4000,
});

                                                                        
            
                  
 

const PROVIDERS=new Set                       (['nobook','chemai','chem-lab-station']);
const POLICIES=new Set                        (['scene_state','self_report','none']);
const ALLOWED_KEYS=new Set(['provider','bindingId','learningUnitId','evidencePolicy','capturedAt','sceneData','screenshotDataUrl','note','id','storedAt']);

export function externalEvidenceKey(bindingId       ,learningUnitId       ){return `${bindingId}::${learningUnitId}`;}

function fail(message       )      {throw new Error(`EXTERNAL_EVIDENCE_INVALID: ${message}`);}
function utf8Bytes(value       ){return new TextEncoder().encode(value).length;}

export function validateExternalLabEvidence(input        ,expected                                                         )                    {
  if(typeof input!=='object'||input===null||Array.isArray(input)) fail('record required');
  const raw=input                          ;
  for(const key of Object.keys(raw)) if(!ALLOWED_KEYS.has(key)) fail(`unknown property ${key}`);
  if(!PROVIDERS.has(raw.provider                         )) fail('unknown provider');
  if(raw.provider!==expected.provider) fail('provider does not match binding');
  if(raw.bindingId!==expected.bindingId) fail('bindingId does not match activity binding');
  if(raw.learningUnitId!==expected.learningUnitId) fail('learningUnitId does not match activity binding');
  if(!POLICIES.has(raw.evidencePolicy                          )) fail('unknown evidencePolicy');
  if(typeof raw.capturedAt!=='string'||!Number.isFinite(Date.parse(raw.capturedAt))) fail('capturedAt must be an ISO date');
  if(raw.sceneData!==undefined){
    if(typeof raw.sceneData!=='string') fail('sceneData must be text');
    if(utf8Bytes(raw.sceneData)>EXTERNAL_EVIDENCE_LIMITS.maxSceneDataBytes) fail('sceneData too large');
    if(raw.evidencePolicy!=='scene_state') fail('sceneData only allowed for scene_state policy');
  }
  if(raw.screenshotDataUrl!==undefined){
    if(typeof raw.screenshotDataUrl!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.screenshotDataUrl)) fail('screenshotDataUrl must be a base64 PNG/JPEG/WebP data URL');
    if(raw.screenshotDataUrl.length>EXTERNAL_EVIDENCE_LIMITS.maxScreenshotBytes) fail('screenshot too large');
  }
  if(raw.note!==undefined){
    if(typeof raw.note!=='string') fail('note must be text');
    if(raw.note.length>EXTERNAL_EVIDENCE_LIMITS.maxNoteChars) fail('note too long');
    if(raw.evidencePolicy!=='self_report') fail('note only allowed for self_report policy');
  }
  const out                    ={
    provider:raw.provider                         ,
    bindingId:raw.bindingId          ,
    learningUnitId:raw.learningUnitId          ,
    evidencePolicy:raw.evidencePolicy                          ,
    capturedAt:raw.capturedAt          ,
    ...(raw.sceneData!==undefined?{sceneData:raw.sceneData          }:{}),
    ...(raw.screenshotDataUrl!==undefined?{screenshotDataUrl:raw.screenshotDataUrl          }:{}),
    ...(raw.note!==undefined?{note:raw.note          }:{}),
  };
  if(utf8Bytes(JSON.stringify(out))>EXTERNAL_EVIDENCE_LIMITS.maxRecordBytes) fail('payload too large');
  return out;
}
