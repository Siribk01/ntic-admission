// src/components/GuardianSection.jsx
// The people connected to the child. An application needs at least one of father, mother or guardian,
// AND an emergency contact. Each box saves on its own, so nothing is lost if one fails.
import { useState } from 'react';
import { removeGuardian, saveGuardian } from '../api/applicants.js';
import { Alert, Button, Field } from './ui.jsx';

const KINDS = [
  { key: 'father', title: 'Father', full: true },
  { key: 'mother', title: 'Mother', full: true },
  { key: 'guardian', title: 'Guardian', full: true, note: 'Only if the child is not with a parent' },
  { key: 'emergency_contact', title: 'Emergency contact', full: false, note: 'Someone we can call if you cannot be reached' },
];

const blank = { fullName: '', phone: '', occupation: '', email: '', address: '' };
const fromServer = (g) => ({ fullName: g?.fullName || '', phone: g?.phone || '', occupation: g?.occupation || '', email: g?.email || '', address: g?.address || '' });
// empty boxes are sent as null so the backend clears them
const toPayload = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));

function GuardianCard({ applicantId, kind, saved, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fromServer(saved));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try {
      await saveGuardian(applicantId, kind.key, toPayload(form));
      setOpen(false); onChanged();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${kind.title.toLowerCase()}?`)) return;
    setBusy(true); setError('');
    try { await removeGuardian(applicantId, kind.key); setForm(blank); setOpen(false); onChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-navy">{kind.title}</h3>
          {kind.note && <p className="text-xs text-muted">{kind.note}</p>}
          {saved && !open && <p className="mt-2 text-sm text-slate-700">{saved.fullName}{saved.phone ? ` · ${saved.phone}` : ''}</p>}
          {!saved && !open && <p className="mt-2 text-sm text-muted">Not added yet</p>}
        </div>
        {!open && <Button variant="secondary" onClick={() => { setForm(fromServer(saved)); setOpen(true); }}>{saved ? 'Edit' : 'Add'}</Button>}
      </div>

      {open && (
        <form onSubmit={save} className="mt-4 space-y-3" noValidate>
          <Alert>{error}</Alert>
          <Field label="Full name" name="fullName" value={form.fullName} onChange={change} error={errors.fullName} required />
          <Field label="Phone number" name="phone" type="tel" value={form.phone} onChange={change} error={errors.phone} hint="For example 08012345678" />
          {kind.full && (
            <>
              <Field label="Occupation" name="occupation" value={form.occupation} onChange={change} error={errors.occupation} />
              <Field label="Email address" name="email" type="email" value={form.email} onChange={change} error={errors.email} />
              <Field label="Address" name="address" value={form.address} onChange={change} error={errors.address} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>Save</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            {saved && <button type="button" onClick={remove} className="ml-auto text-sm text-red-600 hover:underline">Remove</button>}
          </div>
        </form>
      )}
    </div>
  );
}

export default function GuardianSection({ applicantId, guardians, onChanged }) {
  const byKind = Object.fromEntries((guardians || []).map((g) => [g.relationship, g]));
  return (
    <section>
      <h2 className="mb-1 text-lg font-bold text-navy">Parents and guardians</h2>
      <p className="mb-4 text-sm text-muted">Add at least one parent or guardian, and an emergency contact.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {KINDS.map((k) => (
          // the key includes the saved name so the box resets when the saved data changes
          <GuardianCard key={`${k.key}-${byKind[k.key]?.updatedAt || 'new'}`} applicantId={applicantId} kind={k} saved={byKind[k.key]} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}
