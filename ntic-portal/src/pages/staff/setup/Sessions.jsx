// src/pages/staff/setup/Sessions.jsx
// Admission sessions: when applications open and close, and which classes are offered.
// A session only accepts applications while its status is "Open" AND today is between its dates.
import { useState } from 'react';
import { setup } from '../../../api/staff.js';
import { Alert, Button, Field, Select } from '../../../components/ui.jsx';
import { Panel, Pill, formError, fromLagosInput, lagosDisplay, toLagosInput, useRows } from './shared.jsx';

const STATUS = { draft: 'Draft', active: 'Open', closed: 'Closed' };

function SessionForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial ? { name: initial.name, academicSession: initial.academicSession, status: initial.status, opensAt: toLagosInput(initial.opensAt), closesAt: toLagosInput(initial.closesAt) }
    : { name: '', academicSession: '', status: 'draft', opensAt: '', closesAt: '' });
  const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setErrors({});
    const body = { name: f.name.trim(), academicSession: f.academicSession.trim(), status: f.status, opensAt: fromLagosInput(f.opensAt), closesAt: fromLagosInput(f.closesAt) };
    try { await (initial ? setup.updateCycle(initial.id, body) : setup.createCycle(body)); onSaved(); }
    catch (err) { const r = formError(err); setErrors(r.fieldErrors); setError(r.message); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={f.name} onChange={set('name')} error={errors.name} hint="e.g. 2026/2027 Admission" />
        <Field label="Academic session" value={f.academicSession} onChange={set('academicSession')} error={errors.academicSession} hint="Format 2026/2027" />
        <Field label="Applications open" type="datetime-local" value={f.opensAt} onChange={set('opensAt')} error={errors.opensAt} hint="Nigeria time" />
        <Field label="Applications close" type="datetime-local" value={f.closesAt} onChange={set('closesAt')} error={errors.closesAt} hint="Nigeria time" />
        <Select label="Status" value={f.status} onChange={set('status')} placeholder="Choose…" options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} error={errors.status} />
      </div>
      <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.name || !f.academicSession || !f.opensAt || !f.closesAt}>{initial ? 'Save changes' : 'Create session'}</Button><Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

function ClassPicker({ session, onSaved, onCancel }) {
  const { rows } = useRows(setup.categories);
  const [picked, setPicked] = useState(new Set(session.categories.map((c) => c.id)));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!rows) return <p className="text-muted">Loading…</p>;
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function save() {
    setBusy(true); setError('');
    try { await setup.setCycleCategories(session.id, [...picked]); onSaved(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      <Alert>{error}</Alert>
      {rows.filter((c) => c.isActive).length === 0 && <Alert kind="info">Add classes first, in the Classes tab.</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">{rows.filter((c) => c.isActive).map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />{c.name} <span className="text-xs text-muted">({c.code})</span></label>))}</div>
      <div className="flex gap-2"><Button onClick={save} loading={busy}>Save classes</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

export default function Sessions() {
  const { rows, error, setError, reload } = useRows(setup.cycles);
  const [mode, setMode] = useState(null); // { type: 'new' | 'edit' | 'classes', id? }
  const done = () => { setMode(null); reload(); };
  async function setStatus(s, status) { try { await setup.updateCycle(s.id, { status }); reload(); } catch (e) { setError(e.message); } }

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      {mode?.type === 'new' ? <Panel title="New session"><SessionForm onSaved={done} onCancel={() => setMode(null)} /></Panel>
        : <div><Button onClick={() => setMode({ type: 'new' })}>New session</Button></div>}
      {rows === null && <p className="text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-slate-200">No sessions yet.</p>}
      {rows?.map((s) => (
        <Panel key={s.id} title={s.name} actions={<Pill on={s.status === 'active'} yes="Open" no={STATUS[s.status]} />}>
          {mode?.id === s.id && mode.type === 'edit' ? <SessionForm initial={s} onSaved={done} onCancel={() => setMode(null)} />
            : mode?.id === s.id && mode.type === 'classes' ? <ClassPicker session={s} onSaved={done} onCancel={() => setMode(null)} />
            : (
              <>
                <p className="text-sm text-muted">{s.academicSession} · {lagosDisplay(s.opensAt)} to {lagosDisplay(s.closesAt)}</p>
                <div className="flex flex-wrap gap-1.5">{s.categories.length ? s.categories.map((c) => <span key={c.id} className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-medium text-navy">{c.name}</span>) : <span className="text-sm text-amber-700">No classes chosen yet: parents cannot apply.</span>}</div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setMode({ type: 'edit', id: s.id })}>Edit dates</Button>
                  <Button variant="secondary" onClick={() => setMode({ type: 'classes', id: s.id })}>Choose classes</Button>
                  {s.status !== 'active' && <Button onClick={() => setStatus(s, 'active')}>Open applications</Button>}
                  {s.status === 'active' && <Button variant="secondary" onClick={() => setStatus(s, 'closed')}>Close applications</Button>}
                </div>
              </>
            )}
        </Panel>
      ))}
    </div>
  );
}
