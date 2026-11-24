// src/api/auth.js
// Account calls. !! The first three (login, register, me) were built in your earlier backend steps, which I
// cannot see. If a path or a field name differs, this is the only file to change.
import { api } from './client.js';

export const login = (email, password) => api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
export const register = (fields) => api('/auth/register', { method: 'POST', body: fields, auth: false });
export const me = () => api('/auth/me');

// These five match the backend I built
export const emailStatus = () => api('/auth/email-status');
export const resendVerification = () => api('/auth/resend-verification', { method: 'POST' });
export const verifyEmail = (token) => api('/auth/verify-email', { method: 'POST', body: { token }, auth: false });
export const forgotPassword = (email) => api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
export const resetPassword = (token, password) => api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
export const changePassword = (currentPassword, newPassword) => api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
