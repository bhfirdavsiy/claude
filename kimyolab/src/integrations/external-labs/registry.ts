import type {ExternalLabBinding} from './types.ts';
import {validateExternalLabUrl} from './url-policy.ts';

export function validateExternalLabBindings(input:unknown):ExternalLabBinding[] {
  if(!Array.isArray(input)) throw new Error('EXTERNAL_LAB_BINDINGS_INVALID');
  const ids=new Set<string>();
  return input.map((raw:any,index)=>{
    if(!raw||typeof raw!=='object') throw new Error(`EXTERNAL_LAB_BINDING_INVALID:${index}`);
    const id=String(raw.id??'');
    if(!/^ext\.[a-z0-9.-]+$/i.test(id)||ids.has(id)) throw new Error(`EXTERNAL_LAB_BINDING_ID_INVALID:${id}`);
    ids.add(id);
    if(!['nobook','chemai','chem-lab-station'].includes(raw.provider)) throw new Error(`EXTERNAL_LAB_PROVIDER_INVALID:${id}`);
    if(!['embed','deep-link','reference'].includes(raw.mode)) throw new Error(`EXTERNAL_LAB_MODE_INVALID:${id}`);
    if(!['active','requires_partner_access','disabled'].includes(raw.status)) throw new Error(`EXTERNAL_LAB_STATUS_INVALID:${id}`);
    if(!Array.isArray(raw.learningUnitIds)||raw.learningUnitIds.length===0||raw.learningUnitIds.some((x:any)=>!/^lu\.(7|8|9|10|11)\.[A-Za-z0-9.-]+$/.test(String(x)))) throw new Error(`EXTERNAL_LAB_LEARNING_UNIT_INVALID:${id}`);
    if(raw.provider==='nobook'&&![9,10,27].includes(Number(raw.nobookModuleId))) throw new Error(`EXTERNAL_LAB_NOBOOK_MODULE_INVALID:${id}`);
    if(raw.provider!=='nobook'&&typeof raw.externalUrl!=='string') throw new Error(`EXTERNAL_LAB_URL_MISSING:${id}`);
    if(raw.externalUrl!==undefined){const verdict=validateExternalLabUrl(raw.provider,raw.externalUrl);if(!verdict.ok) throw new Error(`${verdict.code}:${id}`);}
    return {
      id,
      provider:raw.provider,
      mode:raw.mode,
      status:raw.status,
      title:String(raw.title??id),
      description:String(raw.description??''),
      learningUnitIds:raw.learningUnitIds.map(String),
      ...(typeof raw.externalUrl==='string'?{externalUrl:raw.externalUrl}:{}),
      ...(raw.nobookModuleId?{nobookModuleId:Number(raw.nobookModuleId) as 9|10|27}:{}),
      ...(raw.nobookResourceId?{nobookResourceId:String(raw.nobookResourceId)}:{}),
      evidencePolicy:raw.evidencePolicy,
      localAssessmentRequired:raw.localAssessmentRequired!==false,
    } satisfies ExternalLabBinding;
  });
}

export function bindingsForLearningUnit(bindings:ExternalLabBinding[],learningUnitId:string){
  return bindings.filter(binding=>binding.status!=='disabled'&&binding.learningUnitIds.includes(learningUnitId));
}
