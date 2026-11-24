// src/modules/examinations/examinations.controller.js
const service = require('./examinations.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });
const wrap = (handler, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ data: await handler(req) }); } catch (err) { next(err); }
};

module.exports = {
  createSlot: wrap((req) => service.createSlot(req.body, contextOf(req)), 201),
  listSlots: wrap((req) => service.listSlots(req.query, req.user)),
  getSlot: wrap((req) => service.getSlot(req.params.slotId, req.user)),
  updateSlot: wrap((req) => service.updateSlot(req.params.slotId, req.body, contextOf(req))),
  scheduleExam: wrap((req) => service.scheduleExam(req.params.applicationId, req.body, contextOf(req))),
  scheduleExamAsParent: wrap((req) => service.scheduleExamAsParent(req.params.applicationId, req.body, contextOf(req))),
  listSlotsForParent: wrap((req) => service.listSlotsForParent(req.params.applicationId, req.user)),
  cancelExam: wrap((req) => service.cancelExam(req.params.applicationId, req.body, contextOf(req))),
  getExamForStaff: wrap((req) => service.getExamForStaff(req.params.applicationId, req.user)),
  getExamForParent: wrap((req) => service.getExamForParent(req.params.applicationId, req.user)),
};
