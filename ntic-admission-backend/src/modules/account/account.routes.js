// src/modules/account/account.routes.js
// Mounted at /auth, next to the sign-in routes. The public routes are limited per IP address.

const express = require('express');
const controller = require('./account.controller');
const { authenticate } = require('../../middleware/authenticate');
const { ipRateLimit } = require('../../utils/ipRateLimit');

const router = express.Router();
// 30 requests per 15 minutes per address (PUBLIC_RATE_LIMIT can change it, for example while running many tests)
const publicLimit = ipRateLimit({ limit: Number(process.env.PUBLIC_RATE_LIMIT) || 30, windowMs: 15 * 60 * 1000 });

// No sign-in needed (the person may have forgotten their password, or opened the email link on another device)
router.post('/verify-email', publicLimit, controller.verifyEmail);
router.post('/forgot-password', publicLimit, controller.forgotPassword);
router.post('/reset-password', publicLimit, controller.resetPassword);

// Signed in
router.post('/resend-verification', authenticate, controller.resendVerification);
router.get('/email-status', authenticate, controller.getEmailStatus);
router.post('/change-password', authenticate, controller.changePassword);

module.exports = router;
