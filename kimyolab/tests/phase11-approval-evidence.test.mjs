import test from 'node:test';
import assert from 'node:assert/strict';
import {computeApprovalHash,evaluateExternalApproval} from '../scripts/approval-evidence.ts';

test('external approval is valid only for exact role version and review hash',()=>{
 const hash=computeApprovalHash({a:1,b:[2,3]});
 const record={status:'approved',reviewerId:'expert-1',reviewerRole:'Chemistry Reviewer',reviewedVersion:'1.0.0',reviewedHash:hash,reviewedAt:'2026-09-20T00:00:00Z'};
 assert.equal(evaluateExternalApproval(record,{reviewerRole:'Chemistry Reviewer',version:'1.0.0',hash}).valid,true);
 assert.equal(evaluateExternalApproval(record,{reviewerRole:'Chemistry Reviewer',version:'1.0.0',hash:'changed'}).reason,'APPROVAL_HASH_STALE');
});
