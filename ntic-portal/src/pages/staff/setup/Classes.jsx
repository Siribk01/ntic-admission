// src/pages/staff/setup/Classes.jsx  (admission categories such as "JSS 1")
import { useState } from 'react';
import { setup } from '../../../api/staff.js';
import { Alert, Button, Field } from '../../../components/ui.jsx';
import { Panel, Pill, formError, useRows } from './shared.jsx';

export default function Classes() {
  const { rows, error, setError, reload } = useRows(setup.categories);
  const [f, setF] = useState({ name: '', code: '' });
  const [errors, setErrors] = useState({}); const [formErr, setFormErr] = useState(''); const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault(); setBusy(true); setFormErr(''); setErrors({});
    try { await setup.createCategory({ name: f.name.trim(), code: f.code.trim(), sortOrder: (rows?.length || 0) + 1 }); setF({ name: '', code: '' }); reload(); }
    catch (err) { const r = formError(err); setErrors(r.fieldErrors); setFormErr(r.message); } finally { setBusy(false); }
  }
  async function toggle(c) { try { await setup.updateCategory(c.id, { isActive: !c.isActive }); reload(); } catch (e) { setError(e.message); } }

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <Panel title="Add a class">
        <form onSubmit={add} className="space-y-3" noValidate>
          <Alert>{formErr}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} hint="What parents see, e.g. JSS 1" />
            <Field label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} error={errors.code} hint="Short and unique, e.g. JSS1" />
          </div>
          <Button type="submit" loading={busy} disabled={!f.name || !f.code}>Add class</Button>
        </form>
      </Panel>
      <Panel title="Classes">
        {rows === null && <p className="text-muted">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">No classes yet.</p>}
        <ul className="divide-y divide-slate-100">{rows?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="font-medium">{c.name} <span className="text-xs text-muted">({c.code})</span></span>
            <span className="flex items-center gap-3"><Pill on={c.isActive} /><button onClick={() => toggle(c)} className="text-xs font-semibold text-brand hover:underline">{c.isActive ? 'Switch off' : 'Switch on'}</button></span>
          </li>))}</ul>
        <p className="text-xs text-muted">A class is attached to a session in the Sessions tab, and given a price in the Fees tab. Classes cannot be deleted: switch them off instead.</p>
      </Panel>
    </div>
  );
}
