// Adapter helpers: translate caller-specific inputs (browser page models, LearningRunner options)
// into the orchestrator's canonical VersionContext / BeginPracticeInput. No workflow logic here.
                                                                               
                                                                    
                                                                  
                                                          

/** Browser practice page → versions. `schemaVersion` on the page is the content-pack schema version. */
export function versionsFromPage(page                                                                                                     )               {
  return {contentVersion:page.contentVersion,contentSchemaVersion:page.schemaVersion,scoringVersion:page.scoringVersion,...(page.curriculumVersion?{curriculumVersion:page.curriculumVersion}:{})};
}

/** Browser runtime versions (ContentClient.getRuntimeVersions) → versions for unit-level intents. */
export function versionsFromRuntime(v                                                                                              )               {
  return {contentVersion:v.contentVersion,contentSchemaVersion:v.schemaVersion,scoringVersion:v.scoringVersion??'0.0.0',...(v.curriculumVersion?{curriculumVersion:v.curriculumVersion}:{})};
}

export function beginInputFromPage(page                         ,engine                    )                   {
  return {
    learningUnitId:page.learningUnit.id,activityId:page.id,activityVersion:page.activityVersion??'0',practiceType:page.type,
    versions:versionsFromPage(page),...(engine?{engine}:{}),conceptIds:[...(page.learningUnit.conceptIds??[])],
  };
}

export function beginInputFromActivity(learningUnitId       ,activity                 ,versions               ,conceptIds         )                   {
  return {learningUnitId,activityId:activity.id,activityVersion:activity.version,practiceType:activity.type,versions,conceptIds};
}
