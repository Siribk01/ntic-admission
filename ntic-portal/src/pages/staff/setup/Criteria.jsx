// src/pages/staff/setup/Criteria.jsx
// What the interviewer's scorecard asks. Criteria are switched off, not deleted, so old scorecards keep their wording.
import { useCallback, useEffect, useState } from 'react';
import { criteria } from '../../../api/staff.js';
import { Alert, Button, Field } from '../../../components/ui.jsx';

function Row({ c, onSaved, onError }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ label: c.label, description: c.description || '', maxScore: String(c.maxScore), position: String(c.position) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function patch(body) {
    setBusy(true); onError('');
    try { await criteria.update(c.id, body); setEdit(false); await onSaved(); } catch (e) { onError(e.message); } finally { setBusy(false); }
  }
  if (!edit) {
    return (
      <tr className="border-t border-slate-100">
        <td className="p-3"><div className={`font-medium ${c.active ? '' : 'text-slate-400 line-through'}`}>{c.label}</div><div className="text-xs text-muted">{c.key}{c.description ? ` · ${c.description}` : ''}</div></td>
        <td className="p-3">{c.maxScore}</td><td className="p-3">{c.position}</td>
        <td className="p-3 whitespace-nowrap text-right">
          <button onClick={() => setEdit(true)} className="mr-3 font-semibold text-brand hover:underline">Edit</button>
          <button disabled={busy} onClick={() => patch({ active: !c.active })} className="font-semibold text-slate-600 hover:underline">{c.active ? 'Switch off' : 'Switch on'}</button>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-slate-100 bg-surface"><td colSpan={4} className="p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Label" value={f.label} onChange={set('label')} /></div>
        <Field label="Max score" type="number" min="1" value={f.maxScore} onChange={set('maxScore')} />
        <Field label="Order" type="number" min="0" value={f.position} onChange={set('position')} />
        <div className="sm:col-span-4"><Field label="Description" value={f.description} onChange={set('description')} /></div>
      </div>
      <div className="mt-3 flex gap-2"><Button loading={busy} onClick={() => patch({ label: f.label.trim(), description: f.description.trim() || null, maxScore: Number(f.maxScore), position: Number(f.position) })}>Save</Button><Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button></div>
    </td></tr>
  );
}

export default function Criteria() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ key: '', label: '', description: '', maxScore: '10', position: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const load = useCallback(() => criteria.list().then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrors({});
    const body = { key: f.key.trim(), label: f.label.trim(), maxScore: Number(f.maxScore) };
    if (f.description.trim()) body.description = f.description.trim();
    if (f.position !== '') body.position = Number(f.position);
    try { await criteria.create(body); setAdding(false); setF({ key: '', label: '', description: '', maxScore: '10', position: '' }); await load(); }
    catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }

  if (!rows) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted">The questions every interviewer scores. At least one must stay switched on.</p>{!adding && <Button onClick={() => setAdding(true)}>Add criterion</Button>}</div>
      <Alert>{error}</Alert>
      {adding && (
        <form onSubmit={create} noValidate className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" value={f.label} onChange={set('label')} error={errors.label} placeholder="Communication" />
            <Field label="Key" value={f.key} onChange={set('key')} error={errors.key} hint="Short, lower case, no spaces, e.g. communication. Cannot be changed later." />
            <Field label="Max score" type="number" min="1" value={f.maxScore} onChange={set('maxScore')} error={errors.maxScore} />
            <Field label="Order (optional)" type="number" min="0" value={f.position} onChange={set('position')} error={errors.position} />
          </div>
          <Field label="Description (optional)" value={f.description} onChange={set('description')} error={errors.description} />
          <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.key || !f.label}>Add</Button><Button variant="secondary" type="button" onClick={() => setAdding(false)}>Cancel</Button></div>
        </form>
      )}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm"><thead className="bg-surface text-xs uppercase text-muted"><tr><th className="p-3">Criterion</th><th className="p-3">Max</th><th className="p-3">Order</th><th className="p-3" /></tr></thead>
          <tbody>{rows.map((c) => <Row key={c.id} c={c} onSaved={load} onError={setError} />)}</tbody></table>
      </div>
    </div>
  );
}
