// src/modules/interviews/interviews.controller.js
const service = require('./interviews.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const wrap = (handler, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await handler(req) }); } catch (err) { next(err); }
};
const appId = (req) => req.params.applicationId;

module.exports = {
  listInterviewers: wrap((req) => service.listInterviewers(req.user)),
  listInterviews: wrap((req) => service.listInterviews(req.query, req.user)),
  getInterview: wrap((req) => service.getInterview(appId(req), req.user)),
  scheduleInterview: wrap((req) => service.scheduleInterview(appId(req), req.body, contextOf(req))),
  cancelInterview: wrap((req) => service.cancelInterview(appId(req), req.body, contextOf(req))),
  recordOutcome: wrap((req) => service.recordOutcome(appId(req), req.body, contextOf(req))),
  listCriteria: wrap((req) => service.listCriteria(req.user)),
  createCriterion: wrap((req) => service.createCriterion(req.body, contextOf(req)), 201),
  updateCriterion: wrap((req) => service.updateCriterion(req.params.criterionId, req.body, contextOf(req))),
  getScorecard: wrap((req) => service.getScorecard(appId(req), req.user)),
  saveScorecard: wrap((req) => service.saveScorecard(appId(req), req.body, contextOf(req))),
  submitScorecard: wrap((req) => service.submitScorecard(appId(req), contextOf(req))),
  reopenScorecard: wrap((req) => service.reopenScorecard(appId(req), req.body, contextOf(req))),
  getInterviewForParent: wrap((req) => service.getInterviewForParent(appId(req), req.user)),
};
