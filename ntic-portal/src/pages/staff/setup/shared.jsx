// src/pages/staff/setup/shared.jsx
// Small helpers the setup tabs share.
import { useCallback, useEffect, useState } from 'react';

// Loads a list and gives you a reload function: const { rows, error, setError, reload } = useRows(setup.campuses)
export function useRows(loader) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => loader().then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setRows([]); }), [loader]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, error, setError, reload };
}

// Turns a failed request into { fieldErrors, message } for forms
export function formError(err) {
  const fieldErrors = err.fieldErrors || {};
  return { fieldErrors, message: Object.keys(fieldErrors).length ? 'Please correct the highlighted fields.' : err.message };
}

export const Pill = ({ on, yes = 'Active', no = 'Off' }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${on ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{on ? yes : no}</span>
);
export const Panel = ({ title, children, actions }) => (
  <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
    {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-2">{title && <h2 className="font-bold text-navy">{title}</h2>}{actions}</div>}
    {children}
  </div>
);
export const textArea = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40';

// Nigeria time <-> the browser's date-time box. The backend stores a moment in time; staff think in Lagos time.
export const lagosDisplay = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));
export function toLagosInput(iso) { // -> "2026-11-01T08:00"
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const fromLagosInput = (v) => `${v}:00+01:00`; // Nigeria is UTC+1 all year
