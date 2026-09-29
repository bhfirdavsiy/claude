import type {LearningHubModel} from '../learning-hub/model.ts';
export interface WorksheetSection {kind:'prediction'|'concepts'|'observation'|'explanation'|'reflection';title:string;prompt:string;lines:number;}
export interface WorksheetModel {learningUnitId:string;grade:number;title:string;learningOutcome:string;primaryPracticeTitle:string;contentVersion:string;assessmentVersion:string;sections:WorksheetSection[];}
export function buildWorksheetModel(hub:LearningHubModel,versions:{contentVersion:string;assessmentVersion:string}):WorksheetModel{
  return {learningUnitId:hub.id,grade:hub.grade,title:hub.title,learningOutcome:hub.learningOutcomes[0]??'',primaryPracticeTitle:hub.primaryPractice.title,contentVersion:versions.contentVersion,assessmentVersion:versions.assessmentVersion,sections:[
    {kind:'prediction',title:'Taxmin',prompt:`${hub.primaryPractice.title} boshlanishidan oldin qanday natija kutasiz?`,lines:3},
    {kind:'concepts',title:'Asosiy tushunchalar',prompt:`Quyidagi tushunchalarni o‘z so‘zingiz bilan izohlang: ${hub.concepts.map(x=>x.name).join(', ')}.`,lines:4},
    {kind:'observation',title:'Kuzatuv',prompt:'Amaliy faoliyat davomida nimani kuzatdingiz? Muhim dalillarni yozing.',lines:5},
    {kind:'explanation',title:'Ilmiy tushuntirish',prompt:'Kuzatuvingizni kimyoviy tushunchalar va zarur bo‘lsa formula/tenglama bilan tushuntiring.',lines:5},
    {kind:'reflection',title:'Xulosa',prompt:'Dastlabki taxminingiz bilan natijani taqqoslang. Nima o‘zgardi?',lines:4},
  ]};
}
