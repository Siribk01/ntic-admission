// src/api/client.js
// The ONE place that talks to the backend. Every page calls api(...) and never uses fetch directly, so
// the token, the error format and the "you were signed out" handling are written once.

const BASE = '/api/v1';
const TOKEN_KEY = 'ntic_token';

// sessionStorage: the token disappears when the tab is closed. Safer than localStorage on a shared computer.
// Every access is wrapped because some browsers block storage (private mode).
const read = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const write = (v) => { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

let token = read();
let onSignedOut = () => {};

export const getToken = () => token;
export const setToken = (t) => { token = t || null; write(token); };
// AuthContext registers a function here, to be called when the server says our token is no longer valid
export const setSignedOutHandler = (fn) => { onSignedOut = fn; };

// Every backend error arrives as { error: { message, code, details: [{ field, message }] } }
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code || 'ERROR';
    this.details = body?.error?.details || [];
  }
  // { firstName: 'First name is required', ... } so a form can show each message under its own field
  get fieldErrors() {
    const out = {};
    for (const d of this.details) out[d.field] = out[d.field] ? `${out[d.field]}. ${d.message}` : d.message; // several problems on one field are all shown
    return out;
  }
}

// api('/applicants', { method: 'POST', body: {...} })      JSON in, the "data" part out
// api('/applications/x/documents/y', { method: 'PUT', form: formData })   file upload
// api('/auth/login', { method: 'POST', body, auth: false })   a public call: a 401 here is a wrong password, not an expired session
export async function api(path, { method = 'GET', body, form, auth = true } = {}) {
  const headers = {};
  if (token && auth) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, { error: { message: 'Cannot reach the server. Check your internet connection and try again.', code: 'NETWORK' } });
  }

  let json = null;
  try { json = await res.json(); } catch { /* an empty or non-JSON reply */ }

  if (!res.ok) {
    if (res.status === 401 && auth && token) { setToken(null); onSignedOut(); }
    throw new ApiError(res.status, json);
  }
  return json && 'data' in json ? json.data : json;
}

// For PDFs: returns a Blob the page can open in a new tab
export async function apiBlob(path) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let json = null; try { json = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, json);
  }
  return res.blob();
}
