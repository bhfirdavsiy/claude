import type {ExternalLabBinding,ExternalLabProvider,ExternalLabSession,ExternalProviderReadiness} from './types.ts';

export class ExternalLinkLabProvider implements ExternalLabProvider {
  readonly id:'chemai'|'chem-lab-station';
  constructor(id:'chemai'|'chem-lab-station'){this.id=id;}
  readiness(binding:ExternalLabBinding):ExternalProviderReadiness{
    if(binding.provider!==this.id||binding.status==='disabled') return {provider:this.id,ready:false,code:'DISABLED',retryable:false};
    const ready=binding.status==='active'&&typeof binding.externalUrl==='string'&&binding.externalUrl.startsWith('https://');
    return {provider:this.id,ready,code:ready?'READY':'PROVIDER_UNAVAILABLE',retryable:false};
  }
  canLaunch(binding:ExternalLabBinding){return this.readiness(binding).ready;}
  async launch(binding:ExternalLabBinding,_context:{learningUnitId:string}):Promise<ExternalLabSession>{
    if(!this.canLaunch(binding)||!binding.externalUrl) throw new Error('EXTERNAL_LAB_NOT_AVAILABLE');
    const opened=globalThis.open?.(binding.externalUrl,'_blank','noopener,noreferrer');
    if(!opened) throw new Error('EXTERNAL_LAB_POPUP_BLOCKED');
    return {binding,close:async()=>{try{opened.close();}catch{}}};
  }
}
