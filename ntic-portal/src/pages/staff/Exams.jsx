// src/pages/staff/Exams.jsx
// Exam dates ("slots"): create them, close or reopen them, and open one to see who is booked.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSlot, listSlots, updateSlot } from '../../api/staff.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { CAN_MANAGE_EXAMS } from '../../auth/roles.js';
import { Alert, Button, Field, Select } from '../../components/ui.jsx';
import { useOptions } from '../../hooks/useOptions.js';

export const when = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));

function NewSlot({ onCreated, onCancel }) {
  const { options } = useOptions();
  const [f, setF] = useState({ cycleId: '', campusId: '', date: '', time: '09:00', durationMinutes: '120', venue: '', capacity: '50' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  if (!options) return <p className="text-muted">Loading…</p>;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try {
      await createSlot({
        cycleId: f.cycleId, campusId: f.campusId, startsAt: `${f.date}T${f.time}:00+01:00`, // Nigeria time
        durationMinutes: Number(f.durationMinutes), venue: f.venue.trim(), capacity: Number(f.capacity),
      });
      onCreated();
    } catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" noValidate>
      <h2 className="font-bold text-navy">New exam date</h2>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Admission session" value={f.cycleId} onChange={set('cycleId')} error={errors.cycleId} options={options.cycles.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="Campus" value={f.campusId} onChange={set('campusId')} error={errors.campusId} options={options.campuses.map((c) => ({ value: c.id, label: c.name }))} />
        <Field label="Date" type="date" value={f.date} onChange={set('date')} error={errors.startsAt} />
        <Field label="Start time (Nigeria)" type="time" value={f.time} onChange={set('time')} />
        <Field label="Venue" value={f.venue} onChange={set('venue')} error={errors.venue} />
        <Field label="Seats" type="number" min="1" value={f.capacity} onChange={set('capacity')} error={errors.capacity} />
        <Field label="Length (minutes)" type="number" min="15" value={f.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
      </div>
      <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!f.cycleId || !f.campusId || !f.date || !f.venue}>Create</Button><Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

export default function Exams() {
  const { user } = useAuth();
  const canManage = CAN_MANAGE_EXAMS.includes(user.role);
  const [view, setView] = useState('true'); // upcoming
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => { setRows(null); listSlots(view).then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setRows([]); }); }, [view]);
  useEffect(() => { load(); }, [load]);

  async function toggle(s) {
    try { await updateSlot(s.id, { status: s.status === 'open' ? 'closed' : 'open' }); load(); } catch (e) { setError(e.message); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Exam dates</h1>
        {canManage && !adding && <Button onClick={() => setAdding(true)}>New exam date</Button>}
      </div>
      {adding && <NewSlot onCreated={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />}
      <div className="flex gap-1">{[['true', 'Upcoming'], ['false', 'Past']].map(([k, l]) => (
        <button key={k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>))}</div>
      <Alert>{error}</Alert>
      {rows === null && <p className="text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-slate-200">No exam dates here.</p>}
      <ul className="space-y-3">
        {rows?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div>
              <Link to={`/staff/exams/${s.id}`} className="font-semibold text-brand hover:underline">{when(s.startsAt)}</Link>
              <div className="text-sm text-muted">{s.campusName} · {s.venue} · {s.durationMinutes} min</div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{s.bookedCount} / {s.capacity} booked</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.status === 'open' ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{s.status === 'open' ? 'Open' : 'Closed'}</span>
              {canManage && <button onClick={() => toggle(s)} className="text-xs font-semibold text-brand hover:underline">{s.status === 'open' ? 'Close' : 'Reopen'}</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
