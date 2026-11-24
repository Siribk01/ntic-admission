// src/pages/staff/setup/Fees.jsx
// The application fee for each class. One price for every campus, or a different one for a campus or a state.
// To change a price: end the old fee on a date, then add the new one starting the next day.
import { useState } from 'react';
import { setup } from '../../../api/staff.js';
import { naira } from '../../../api/reference.js';
import { Alert, Button, Field, Select } from '../../../components/ui.jsx';
import { useOptions } from '../../../hooks/useOptions.js';
import { Panel, Pill, formError, useRows } from './shared.jsx';

const EMPTY = { categoryId: '', scope: 'all', campusId: '', stateId: '', amount: '', effectiveFrom: '', effectiveTo: '', notes: '' };

function Row({ fee, onChanged, onError }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ amount: String(fee.amountMinor / 100), effectiveTo: fee.effectiveTo || '' });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await setup.updateFee(fee.id, { amount: f.amount.replace(/[,\s₦]/g, ''), effectiveTo: f.effectiveTo || null }); setEdit(false); onChanged(); }
    catch (e) { onError(e.fieldErrors ? Object.values(e.fieldErrors).join(' ') : e.message); } finally { setBusy(false); }
  }
  async function toggle() { try { await setup.updateFee(fee.id, { active: !fee.active }); onChanged(); } catch (e) { onError(e.message); } }
  const place = fee.campusName ? `${fee.campusName} only` : fee.stateName ? `${fee.stateName} state` : 'All campuses';
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-semibold">{fee.categoryName}</span> · {place}
          <span className="block text-xs text-muted">From {fee.effectiveFrom}{fee.effectiveTo ? ` to ${fee.effectiveTo}` : ' (no end date)'}{fee.notes ? ` · ${fee.notes}` : ''}</span></span>
        <span className="flex items-center gap-3"><span className="text-base font-bold text-navy">{naira(fee.amountMinor)}</span><Pill on={fee.active} /></span>
      </div>
      {!edit ? (
        <div className="mt-1 flex gap-3 text-xs font-semibold"><button onClick={() => setEdit(true)} className="text-brand hover:underline">Edit amount / end date</button><button onClick={toggle} className="text-brand hover:underline">{fee.active ? 'Switch off' : 'Switch on'}</button></div>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-3 rounded-lg bg-surface p-3">
          <Field label="Amount (₦)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
          <Field label="Ends on (optional)" type="date" value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} />
          <Button onClick={save} loading={busy}>Save</Button><Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button>
        </div>
      )}
    </li>
  );
}

export default function Fees() {
  const { options } = useOptions();
  const { rows, error, setError, reload } = useRows(setup.fees);
  const cats = useRows(setup.categories);
  const campuses = useRows(setup.campuses);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({}); const [formErr, setFormErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault(); setBusy(true); setFormErr(''); setErrors({});
    const body = { categoryId: f.categoryId, amount: f.amount.replace(/[,\s₦]/g, ''), effectiveFrom: f.effectiveFrom };
    if (f.scope === 'campus') body.campusId = f.campusId;
    if (f.scope === 'state') body.stateId = f.stateId;
    if (f.effectiveTo) body.effectiveTo = f.effectiveTo;
    if (f.notes.trim()) body.notes = f.notes.trim();
    try { await setup.createFee(body); setF(EMPTY); reload(); }
    catch (err) { const r = formError(err); setErrors(r.fieldErrors); setFormErr(r.message); } finally { setBusy(false); }
  }
  const ready = f.categoryId && f.amount && f.effectiveFrom && (f.scope === 'all' || (f.scope === 'campus' && f.campusId) || (f.scope === 'state' && f.stateId));

  return (
    <div className="space-y-4">
      <Alert>{error}</Alert>
      <Panel title="Add a fee">
        <form onSubmit={add} className="space-y-4" noValidate>
          <Alert>{formErr}</Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Class" value={f.categoryId} onChange={set('categoryId')} error={errors.categoryId} options={(cats.rows || []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))} />
            <Field label="Amount (₦)" value={f.amount} onChange={set('amount')} error={errors.amount} inputMode="decimal" hint="For example 10000" />
            <Select label="Applies to" value={f.scope} onChange={set('scope')} placeholder="" options={[{ value: 'all', label: 'All campuses' }, { value: 'campus', label: 'One campus' }, { value: 'state', label: 'One state' }]} />
            {f.scope === 'campus' && <Select label="Campus" value={f.campusId} onChange={set('campusId')} error={errors.campusId} options={(campuses.rows || []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))} />}
            {f.scope === 'state' && <Select label="State" value={f.stateId} onChange={set('stateId')} error={errors.stateId} options={(options?.states || []).map((s) => ({ value: s.id, label: s.name }))} />}
            <Field label="Starts on" type="date" value={f.effectiveFrom} onChange={set('effectiveFrom')} error={errors.effectiveFrom} />
            <Field label="Ends on (optional)" type="date" value={f.effectiveTo} onChange={set('effectiveTo')} error={errors.effectiveTo} />
          </div>
          <Field label="Note (optional)" value={f.notes} onChange={set('notes')} error={errors.notes} />
          <Button type="submit" loading={busy} disabled={!ready}>Add fee</Button>
        </form>
      </Panel>
      <Panel title="Fees">
        {rows === null && <p className="text-muted">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">No fees yet. Parents cannot submit an application for a class with no fee.</p>}
        <ul className="divide-y divide-slate-100">{rows?.map((x) => <Row key={x.id} fee={x} onChanged={reload} onError={setError} />)}</ul>
      </Panel>
    </div>
  );
}
