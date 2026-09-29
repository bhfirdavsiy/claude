import type {ExternalLabBinding,ExternalLabEvidence,ExternalLabProvider,ExternalLabSession,ExternalProviderReadiness} from '../types.ts';

type Communication={
  get(method:string,param?:unknown):Promise<any>;
  on(event:string,handler:(data:any)=>void):void;
};
type PostmateCtor=new(options:{iframe:HTMLIFrameElement;printlog?:boolean})=>{init(url:string):Promise<Communication>};

async function loadPostmate():Promise<PostmateCtor>{
  const injected=(globalThis as any).__KIMYOLAB_NOBOOK_POSTMATE__;
  if(injected) return injected as PostmateCtor;
  try{
    const sdkUrl='/vendor/nobook/postmate.js';
    const sdk:any=await import(sdkUrl);
    const ctor=sdk.default??sdk.Postmate;
    if(typeof ctor!=='function') throw new Error('NOBOOK_SDK_EXPORT_INVALID');
    (globalThis as any).__KIMYOLAB_NOBOOK_POSTMATE__=ctor;
    return ctor as PostmateCtor;
  }catch(error){
    if(error instanceof Error&&error.message==='NOBOOK_SDK_EXPORT_INVALID') throw error;
    throw new Error('NOBOOK_SDK_NOT_INSTALLED');
  }
}

async function getSessionConfig(binding:ExternalLabBinding,learningUnitId:string,learnerRef:string){
  const response=await fetch('/api/external-labs/nobook/session',{
    method:'POST',headers:{'Content-Type':'application/json'},
    // The server derives provider/module from the canonical binding; the client only names it.
    body:JSON.stringify({bindingId:binding.id,learningUnitId,learnerRef}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(String(body?.code??'NOBOOK_SESSION_FAILED'));
  if(typeof body.experimentalUrl!=='string') throw new Error('NOBOOK_EXPERIMENT_URL_MISSING');
  return body as {experimentalUrl:string};
}

export class NobookLabProvider implements ExternalLabProvider {
  readonly id='nobook' as const;
  async readiness(binding:ExternalLabBinding):Promise<ExternalProviderReadiness>{
    if(binding.provider!=='nobook'||binding.status==='disabled') return {provider:'nobook',ready:false,code:'DISABLED',retryable:false};
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),4000);
    try{
      const r=await fetch('/api/external-labs/nobook/status',{signal:controller.signal});
      const body=await r.json().catch(()=>({}));
      const ready=r.ok&&Boolean(body.configured)&&Boolean(body.sdkReady);
      if(ready) return {provider:'nobook',ready:true,code:'READY',retryable:true};
      return {provider:'nobook',ready:false,code:'PARTNER_CONFIGURATION_REQUIRED',retryable:true};
    }catch{return {provider:'nobook',ready:false,code:'PROVIDER_UNAVAILABLE',retryable:true};}
    finally{clearTimeout(timer);}
  }
  async canLaunch(binding:ExternalLabBinding){return (await this.readiness(binding)).ready;}
  async launch(binding:ExternalLabBinding,context:{learningUnitId:string;mount?:HTMLElement;learnerRef?:string}):Promise<ExternalLabSession>{
    if(!context.mount) throw new Error('NOBOOK_MOUNT_REQUIRED');
    if(!context.learnerRef) throw new Error('NOBOOK_LEARNER_REF_REQUIRED');
    const iframe=document.createElement('iframe');
    iframe.className='kl-external-lab-frame';
    iframe.title=binding.title;
    iframe.setAttribute('allow','fullscreen');
    context.mount.replaceChildren(iframe);
    const [{experimentalUrl},Postmate]=await Promise.all([getSessionConfig(binding,context.learningUnitId,context.learnerRef),loadPostmate()]);
    const handshake=new Postmate({iframe,printlog:false});
    const communication=await handshake.init(experimentalUrl);
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('NOBOOK_LOAD_TIMEOUT')),20000);
      communication.on('onload',async()=>{clearTimeout(timer);try{await communication.get('config',{topToolbarVisible:false,titleVisible:false,leftToolbarVisible:true,rightToolbarVisible:true,bottomToolbarVisible:true,settingsMenuVisible:true,saveButtonVisible:true,preventDownload:true});if(binding.nobookModuleId)await communication.get('switchModule',binding.nobookModuleId);resolve();}catch(error){reject(error);}});
      communication.on('onError',()=>{clearTimeout(timer);reject(new Error('NOBOOK_RUNTIME_ERROR'));});
    });
    return {
      binding,
      saveState:async()=>{
        const [sceneData,screenshotDataUrl]=await Promise.all([
          communication.get('getData'),
          communication.get('takeScreenShot',{x:0,y:0,outWidth:480,quality:.8,type:'png'}).catch(()=>undefined),
        ]);
        await communication.get('setSceneSave').catch(()=>undefined);
        return {provider:'nobook',bindingId:binding.id,learningUnitId:context.learningUnitId,evidencePolicy:'scene_state',capturedAt:new Date().toISOString(),sceneData:String(sceneData??''),...(typeof screenshotDataUrl==='string'?{screenshotDataUrl}:{})} satisfies ExternalLabEvidence;
      },
      restoreState:async(evidence)=>{if(evidence.sceneData) await communication.get('setData',evidence.sceneData);},
      close:async()=>{try{await communication.get('stop');}catch{} iframe.remove();},
    };
  }
}
