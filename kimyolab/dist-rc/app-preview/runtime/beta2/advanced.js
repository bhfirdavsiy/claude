                                                                                 
                                                                        
                                                                                                 
                                                                                                      
                                                                                                         
                                                                                                                             
import {PracticeRouter,                          } from '../practice-router/router.js';
                                                                         

                                                                                                                        
                                                                                        
                                                                                                                                     
                                                                                                                                                 
                                                                                                                                 
                                                                                                                                      
                                                                                                       
                                                                     

export const BETA2_ADVANCED_CAPABILITIES                    =new Set            (['ionic-equation-trainer','hydrolysis-experiment','electrolysis-experiment','manganese-redox-simulation']);
function obj(v        )                            {return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v        )            {return typeof v==='string'&&v.length>0}
export function loadBeta2AdvancedRegistry(raw        )                      {
  if(!obj(raw)) throw new Error('BETA2_ADVANCED_INVALID:root');
  const out                      ={};
  for(const [id,value] of Object.entries(raw)){
    if(!obj(value)||!BETA2_ADVANCED_CAPABILITIES.has(value.capability              )||!text(value.type)||!text(value.version)||!text(value.conceptId)) throw new Error(`BETA2_ADVANCED_INVALID:${id}`);
    const c=value                                  ;
    if(c.capability==='ionic-equation-trainer'&&(!text(c.reactionId)||!text(c.prompt))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:ionic`);
    if(c.capability==='hydrolysis-experiment'&&(!text(c.salt)||!['acidic','basic','neutral'].includes(c.expectedMedium))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:hydrolysis`);
    if(c.capability==='electrolysis-experiment'&&(!obj(c.query)||!text(c.query.electrolyte))) throw new Error(`BETA2_ADVANCED_INVALID:${id}:electrolysis`);
    if(c.capability==='manganese-redox-simulation'&&!['acidic','neutral','basic'].includes(c.targetMedium)) throw new Error(`BETA2_ADVANCED_INVALID:${id}:manganese`);
    out[id]=c;
  }
  return out;
}

                  
                                 
                          
                                  
                                      
                                     
                        
                        
                 
 
function meta(activity                 ,config                    ,o        ){return {conceptId:config.conceptId,activityId:activity.id,activityVersion:activity.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now()};}
function normalizeEquation(v       ){return v.normalize('NFKC').replace(/->|=>/g,'→').replace(/\s+/g,'').replace(/⇌/g,'→');}

export function createBeta2AdvancedRouter(o        )                                      {
  const router=new PracticeRouter                       ();
  const trainer                                             ={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.capability!=='ionic-equation-trainer')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const expected=o.ionicEngine.netIonicEquation(config.reactionId).equation;
    const answers=context.inputs[activity.id]?.trainerAnswers??[];const answer=answers.at(-1)??'';const correct=normalizeEquation(answer)===normalizeEquation(expected);
    const evidence               ={...meta(activity,config,o),id:`${activity.id}.ionic-answer.${answers.length||1}`,score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:config.reactionId,correct,independenceKey:`${activity.id}:ionic-equation`};
    return {evidence:[evidence],serializedState:JSON.stringify({answer,expected,correct})};
  }};
  const simulation                                             ={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.capability!=='manganese-redox-simulation')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const actions=context.inputs[activity.id]?.simulationActions??[];const medium=(actions.findLast?.((x    )=>x.field==='medium')??[...actions].reverse().find((x    )=>x.field==='medium'))?.value                             ;
    if(!medium)return {evidence:[],serializedState:JSON.stringify({medium:null})};
    const model=o.manganeseModel.resolve(medium);const achieved=medium===config.targetMedium;
    const evidence                     ={...meta(activity,config,o),id:`${activity.id}.manganese.${medium}`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`manganese-${config.targetMedium}`,achieved,independenceKey:`${activity.id}:manganese`};
    return {evidence:[evidence],serializedState:JSON.stringify({medium,model}),model}       ;
  }};
  const experiment                                             ={async run(activity,context){
    const config=o.registry[activity.id];if(!config||config.type!=='experiment')throw new Error(`BETA2_ADVANCED_CONFIG_MISSING:${activity.id}`);
    const actions=context.inputs[activity.id]?.actions??[];
    if(config.capability==='hydrolysis-experiment'){
      const selected=actions.find((a    )=>a.type==='selectSalt')?.payload?.salt                    ;
      const recorded=[...actions].reverse().find((a    )=>a.type==='recordMedium')?.payload?.medium                              ;
      const model=selected?o.hydrolysisModel.classify(selected):{modeled:false         ,code:'HYDROLYSIS_NOT_MODELED'         };
      const achieved=!!selected&&model.modeled&&selected===config.salt&&recorded===model.medium&&recorded===config.expectedMedium;
      const evidence                     ={...meta(activity,config,o),id:`${activity.id}.hydrolysis`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`hydrolysis-${config.salt}-${config.expectedMedium}`,achieved,independenceKey:`${activity.id}:hydrolysis`};
      return {evidence:[evidence],serializedState:JSON.stringify({selected,recorded,model}),model}       ;
    }
    if(config.capability==='electrolysis-experiment'){
      const model=o.electrolysisModel.resolve(config.query);if(!model.modeled)throw new Error(model.code);
      const types=new Set(actions.map(a=>a.type));const completed=['connectCurrent','observeCathode','observeAnode'].every(x=>types.has(x));
      const evidence           =[];
      if(completed){
        for(const stepId of ['connectCurrent','observeCathode','observeAnode']) evidence.push({...meta(activity,config,o),id:`${activity.id}.procedure.${stepId}`,score:1,evidenceClass:'practice-observation',type:'procedure',stepId,accepted:true,independenceKey:`${activity.id}:${stepId}`}                     );
        evidence.push({...meta(activity,config,o),id:`${activity.id}.cathode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'state-change',from:`${config.query.electrolyte}(aq)`,to:`${model.cathode.product}(s)`},independenceKey:`${activity.id}:cathode`}                       );
        evidence.push({...meta(activity,config,o),id:`${activity.id}.anode`,score:1,evidenceClass:'practice-observation',type:'observation',observation:{type:'gas',descriptionKey:model.anode.observation},independenceKey:`${activity.id}:anode`}                       );
      }
      return {evidence,serializedState:JSON.stringify({completed,model}),model}       ;
    }
    throw new Error(`BETA2_ADVANCED_CAPABILITY_INVALID:${activity.id}`);
  }};
  router.register('trainer',trainer);router.register('simulation',simulation);router.register('experiment',experiment);
  return router;
}
