// src/modules/documents/documentTypes.admin.controller.js
const service = require('./documentTypes.admin.service');
const { getRequestContext } = require('../../utils/requestContext');

const contextOf = (req) => ({ actor: req.user, ...getRequestContext(req) });

async function list(req, res, next) { try { res.status(200).json({ data: await service.listTypes() }); } catch (err) { next(err); } }
async function create(req, res, next) { try { res.status(201).json({ data: await service.createType(req.body, contextOf(req)) }); } catch (err) { next(err); } }
async function update(req, res, next) { try { res.status(200).json({ data: await service.updateType(req.params.typeId, req.body, contextOf(req)) }); } catch (err) { next(err); } }

module.exports = { list, create, update };
