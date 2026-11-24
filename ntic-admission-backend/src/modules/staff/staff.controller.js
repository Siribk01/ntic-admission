// src/modules/staff/staff.controller.js
const service = require('./staff.service');
const { getRequestContext } = require('../../utils/requestContext');

async function createStaff(req, res, next) {
  try {
    const staff = await service.createStaff(req.body, {
      actor: req.user,
      ...getRequestContext(req),
    });
    res.status(201).json({ data: staff });
  } catch (err) {
    next(err);
  }
}

module.exports = { createStaff };