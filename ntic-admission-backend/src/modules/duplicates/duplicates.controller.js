// src/modules/duplicates/duplicates.controller.js
const service = require('./duplicates.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

async function list(req, res, next) { try { res.status(200).json({ data: await service.list(req.query, req.user) }); } catch (err) { next(err); } }
async function dismiss(req, res, next) { try { res.status(200).json({ data: await service.dismiss(req.body, contextOf(req)) }); } catch (err) { next(err); } }
async function restore(req, res, next) { try { res.status(200).json({ data: await service.restore(req.body, contextOf(req)) }); } catch (err) { next(err); } }

module.exports = { list, dismiss, restore };
