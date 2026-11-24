// src/modules/notifications/notifications.controller.js
const service = require('./notifications.service');
const { getRequestContext } = require('../../utils/requestContext');

async function listNotifications(req, res, next) {
  try { res.status(200).json({ data: await service.listNotifications(req.query) }); }
  catch (err) { next(err); }
}
async function retryNotification(req, res, next) {
  try {
    res.status(200).json({ data: await service.retryNotification(req.params.notificationId, { actor: req.user, ...getRequestContext(req) }) });
  } catch (err) { next(err); }
}

module.exports = { listNotifications, retryNotification };
