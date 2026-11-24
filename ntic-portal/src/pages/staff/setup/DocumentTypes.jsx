// src/pages/staff/setup/DocumentTypes.jsx
// The documents a parent is asked to upload. A type is switched off, never deleted, so old uploads keep their name.
// A change only affects what parents are asked for from now on; submitted applications and uploaded files are not touched.
import { useCallback, useEffect, useState } from 'react';
import { docTypes } from '../../../api/staff.js';
import { Alert, Button, Field } from '../../../components/ui.jsx';

const MIME = [['image/jpeg', 'JPEG photo'], ['image/png', 'PNG image'], ['application/pdf', 'PDF']];
const mb = (bytes) => Math.round((bytes / 1048576) * 100) / 100;
const typesText = (a) => a.map((m) => (MIME.find(([v]) => v === m) || [m, m])[1]).join(', ');

function Fields({ f, set, errors, withCode }) {
  const toggle = (m) => set('allowedMimes')({ target: { value: f.allowedMimes.includes(m) ? f.allowedMimes.filter((x) => x !== m) : [...f.allowedMimes, m] } });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name the parent sees" value={f.name} onChange={set('name')} error={errors.name} placeholder="Birth certificate" />
        {withCode && <Field label="Code" value={f.code} onChange={set('code')} error={errors.code} hint="Lower case, no spaces, e.g. medical_report. Cannot be changed later." />}
        <Field label="Largest file (MB)" type="number" min="0.01" max="5" step="0.25" value={f.maxMb} onChange={set('maxMb')} error={errors.maxBytes} hint="Between 0.01 and 5." />
        <Field label="Order on the form (optional)" type="number" min="1" value={f.sortOrder} onChange={set('sortOrder')} error={errors.sortOrder} />
      </div>
      <div><span className="mb-1 block text-sm font-medium text-slate-700">File types allowed</span>
        <div className="flex flex-wrap gap-4 text-sm">{MIME.map(([m, l]) => <label key={m} className="flex items-center gap-2"><input type="checkbox" checked={f.allowedMimes.includes(m)} onChange={() => toggle(m)} />{l}</label>)}</div>
        {errors.allowedMimes && <p className="mt-1 text-xs text-red-600">{errors.allowedMimes}</p>}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => set('required')({ target: { value: e.target.checked } })} /> Required (the parent cannot submit without it)</label>
    </div>
  );
}

function Row({ t, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ name: t.name, required: t.required, allowedMimes: t.allowedMimes, maxMb: String(mb(t.maxBytes)), sortOrder: String(t.sortOrder) });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function patch(body) {
    setBusy(true); setError(''); setErrors({});
    try { await docTypes.update(t.id, body); setEdit(false); await onSaved(); } catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); } finally { setBusy(false); }
  }
  if (!edit) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className={`font-semibold ${t.isActive ? '' : 'text-slate-400 line-through'}`}>{t.name} <span className="text-xs font-normal text-muted">({t.code})</span></div>
          <div className="text-xs text-muted">{typesText(t.allowedMimes)} · up to {mb(t.maxBytes)} MB · order {t.sortOrder}</div>
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${!t.isActive ? 'bg-slate-100 text-slate-500' : t.required ? 'bg-brand-light text-navy' : 'bg-slate-100 text-slate-600'}`}>{!t.isActive ? 'Switched off' : t.required ? 'Required' : 'Optional'}</span>
          <button onClick={() => setEdit(true)} className="text-sm font-semibold text-brand hover:underline">Edit</button>
          <button disabled={busy} onClick={() => patch({ isActive: !t.isActive })} className="text-sm font-semibold text-slate-600 hover:underline">{t.isActive ? 'Switch off' : 'Switch on'}</button>
        </div>
      </li>
    );
  }
  return (
    <li className="space-y-4 bg-surface p-4">
      <Alert>{error}</Alert>
      <Fields f={f} set={set} errors={errors} />
      <div className="flex gap-2">
        <Button loading={busy} onClick={() => patch({ name: f.name.trim(), required: f.required, allowedMimes: f.allowedMimes, maxBytes: Math.round(Number(f.maxMb) * 1048576), sortOrder: Number(f.sortOrder) })}>Save</Button>
        <Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button>
      </div>
    </li>
  );
}

export default function DocumentTypes() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const blank = { code: '', name: '', required: false, allowedMimes: ['image/jpeg', 'image/png', 'application/pdf'], maxMb: '2', sortOrder: '' };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const load = useCallback(() => docTypes.list().then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrors({});
    const body = { code: f.code.trim(), name: f.name.trim(), required: f.required, allowedMimes: f.allowedMimes, maxBytes: Math.round(Number(f.maxMb) * 1048576) };
    if (f.sortOrder !== '') body.sortOrder = Number(f.sortOrder);
    try { await docTypes.create(body); setAdding(false); setF(blank); await load(); }
    catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }

  if (!rows) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">The documents parents upload with an application. A change applies from now on. Applications already submitted and files already uploaded are not touched.</p>
        {!adding && <Button onClick={() => setAdding(true)}>Add a document</Button>}
      </div>
      <Alert>{error}</Alert>
      {adding && (
        <form onSubmit={create} noValidate className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Fields f={f} set={set} errors={errors} withCode />
          <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.code || !f.name}>Add</Button><Button variant="secondary" type="button" onClick={() => setAdding(false)}>Cancel</Button></div>
        </form>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">{rows.map((t) => <Row key={t.id} t={t} onSaved={load} />)}</ul>
    </div>
  );
}
