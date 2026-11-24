// src/components/CorrectionsPanel.jsx
// "Something is wrong in the details I submitted."  The parent asks for ONE field to be changed and says why.
// NTIC approves or rejects. Only a few fields can be corrected this way.
import { useCallback, useEffect, useState } from 'react';
import { cancelCorrection, listCorrections, requestCorrection } from '../api/corrections.js';
import { Alert, Button, Field, Select } from './ui.jsx';

const FIELDS = [
  { value: 'firstName', label: 'First name' }, { value: 'middleName', label: 'Middle name' }, { value: 'surname', label: 'Surname' },
  { value: 'dateOfBirth', label: 'Date of birth' }, { value: 'gender', label: 'Gender' }, { value: 'contactPhone', label: 'Contact phone' },
  { value: 'addressLine', label: 'Home address' },
];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.value, f.label]));
const STATUS = { pending: ['Waiting for NTIC', 'bg-amber-50 text-amber-800'], approved: ['Approved', 'bg-green-50 text-green-800'], rejected: ['Not approved', 'bg-red-50 text-red-700'], cancelled: ['Cancelled', 'bg-slate-100 text-slate-600'] };

function NewValue({ field, value, onChange, error }) {
  if (field === 'gender') return <Select label="New value" value={value} onChange={onChange} error={error} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />;
  if (field === 'dateOfBirth') return <Field label="New value" type="date" value={value} onChange={onChange} error={error} />;
  return <Field label="New value" value={value} onChange={onChange} error={error} />;
}

export default function CorrectionsPanel({ application }) {
  const id = application.id;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ field: '', newValue: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => listCorrections(id).then(setItems).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try {
      await requestCorrection(id, { field: form.field, newValue: form.newValue.trim(), reason: form.reason.trim() });
      setForm({ field: '', newValue: '', reason: '' }); setOpen(false); await load();
    } catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }
  async function cancel(cid) {
    try { await cancelCorrection(id, cid); await load(); } catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-4 text-left">
      <h2 className="text-lg font-bold text-navy">Correct a detail</h2>
      <p className="text-sm text-muted">Your application is locked. If a detail was entered wrongly, ask NTIC to change it here.</p>
      <Alert>{error}</Alert>
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((c) => {
            const [label, look] = STATUS[c.status] || [c.status, 'bg-slate-100'];
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{LABEL[c.field] || c.field}: <span className="text-muted line-through">{c.oldValue || '—'}</span> → {c.newValue}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${look}`}>{label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">Reason: {c.reason}</p>
                {c.decisionNote && <p className="mt-1 text-xs text-slate-700">NTIC: {c.decisionNote}</p>}
                {c.status === 'pending' && <button type="button" onClick={() => cancel(c.id)} className="mt-1 text-xs font-semibold text-red-700 hover:underline">Cancel this request</button>}
              </li>
            );
          })}
        </ul>
      )}
      {!open ? <Button variant="secondary" onClick={() => setOpen(true)}>Ask for a correction</Button> : (
        <form onSubmit={send} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" noValidate>
          <Select label="What needs to change?" value={form.field} onChange={(e) => setForm({ field: e.target.value, newValue: '', reason: form.reason })} options={FIELDS} error={errors.field} />
          {form.field && <NewValue field={form.field} value={form.newValue} onChange={(e) => setForm({ ...form, newValue: e.target.value })} error={errors.newValue} />}
          <Field label="Why does it need to change?" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} error={errors.reason} hint="For example: spelling mistake on the birth certificate" />
          <div className="flex gap-2">
            <Button type="submit" loading={busy} disabled={!form.field || !form.newValue}>Send request</Button>
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}
