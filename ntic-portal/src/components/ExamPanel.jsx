// src/components/ExamPanel.jsx
// Entrance exam booking. Shown once the application fee is fully paid.
//   not_scheduled -> choose a date from the free slots
//   scheduled     -> exam number, date, venue, exam card PDF, and "Change date"
import { useCallback, useEffect, useState } from 'react';
import { bookSlot, getExam, listSlots, openExamCard } from '../api/exams.js';
import { Alert, Button } from './ui.jsx';

const when = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));

function SlotPicker({ applicationId, currentSlotId, onBooked, onCancel }) {
  const [slots, setSlots] = useState(null);
  const [chosen, setChosen] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listSlots(applicationId).then((s) => setSlots(s.filter((x) => x.id !== currentSlotId))).catch((e) => { setError(e.message); setSlots([]); });
  }, [applicationId, currentSlotId]);

  async function confirm() {
    setBusy(true); setError('');
    try { await bookSlot(applicationId, chosen); onBooked(); }
    catch (e) { setError(e.message); if (e.code === 'SLOT_FULL') setChosen(''); }
    finally { setBusy(false); }
  }

  if (slots === null) return <p className="text-sm text-muted">Loading available dates…</p>;
  return (
    <div className="space-y-3">
      <Alert>{error}</Alert>
      {slots.length === 0 && !error && <Alert kind="info">No exam dates are open right now. NTIC will publish them soon; check back later.</Alert>}
      <ul className="space-y-2">
        {slots.map((s) => (
          <li key={s.id}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${chosen === s.id ? 'border-brand bg-brand-light' : 'border-slate-200 bg-white'}`}>
              <input type="radio" name="slot" className="mt-1" checked={chosen === s.id} onChange={() => setChosen(s.id)} />
              <span>
                <span className="block font-semibold text-navy">{when(s.startsAt)}</span>
                <span className="block text-muted">{s.campusName}{s.venue ? ` · ${s.venue}` : ''} · {s.durationMinutes} minutes</span>
                <span className="block text-xs text-muted">{s.seatsLeft} {s.seatsLeft === 1 ? 'seat' : 'seats'} left</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {slots.length > 0 && <Button onClick={confirm} loading={busy} disabled={!chosen}>Confirm this date</Button>}
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

export default function ExamPanel({ application }) {
  const id = application.id;
  const [exam, setExam] = useState(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => getExam(id).then((e) => { setExam(e); setChanging(false); }).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (!exam) return error ? <Alert>{error}</Alert> : null;
  const booked = exam.status === 'scheduled' && exam.slot;

  return (
    <div className="space-y-4 text-left">
      <h2 className="text-lg font-bold text-navy">Entrance exam</h2>
      <Alert>{error}</Alert>
      {booked && !changing && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Your exam is booked</p>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-muted">Exam number</dt><dd className="font-bold tracking-wide text-navy">{exam.examNumber}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Date and time</dt><dd className="text-right font-medium">{when(exam.slot.startsAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Campus</dt><dd className="font-medium">{exam.slot.campusName}</dd></div>
            {exam.slot.venue && <div className="flex justify-between gap-3"><dt className="text-muted">Venue</dt><dd className="font-medium">{exam.slot.venue}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">Duration</dt><dd className="font-medium">{exam.slot.durationMinutes} minutes</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => openExamCard(id).catch((e) => setError(e.message))}>Download exam card (PDF)</Button>
            <Button variant="secondary" onClick={() => setChanging(true)}>Change date</Button>
          </div>
          <p className="mt-3 text-xs text-slate-600">Bring the printed exam card on the day.</p>
        </div>
      )}
      {(!booked || changing) && (
        <>
          {!booked && <p className="text-sm text-muted">Your fee is paid. Choose a date for the entrance exam.</p>}
          <SlotPicker applicationId={id} currentSlotId={exam.slot?.id} onBooked={load} onCancel={changing ? () => setChanging(false) : null} />
        </>
      )}
    </div>
  );
}
