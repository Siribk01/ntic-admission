// src/pages/staff/setup/Campuses.jsx
import { useState } from 'react';
import { setup } from '../../../api/staff.js';
import { Alert, Button, Field, Select } from '../../../components/ui.jsx';
import { useOptions } from '../../../hooks/useOptions.js';
import { Panel, Pill, formError, useRows } from './shared.jsx';

const EMPTY = { stateId: '', name: '', code: '', address: '', phone: '', email: '' };

export default function Campuses() {
  const { options } = useOptions();
  const { rows, error, setError, reload } = useRows(setup.campuses);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({}); const [formErr, setFormErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault(); setBusy(true); setFormErr(''); setErrors({});
    const body = { stateId: f.stateId, name: f.name.trim(), code: f.code.trim() };
    for (const k of ['address', 'phone', 'email']) if (f[k].trim()) body[k] = f[k].trim();
    try { await setup.createCampus(body); setF(EMPTY); reload(); }
    catch (err) { const r = formError(err); setErrors(r.fieldErrors); setFormErr(r.message); } finally { setBusy(false); }
  }
  async function toggle(c) { try { await setup.updateCampus(c.id, { isActive: !c.isActive }); reload(); } catch (e) { setError(e.message); } }

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <Panel title="Add a campus">
        <form onSubmit={add} className="space-y-3" noValidate>
          <Alert>{formErr}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={f.name} onChange={set('name')} error={errors.name} />
            <Field label="Code" value={f.code} onChange={set('code')} error={errors.code} hint="Short and unique, e.g. ILR. It appears in exam numbers." />
            <Select label="State" value={f.stateId} onChange={set('stateId')} error={errors.stateId} options={(options?.states || []).map((s) => ({ value: s.id, label: s.name }))} />
            <Field label="Phone (optional)" value={f.phone} onChange={set('phone')} error={errors.phone} />
            <Field label="Email (optional)" value={f.email} onChange={set('email')} error={errors.email} />
            <Field label="Address (optional)" value={f.address} onChange={set('address')} error={errors.address} />
          </div>
          <Button type="submit" loading={busy} disabled={!f.name || !f.code || !f.stateId}>Add campus</Button>
        </form>
      </Panel>
      <Panel title="Campuses">
        {rows === null && <p className="text-muted">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">No campuses yet.</p>}
        <ul className="divide-y divide-slate-100">{rows?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><span className="font-medium">{c.name}</span> <span className="text-xs text-muted">({c.code}) · {c.stateName}</span></span>
            <span className="flex items-center gap-3"><Pill on={c.isActive} /><button onClick={() => toggle(c)} className="text-xs font-semibold text-brand hover:underline">{c.isActive ? 'Switch off' : 'Switch on'}</button></span>
          </li>))}</ul>
      </Panel>
    </div>
  );
}
