// src/api/reference.js
// The drop-down lists (states, campuses, open admission cycles with their categories, and fee rules).
// One backend call, remembered for the session. Needs the new backend module `options` (GET /application-options).
import { api } from './client.js';

let cached = null;
export function getOptions() {
  if (!cached) cached = api('/application-options').catch((e) => { cached = null; throw e; });
  return cached;
}
export const clearOptions = () => { cached = null; };

// Price of a category at a campus, in kobo (a campus-specific price wins over the general one). null = not set.
export function feeFor(options, categoryId, campusId) {
  if (!options || !categoryId) return null;
  const rules = options.fees.filter((r) => r.categoryId === categoryId);
  const rule = rules.find((r) => r.campusId === campusId) || rules.find((r) => !r.campusId);
  return rule ? rule.amountMinor : null;
}
export const naira = (kobo) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
