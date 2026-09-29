                                                                    
                                                                                      
                                                                                                                             
import {PracticeRouter,                          } from '../practice-router/router.js';
                                                                         

                                                                                                                                                                                                                                                                                                                                            
                                                                             
                                                                                                                                                                                                                                                                                                                                                                                                                       
                                                              
const capabilities=new Set                   (['organic-structure-model','organic-valence-model','organic-isomerism','organic-reaction-template','organic-nomenclature','homologous-series','cyclic-structure-model','organic-polymerization','organic-addition','aromatic-structure','organic-qualitative-reaction','saponification','carbohydrate-reaction-model']);
const tasks=new Set                       (['molecule-property','isomer-count','homolog-formula','reaction-type','reaction-product','experiment-reaction']);
function obj(v        )                            {return !!v&&typeof v==='object'&&!Array.isArray(v)}
function text(v        )            {return typeof v==='string'&&v.length>0}
export function loadBeta2OrganicRegistry(raw        )                     {
 if(!obj(raw))throw new Error('BETA2_ORGANIC_INVALID:root');const out                     ={};
 for(const [id,v] of Object.entries(raw)){
  if(!obj(v)||!capabilities.has(v.capability                     )||!['simulation','trainer','experiment'].includes(String(v.type))||!text(v.version)||!text(v.conceptId)||!tasks.has(v.task       ))throw new Error(`BETA2_ORGANIC_INVALID:${id}`);
  const c=v                            ;
  if(c.task==='molecule-property'&&(!text(c.moleculeId)||!text(c.property)))throw new Error(`BETA2_ORGANIC_INVALID:${id}:molecule-property`);
  if(c.task==='isomer-count'&&!text(c.formula))throw new Error(`BETA2_ORGANIC_INVALID:${id}:isomer-count`);
  if(c.task==='homolog-formula'&&(!text(c.series)||!Number.isInteger(c.carbonCount)))throw new Error(`BETA2_ORGANIC_INVALID:${id}:homolog-formula`);
  if(['reaction-type','reaction-product','experiment-reaction'].includes(c.task)&&!text(c.reactionId))throw new Error(`BETA2_ORGANIC_INVALID:${id}:reaction`);
  if(c.task==='experiment-reaction'&&(!Array.isArray(c.requiredActions)||!c.requiredActions.length))throw new Error(`BETA2_ORGANIC_INVALID:${id}:actions`);
  out[id]=c;
 }return out;
}
                                                                                                                                          
function meta(a                 ,c              ,o        ){return {conceptId:c.conceptId,activityId:a.id,activityVersion:a.version,contentVersion:o.contentVersion,scoringVersion:o.scoringVersion,createdAt:o.now()}}
function norm(v        ){return String(v).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')}
function expected(c              ,k                     )        {
 if(c.task==='molecule-property'){const m=k.molecule(c.moleculeId );if(!m.modeled)throw new Error(m.code);return (m       )[c.property ];}
 if(c.task==='isomer-count')return k.isomers(c.formula ).length;
 if(c.task==='homolog-formula'){const h=k.homolog(c.series ,c.carbonCount );if(!h.modeled)throw new Error(h.code);return h.formula;}
 if(c.task==='reaction-type'){const r=k.reaction(c.reactionId );if(!r.modeled)throw new Error(r.code);return r.reactionType;}
 if(c.task==='reaction-product'){const r=k.reaction(c.reactionId );if(!r.modeled)throw new Error(r.code);return r.productIds[c.productIndex??0];}
 return undefined;
}
export function createBeta2OrganicRouter(o        ){
 const router=new PracticeRouter                       ();
 const simulation                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='simulation')throw new Error(`BETA2_ORGANIC_CONFIG_MISSING:${a.id}`);const exp=expected(c,o.knowledge);const field=c.field??c.property??'value';const actions=ctx.inputs[a.id]?.simulationActions??[];const value=([...actions].reverse().find((x    )=>x.field===field)       )?.value;const achieved=norm(value)===norm(exp);const ev                     ={...meta(a,c,o),id:`${a.id}.organic.${field}`,score:achieved?1:0,evidenceClass:'practice-observation',type:'construction',targetId:`${c.task}:${field}`,achieved,independenceKey:`${a.id}:${field}`};return {evidence:[ev],serializedState:JSON.stringify({field,value,expected:exp,achieved})};}};
 const trainer                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='trainer')throw new Error(`BETA2_ORGANIC_CONFIG_MISSING:${a.id}`);const exp=expected(c,o.knowledge);const answers=ctx.inputs[a.id]?.trainerAnswers??[];const answer=answers.at(-1)??'';const correct=norm(answer)===norm(exp);const ev               ={...meta(a,c,o),id:`${a.id}.organic.answer.${answers.length||1}`,score:correct?1:0,evidenceClass:'trainer-calculation',type:'answer',questionId:`${c.task}:${c.moleculeId??c.reactionId??c.formula??c.series}`,correct,independenceKey:`${a.id}:organic-answer`};return {evidence:[ev],serializedState:JSON.stringify({answer,expected:exp,correct})};}};
 const experiment                                             ={async run(a,ctx){const c=o.registry[a.id];if(!c||c.type!=='experiment'||c.task!=='experiment-reaction')throw new Error(`BETA2_ORGANIC_CONFIG_MISSING:${a.id}`);const r=o.knowledge.reaction(c.reactionId );if(!r.modeled)throw new Error(r.code);const actions=ctx.inputs[a.id]?.actions??[];const types=new Set(actions.map(x=>x.type));const complete=c.requiredActions .every(x=>types.has(x));const evidence           =[];if(complete){for(const step of c.requiredActions ){evidence.push({...meta(a,c,o),id:`${a.id}.procedure.${step}`,score:1,evidenceClass:'practice-observation',type:'procedure',stepId:step,accepted:true,independenceKey:`${a.id}:${step}`}                     );}evidence.push({...meta(a,c,o),id:`${a.id}.observation`,score:1,evidenceClass:'practice-observation',type:'observation',observation:r.observation       ,independenceKey:`${a.id}:observation`}                       );}return {evidence,serializedState:JSON.stringify({complete,reaction:r})};}};
 router.register('simulation',simulation);router.register('trainer',trainer);router.register('experiment',experiment);return router;
}
