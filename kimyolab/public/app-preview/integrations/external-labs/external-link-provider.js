                                                                                                                    
import {validateExternalLabUrl} from './url-policy.js';

export class ExternalLinkLabProvider                                {
           id                            ;
  constructor(id                            ){this.id=id;}
  readiness(binding                   )                          {
    if(binding.provider!==this.id||binding.status==='disabled') return {provider:this.id,ready:false,code:'DISABLED',retryable:false};
    const ready=binding.status==='active'&&validateExternalLabUrl(binding.provider,binding.externalUrl).ok;
    return {provider:this.id,ready,code:ready?'READY':'PROVIDER_UNAVAILABLE',retryable:false};
  }
  canLaunch(binding                   ){return this.readiness(binding).ready;}
  async launch(binding                   ,_context                        )                            {
    if(!this.canLaunch(binding)||!binding.externalUrl) throw new Error('EXTERNAL_LAB_NOT_AVAILABLE');
    const opened=globalThis.open?.(binding.externalUrl,'_blank','noopener,noreferrer');
    if(!opened) throw new Error('EXTERNAL_LAB_POPUP_BLOCKED');
    return {binding,close:async()=>{try{opened.close();}catch{}}};
  }
}
