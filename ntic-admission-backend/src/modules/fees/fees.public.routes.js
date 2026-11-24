// src/modules/fees/fees.public.routes.js
// No sign-in needed: an applicant sees the fee before creating an account or paying.

const express = require('express');
const controller = require('./fees.controller');

const router = express.Router();

router.get('/quote', controller.getQuote);

module.exports = router;