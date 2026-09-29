import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBeta1ReadinessReport } from '../src/runtime/beta1/readiness.ts';

const read=(name)=>JSON.parse(fs.readFileSync(new URL(`../content-src/${name}`,import.meta.url),'utf8'));
const registry=JSON.parse(fs.readFileSync(new URL('../content-src/activity-configs/reference-slices.json',import.meta.url),'utf8'));

test('current Beta1 readiness report scopes exactly 47 grade 7-8 learning units',()=>{
  const report=buildBeta1ReadinessReport({
    units:read('learning-units.json'),practices:read('practice-activities.json'),mappings:read('mapping-links.json'),configRegistry:registry,
  });
  assert.equal(report.totalLearningUnits,47);
  assert.equal(report.rows.length,47);
  assert.equal(report.technicalReady,9);
  assert.ok(report.rows.some(x=>x.learningUnitId==='lu.7.02'&&!x.technicalReady&&x.reasons.includes('CONFIG_MISSING')));
});

test('release readiness is stricter than technical readiness and never infers approvals',()=>{
  const unit={id:'lu.7.test',grade:7,title:'x',learningOutcomes:[],conceptIds:['concept.x'],prerequisiteConceptIds:[],lessonTemplates:[],curriculumVersion:'1',sourceRefs:[],legacyIds:[]};
  const pending={status:'pending',reviewerId:'unassigned',reviewerRole:'technical',reviewedVersion:'1',reviewedHash:'',reviewedAt:''};
  const practice={id:'practice.trainer.test',type:'trainer',title:'x',goal:'x',conceptIds:['concept.x'],prerequisiteConceptIds:[],lifecycleStatus:'ready',approvals:{technical:pending,chemistry:'not_applicable',didactic:{...pending,reviewerRole:'didactic'},accessibility:{...pending,reviewerRole:'accessibility'}},accessibilityProfile:['keyboard'],engineCompatibility:{engine:'trainer',range:'^1.0.0'},sourceRefs:[],legacyIds:[],version:'1'};
  const mapping={id:'map.x',learningUnitId:unit.id,theoryActivityId:'theory.x',practiceActivityId:practice.id,conceptIds:['concept.x'],role:'primary',required:true,coverageStatus:'full'};
  const report=buildBeta1ReadinessReport({units:[unit],practices:[practice],mappings:[mapping],configRegistry:{[practice.id]:{type:'trainer'}}});
  assert.equal(report.technicalReady,1);
  assert.equal(report.releaseReady,0);
  assert.deepEqual(report.rows[0].approvalPending.sort(),['accessibility','didactic','technical']);
});
