import test from 'node:test';
import assert from 'node:assert/strict';
import { answerApplication, reviewRequest, activityAudit } from '../src/services/betaStaff/state.js';

test('answers require owner and current question, optional skipping and 1000 character limit', () => {
 const app = {userId:'u',status:'draft',questions:[{required:true},{required:false}],answers:[]};
 assert.throws(()=>answerApplication(app,'other',0,'yes'), /owner/i);
 assert.throws(()=>answerApplication(app,'u',0,''), /required/i);
 assert.throws(()=>answerApplication(app,'u',0,'x'.repeat(1001)), /1000/);
 answerApplication(app,'u',0,'yes');
 assert.throws(()=>answerApplication(app,'u',0,'again'), /changed/i);
 answerApplication(app,'u',1,'');
 assert.equal(app.status,'pending');
 assert.throws(()=>answerApplication(app,'u',2,'again'), /changed/i);
});
test('review exactly once, approved leave starts at review and lasts requested days', () => {
 const request={status:'pending',days:2};
 reviewRequest(request,'r','approved','ok',100);
 assert.equal(request.endAt,100+2*86400000);
 assert.throws(()=>reviewRequest(request,'r','denied','',200),/reviewed/i);
});
test('activity excludes only approved overlapping leave and reports disjoint lists', () => {
 const check={createdAt:100,deadline:300,eligible:['a','b','c','d'],responses:['a','b']};
 const leaves=[{userId:'b',status:'approved',startAt:200,endAt:400},{userId:'c',status:'pending',startAt:100,endAt:400},{userId:'d',status:'approved',startAt:0,endAt:50}];
 assert.deepEqual(activityAudit(check,leaves,300),{responded:['a'],missing:['c','d'],excluded:['b']});
});
