// Adapter helpers: translate caller-specific inputs (browser page models, LearningRunner options)
// into the orchestrator's canonical VersionContext / BeginPracticeInput. No workflow logic here.
import type {StudentPracticePageModel} from '../../features/practice/model.ts';
import type {PracticeActivity} from '../../domain/content/types.ts';
import type {PracticeEnginePort,VersionContext} from './types.ts';
import type {BeginPracticeInput} from './orchestrator.ts';

/** Browser practice page → versions. `schemaVersion` on the page is the content-pack schema version. */
export function versionsFromPage(page:Pick<StudentPracticePageModel,'contentVersion'|'schemaVersion'|'scoringVersion'|'curriculumVersion'>):VersionContext{
  return {contentVersion:page.contentVersion,contentSchemaVersion:page.schemaVersion,scoringVersion:page.scoringVersion,...(page.curriculumVersion?{curriculumVersion:page.curriculumVersion}:{})};
}

/** Browser runtime versions (ContentClient.getRuntimeVersions) → versions for unit-level intents. */
export function versionsFromRuntime(v:{contentVersion:string;schemaVersion:string;scoringVersion?:string;curriculumVersion?:string}):VersionContext{
  return {contentVersion:v.contentVersion,contentSchemaVersion:v.schemaVersion,scoringVersion:v.scoringVersion??'0.0.0',...(v.curriculumVersion?{curriculumVersion:v.curriculumVersion}:{})};
}

export function beginInputFromPage(page:StudentPracticePageModel,engine?:PracticeEnginePort):BeginPracticeInput{
  return {
    learningUnitId:page.learningUnit.id,activityId:page.id,activityVersion:page.activityVersion??'0',practiceType:page.type,
    versions:versionsFromPage(page),...(engine?{engine}:{}),conceptIds:[...(page.learningUnit.conceptIds??[])],
  };
}

export function beginInputFromActivity(learningUnitId:string,activity:PracticeActivity,versions:VersionContext,conceptIds:string[]):BeginPracticeInput{
  return {learningUnitId,activityId:activity.id,activityVersion:activity.version,practiceType:activity.type,versions,conceptIds};
}
