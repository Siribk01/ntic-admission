// src/modules/setup/setup.controller.js
const service = require('./setup.service');
const { getRequestContext } = require('../../utils/requestContext');

const ctx = (req) => ({ actor: req.user, ...getRequestContext(req) });
// read: GET -> { data }.  write: POST/PATCH/PUT -> { data } with the given status.
const read = (fn) => async (req, res, next) => { try { res.status(200).json({ data: await fn(req) }); } catch (e) { next(e); } };
const write = (fn, status = 200) => async (req, res, next) => { try { res.status(status).json({ data: await fn(req) }); } catch (e) { next(e); } };

module.exports = {
  listCycles: read(() => service.listCycles()),
  createCycle: write((req) => service.createCycle(req.body, ctx(req)), 201),
  updateCycle: write((req) => service.updateCycle(req.params.cycleId, req.body, ctx(req))),
  setCycleCategories: write((req) => service.setCycleCategories(req.params.cycleId, req.body, ctx(req))),
  listCategories: read(() => service.listCategories()),
  createCategory: write((req) => service.createCategory(req.body, ctx(req)), 201),
  updateCategory: write((req) => service.updateCategory(req.params.categoryId, req.body, ctx(req))),
  listCampuses: read(() => service.listCampuses()),
  createCampus: write((req) => service.createCampus(req.body, ctx(req)), 201),
  updateCampus: write((req) => service.updateCampus(req.params.campusId, req.body, ctx(req))),
  listFees: read(() => service.listFees()),
  createFee: write((req) => service.createFee(req.body, ctx(req)), 201),
  updateFee: write((req) => service.updateFee(req.params.feeId, req.body, ctx(req))),
  listStaff: read(() => service.listStaff()),
  createStaff: write((req) => service.createStaff(req.body, ctx(req)), 201),
  updateStaff: write((req) => service.updateStaff(req.params.userId, req.body, ctx(req))),
  resetStaffPassword: write((req) => service.resetStaffPassword(req.params.userId, req.body, ctx(req))),
};
