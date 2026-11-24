// src/pages/staff/setup/StaffAccounts.jsx
// Create staff accounts, choose their role and campuses, switch them off, and reset a forgotten password.
// No email is sent: give the person their starting password yourself.
import { useState } from 'react';
import { setup } from '../../../api/staff.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { ROLE_LABEL, STAFF_ROLES } from '../../../auth/roles.js';
import { Alert, Button, Field, Select } from '../../../components/ui.jsx';
import { Panel, Pill, formError, useRows } from './shared.jsx';

const ROLE_HELP = {
  central_admin: 'Everything, on every campus', campus_officer: 'Reviews and decides applications, runs exams, on their campuses', reviewer: 'Reads applications and exam data, on their campuses',
  finance_officer: 'Confirms bank transfers and records payments, on their campuses', interviewer: 'Takes interviews they are assigned',
};
const needsCampus = (role) => role !== 'central_admin';
const EMPTY = { firstName: '', lastName: '', email: '', phone: '', role: '', campusIds: [], password: '' };

function CampusBoxes({ campuses, value, onChange, error }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">Campuses</span>
      <div className="flex flex-wrap gap-3">{campuses.filter((c) => c.isActive).map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} />{c.name}</label>))}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Person({ person, campuses, isSelf, onChanged, onError }) {
  const [mode, setMode] = useState(null); // 'edit' | 'password'
  const [f, setF] = useState({ role: person.role, campusIds: person.campuses.map((c) => c.id) });
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState({}); const [busy, setBusy] = useState(false);
  async function run(fn) {
    setBusy(true); setErrors({});
    try { await fn(); setMode(null); setPw(''); onChanged(); } catch (e) { setErrors(e.fieldErrors || {}); onError(e.fieldErrors ? '' : e.message); } finally { setBusy(false); }
  }
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-semibold">{person.firstName} {person.lastName}</span> <span className="text-xs text-muted">{person.email}</span>
          <span className="block text-xs text-muted">{ROLE_LABEL[person.role]}{person.campuses.length ? ` · ${person.campuses.map((c) => c.name).join(', ')}` : ''}</span></span>
        <Pill on={person.isActive} yes="Active" no="Switched off" />
      </div>
      {!mode && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
          <button onClick={() => setMode('edit')} className="text-brand hover:underline">Change role or campuses</button>
          <button onClick={() => setMode('password')} className="text-brand hover:underline">Set a new password</button>
          {!isSelf && <button onClick={() => run(() => setup.updateStaff(person.id, { isActive: !person.isActive }))} className="text-brand hover:underline">{person.isActive ? 'Switch off' : 'Switch on'}</button>}
        </div>
      )}
      {mode === 'edit' && (
        <div className="mt-2 space-y-3 rounded-lg bg-surface p-3">
          <Select label="Role" value={f.role} onChange={(e) => setF({ role: e.target.value, campusIds: e.target.value === 'central_admin' ? [] : f.campusIds })} disabled={isSelf}
            options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          {needsCampus(f.role) && <CampusBoxes campuses={campuses} value={f.campusIds} onChange={(campusIds) => setF({ ...f, campusIds })} error={errors.campusIds} />}
          <div className="flex gap-2"><Button loading={busy} onClick={() => run(() => setup.updateStaff(person.id, { role: f.role, campusIds: f.campusIds }))}>Save</Button><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      )}
      {mode === 'password' && (
        <div className="mt-2 space-y-3 rounded-lg bg-surface p-3">
          <Field label="New password" type="text" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.password} hint="At least 10 characters with a letter and a number. Tell them in person." autoComplete="off" />
          <div className="flex gap-2"><Button loading={busy} disabled={!pw} onClick={() => run(() => setup.resetPassword(person.id, pw))}>Set password</Button><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      )}
    </li>
  );
}

export default function StaffAccounts() {
  const { user } = useAuth();
  const { rows, error, setError, reload } = useRows(setup.staff);
  const campuses = useRows(setup.campuses);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({}); const [formErr, setFormErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault(); setBusy(true); setFormErr(''); setErrors({});
    const body = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), role: f.role, password: f.password };
    if (f.phone.trim()) body.phone = f.phone.trim();
    if (needsCampus(f.role)) body.campusIds = f.campusIds;
    try { await setup.createStaff(body); setF(EMPTY); setOpen(false); reload(); }
    catch (err) { const r = formError(err); setErrors(r.fieldErrors); setFormErr(r.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      {!open ? <div><Button onClick={() => setOpen(true)}>New staff account</Button></div> : (
        <Panel title="New staff account">
          <form onSubmit={add} className="space-y-4" noValidate>
            <Alert>{formErr}</Alert>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={f.firstName} onChange={set('firstName')} error={errors.firstName} />
              <Field label="Last name" value={f.lastName} onChange={set('lastName')} error={errors.lastName} />
              <Field label="Email" type="email" value={f.email} onChange={set('email')} error={errors.email} />
              <Field label="Phone (optional)" value={f.phone} onChange={set('phone')} error={errors.phone} />
              <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, campusIds: [] })} error={errors.role} options={STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
              <Field label="Starting password" type="text" value={f.password} onChange={set('password')} error={errors.password} hint="At least 10 characters with a letter and a number" autoComplete="off" />
            </div>
            {f.role && <p className="text-xs text-muted">{ROLE_HELP[f.role]}</p>}
            {f.role && needsCampus(f.role) && <CampusBoxes campuses={campuses.rows || []} value={f.campusIds} onChange={(campusIds) => setF({ ...f, campusIds })} error={errors.campusIds} />}
            <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.firstName || !f.lastName || !f.email || !f.role || !f.password}>Create account</Button><Button variant="secondary" type="button" onClick={() => setOpen(false)}>Cancel</Button></div>
            <p className="text-xs text-muted">No email is sent. Give the person their starting password yourself; they can change it under their account.</p>
          </form>
        </Panel>
      )}
      <Panel title="Staff">
        {rows === null && <p className="text-muted">Loading…</p>}
        <ul className="divide-y divide-slate-100">{rows?.map((p) => <Person key={p.id} person={p} campuses={campuses.rows || []} isSelf={p.id === user.id} onChanged={reload} onError={setError} />)}</ul>
      </Panel>
    </div>
  );
}
