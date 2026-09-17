export function answerApplication(app, userId, index, answer) {
 if (app.userId !== userId) throw new Error('Only the application owner can answer.');
 if (app.status !== 'draft' || index !== app.answers.length || !app.questions[index]) throw new Error('Application changed. Resume to see the current question.');
 if (typeof answer !== 'string' || answer.length > 1000) throw new Error('Answers must be at most 1000 characters.');
 if (app.questions[index].required && !answer.trim()) throw new Error('This question is required.');
 app.answers.push(answer.trim());
 if (app.answers.length === app.questions.length) app.status = 'pending';
 return app;
}
export function reviewRequest(request, reviewerId, status, reason, now = Date.now()) {
 if (request.status !== 'pending') throw new Error('This request has already been reviewed or is not submitted.');
 if (!['approved','denied'].includes(status)) throw new Error('Choose approved or denied.');
 if (request.userId === reviewerId) throw new Error('You cannot review your own request.');
 Object.assign(request,{status,reviewerId,reviewedAt:now,reviewReason:String(reason || '').slice(0,1000)});
 if (request.days && status === 'approved') Object.assign(request,{startAt:now,endAt:now+request.days*86400000});
 return request;
}
export function activityAudit(check, leaves, now = Date.now()) {
 const excluded = check.eligible.filter(id=>leaves.some(l=>l.userId===id && l.status==='approved' && l.startAt<=Math.min(now,check.deadline) && l.endAt>check.createdAt));
 const active = check.eligible.filter(id=>!excluded.includes(id));
 return {responded:active.filter(id=>check.responses.includes(id)),missing:active.filter(id=>!check.responses.includes(id)),excluded};
}
export function closeDueChecks(state, now=Date.now()) {
 for (const check of state.activityChecks) if(check.status==='open' && now>=check.deadline) {
  check.status='closed'; check.closedAt=check.deadline; check.audit=activityAudit(check,state.leave,check.deadline);
 }
 return state;
}
