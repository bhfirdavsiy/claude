// Learner-facing mastery (P1.2 — C1). A pedagogical STATE, not a number: the UI never sees a percentage,
// a confidence value or the scoring formula, and never calls computeConceptMastery itself. The view is
// derived from canonical ConceptMastery records computed under the ACTIVE version context.
                                                 
                                                                   
                                                                           

                                                                             

/** Minimum independent sources behind a `mastered` concept (mirrors computeConceptMastery). */
export const MASTERY_MIN_INDEPENDENT_SOURCES=3;

export const MASTERY_BAND_COPY                                                                     =Object.freeze({
  NOT_STARTED:{label:'Boshlanmagan',icon:'○',aria:'O‘zlashtirish holati: boshlanmagan'},
  DEVELOPING:{label:'Rivojlanmoqda',icon:'◐',aria:'O‘zlashtirish holati: rivojlanmoqda'},
  MASTERED:{label:'O‘zlashtirilgan',icon:'●',aria:'O‘zlashtirish holati: o‘zlashtirilgan'},
  NEEDS_REVIEW:{label:'Qayta ko‘rib chiqish kerak',icon:'△',aria:'O‘zlashtirish holati: qayta ko‘rib chiqish kerak'},
});

export const VERSION_UPDATED_COPY='Ushbu mavzu yangilangan. Yangi versiya bo‘yicha qisqa tekshiruv kerak.';

                                         
                          
                            
                            
                         
                                
                                                
 

                                   
                        
                   
               
              
                   
                                                                         
                       
                                         
                                                                                           
                         
                         
                      
                                         
 

                                   
                        
                      
                                                                               
                           
                                                                                               
                                                                                                                 
                                                                   
                                                
 

const plural=(n       ,word       )=>`${n} ta ${word}`;

export function buildMasteryView(input                 )                 {
  const lu=encodeURIComponent(input.learningUnitId);
  const byConcept=new Map(input.mastery.map(m=>[m.conceptId,m]));
  const unitMastery=input.conceptIds.map(id=>byConcept.get(id)).filter((m)                    =>Boolean(m));
  const counted=input.countedEvidence.filter(e=>input.conceptIds.includes(e.conceptId));
  const excluded=unitMastery.reduce((n,m)=>n+(m.excludedEvidenceIds?.length??0),0);
  const sources=new Set(counted.map(e=>e.source)).size;
  const hasAssessmentEvidence=counted.some(e=>e.evidenceClass==='concept-assessment');
  const summary                       ={
    practiceAttempts:input.attempts.practiceCompletedOrAbandoned,assessmentAttempts:input.attempts.assessment,
    independentSources:sources,requiredSources:MASTERY_MIN_INDEPENDENT_SOURCES,hasAssessmentEvidence,assessmentAvailability:input.assessmentAvailability,
  };
  const versionUpdated=counted.length===0&&excluded>0;

  let band            ;
  if(versionUpdated) band='NEEDS_REVIEW';
  else if(!counted.length) band='NOT_STARTED';
  else if(unitMastery.some(m=>m.status==='needs_review')) band='NEEDS_REVIEW';
  else if(unitMastery.length===input.conceptIds.length&&input.conceptIds.length>0&&unitMastery.every(m=>m.status==='mastered')&&input.assessmentAvailability==='AVAILABLE') band='MASTERED';
  else band='DEVELOPING';

  const explanation         =[];
  if(versionUpdated) explanation.push(VERSION_UPDATED_COPY);
  if(summary.practiceAttempts) explanation.push(`${plural(summary.practiceAttempts,'mashq urinishi')} bajarildi.`);
  if(summary.assessmentAttempts) explanation.push(`${plural(summary.assessmentAttempts,'test urinishi')} topshirildi.`);
  if(input.assessmentAvailability==='NONE') explanation.push('Bu mavzu uchun baholash (test) hali mavjud emas — o‘zlashtirish hozircha to‘liq tasdiqlanmaydi.');
  if(input.assessmentAvailability==='PENDING') explanation.push('Test savollari mutaxassislar tekshiruvida — hozircha mulohaza yozishingiz mumkin.');
  if(input.assessmentAvailability==='AVAILABLE'&&!hasAssessmentEvidence&&counted.length) explanation.push('Testni topshirsangiz, o‘zlashtirish holati aniqlashadi.');
  if(counted.length&&sources<MASTERY_MIN_INDEPENDENT_SOURCES) explanation.push('Mustaqil dalillar hali yetarli emas: turli faoliyatlarda yana mashq qiling.');
  if(band==='NEEDS_REVIEW'&&!versionUpdated) explanation.push('Ba’zi tushunchalar bo‘yicha javoblar hali ishonchli emas — takrorlash tavsiya etiladi.');
  if(band==='MASTERED') explanation.push('Mashq va test natijalari mavzu tushunchalarini o‘zlashtirganingizni ko‘rsatmoqda.');
  if(!counted.length&&!versionUpdated) explanation.push('Hali bu mavzu bo‘yicha dalil yo‘q.');

  let nextAction                               ;
  if(band==='NOT_STARTED'||versionUpdated) nextAction={label:'Mavzuni boshlash',href:`/learn/${lu}/guide`};
  else if(band==='NEEDS_REVIEW') nextAction={label:'Nazariyani qayta ko‘rish',href:`/learn/${lu}/guide`};
  else if(band==='DEVELOPING') nextAction=input.assessmentAvailability==='AVAILABLE'&&!hasAssessmentEvidence?{label:'Testni topshirish',href:`/learn/${lu}/quiz`}:{label:'Amaliyotni davom ettirish',href:`/learn/${lu}/practice`};

  const lastActivityAt=counted.map(e=>e.createdAt).sort().at(-1);
  const reviewDueAt=unitMastery.map(m=>m.reviewDueAt).filter((x)            =>Boolean(x)).sort()[0];
  const copy=MASTERY_BAND_COPY[band];
  return {
    learningUnitId:input.learningUnitId,band,label:copy.label,icon:copy.icon,ariaLabel:copy.aria,explanation,evidenceSummary:summary,versionUpdated,
    ...(lastActivityAt?{lastActivityAt}:{}),...(reviewDueAt?{reviewDueAt}:{}),...(nextAction?{nextAction}:{}),
  };
}
