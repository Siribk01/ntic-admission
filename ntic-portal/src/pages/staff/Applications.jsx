// src/pages/staff/Applications.jsx
// All submitted applications you are allowed to see. Search by name, application number or exam number; filter by status.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, listApplications } from '../../api/staff.js';
import { naira } from '../../api/reference.js';
import { STATUS_LABEL } from '../../components/StatusPanel.jsx';
import { Alert, Button } from '../../components/ui.jsx';

const LIMIT = 25;
const STATUS_LOOK = {
  submitted: 'bg-slate-100 text-slate-700', under_review: 'bg-blue-50 text-blue-800', information_required: 'bg-amber-50 text-amber-800',
  decision_pending: 'bg-purple-50 text-purple-800', offered: 'bg-green-50 text-green-800', waitlisted: 'bg-orange-50 text-orange-800',
  rejected: 'bg-red-50 text-red-700', withdrawn: 'bg-slate-100 text-slate-500', closed: 'bg-slate-100 text-slate-600',
};
export const StatusBadge = ({ status }) => <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_LOOK[status] || 'bg-slate-100'}`}>{STATUS_LABEL[status] || status}</span>;

export default function Applications() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [counts, setCounts] = useState(null);
  useEffect(() => { getDashboard().then((d) => setCounts(d.applications?.byStatus || null)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await listApplications({ q: q.trim().length >= 2 ? q.trim() : '', status, limit: LIMIT, offset });
      setRows(Array.isArray(r) ? r : r.items || []);
    } catch (e) { setError(e.message); setRows([]); }
  }, [q, status, offset]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]); // wait a moment while typing

  const total = rows?.[0]?.total ?? 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Applications</h1>
      {counts && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['submitted', 'New: not yet looked at', 'text-slate-700'], ['under_review', 'Being reviewed', 'text-blue-700'], ['decision_pending', 'Waiting for a decision', 'text-purple-700'], ['information_required', 'Waiting for the parent', 'text-amber-700']].map(([k, label, tone]) => (
            <button key={k} type="button" onClick={() => { setStatus(status === k ? '' : k); setOffset(0); }}
              className={`rounded-xl bg-white p-4 text-left shadow-sm ring-1 hover:bg-surface ${status === k ? 'ring-2 ring-brand' : 'ring-slate-200'}`}>
              <div className="text-xs font-medium text-muted">{label}</div><div className={`mt-1 text-2xl font-bold ${tone}`}>{counts[k] ?? 0}</div>
            </button>))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search name, application number or exam number"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'draft').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <Alert>{error}</Alert>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr><th className="px-4 py-3">Child</th><th className="px-4 py-3">Application number</th><th className="px-4 py-3">Campus / class</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3">Exam number</th></tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No applications found. Try clearing the search or the status.</td></tr>}
            {rows?.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-brand-light/40">
                <td className="px-4 py-3 font-medium"><Link to={`/staff/applications/${a.id}`} className="text-brand hover:underline">{a.firstName} {a.surname}</Link></td>
                <td className="px-4 py-3 text-muted">{a.applicationNumber}</td>
                <td className="px-4 py-3">{a.campusName}<span className="block text-xs text-muted">{a.categoryName}</span></td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3 text-right">{naira(a.paidMinor || 0)}<span className="block text-xs text-muted">of {naira(a.feeAmountMinor || 0)}</span></td>
                <td className="px-4 py-3 text-xs text-muted">{a.examNumber || 'No exam yet'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - LIMIT, 0))}>Previous</Button>
            <Button variant="secondary" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
