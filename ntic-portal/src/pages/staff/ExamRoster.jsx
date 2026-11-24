// src/pages/staff/ExamRoster.jsx
// One exam date: who is booked, who came, and their marks.
//   1) after the exam starts, mark each candidate Present or Absent
//   2) for those present, enter marks per subject (saved as a draft)
//   3) a DIFFERENT person reviews the marks; only reviewed marks count
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getResult, getRoster, markAttendance, reviewResult, saveResult } from '../../api/staff.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { CAN_MANAGE_EXAMS } from '../../auth/roles.js';
import { Alert, Button } from '../../components/ui.jsx';
import { when } from './Exams.jsx';

const DEFAULT_SUBJECTS = ['English', 'Mathematics', 'General Studies'];
const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, '_');
const nice = (s) => String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Marks({ candidate, canEdit, onChanged, onError }) {
  const [lines, setLines] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadResult = useCallback(() => getResult(candidate.applicationId).then((r) => {
    setStatus(r.status);
    setLines(r.scores?.length ? r.scores.map((s) => ({ subject: nice(s.subject), score: String(s.score), maxScore: String(s.maxScore) }))
      : DEFAULT_SUBJECTS.map((s) => ({ subject: s, score: '', maxScore: '100' })));
  }).catch((e) => onError(e.message)), [candidate.applicationId, onError]);
  useEffect(() => { loadResult(); }, [loadResult]);

  if (!lines) return <p className="text-sm text-muted">Loading…</p>;
  const set = (i, k) => (e) => setLines((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)));
  const filled = lines.filter((l) => l.subject.trim() && l.score !== '');

  async function save() {
    setBusy(true);
    try {
      await saveResult(candidate.applicationId, { scores: filled.map((l) => ({ subject: slug(l.subject), score: Number(l.score), maxScore: Number(l.maxScore) })) });
      await loadResult(); onChanged();
    } catch (e) { onError(e.fieldErrors ? Object.values(e.fieldErrors).join(' ') : e.message); } finally { setBusy(false); }
  }
  async function review() {
    setBusy(true);
    try { await reviewResult(candidate.applicationId); await loadResult(); onChanged(); } catch (e) { onError(e.message); } finally { setBusy(false); }
  }
  const total = filled.reduce((a, l) => a + (Number(l.score) || 0), 0);
  const max = filled.reduce((a, l) => a + (Number(l.maxScore) || 0), 0);
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-surface p-3">
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 text-sm">
          <input value={l.subject} disabled={!canEdit} onChange={set(i, 'subject')} placeholder="Subject" className="rounded border border-slate-300 px-2 py-1.5" />
          <input value={l.score} disabled={!canEdit} onChange={set(i, 'score')} inputMode="decimal" placeholder="Score" className="rounded border border-slate-300 px-2 py-1.5" />
          <input value={l.maxScore} disabled={!canEdit} onChange={set(i, 'maxScore')} inputMode="decimal" placeholder="Out of" className="rounded border border-slate-300 px-2 py-1.5" />
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Total: {total} / {max}{max > 0 && ` (${Math.round((total / max) * 100)}%)`}</span>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" onClick={() => setLines([...lines, { subject: '', score: '', maxScore: '100' }])}>Add subject</Button>}
          {canEdit && <Button onClick={save} loading={busy} disabled={filled.length === 0}>{status === 'not_entered' ? 'Save marks' : 'Save changes'}</Button>}
          {canEdit && status === 'draft' && <Button variant="secondary" onClick={review} loading={busy}>Mark as reviewed</Button>}
        </div>
      </div>
      {status === 'draft' && <p className="text-xs text-amber-800">Draft. A different staff member must review these marks before they count.</p>}
      {status === 'reviewed' && <p className="text-xs text-green-800">Reviewed.</p>}
    </div>
  );
}

export default function ExamRoster() {
  const { slotId } = useParams();
  const { user } = useAuth();
  const canEdit = CAN_MANAGE_EXAMS.includes(user.role);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => getRoster(slotId).then(setData).catch((e) => setError(e.message)), [slotId]);
  useEffect(() => { load(); }, [load]);

  async function attend(c, attended) {
    setError('');
    try { await markAttendance(c.applicationId, attended); load(); } catch (e) { setError(e.message); }
  }
  if (!data) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  const { slot, counts, candidates } = data;
  const started = new Date(slot.startsAt) <= new Date();
  const RESULT = { draft: ['Draft marks', 'bg-amber-50 text-amber-800'], reviewed: ['Marks reviewed', 'bg-green-50 text-green-800'] };

  return (
    <div className="space-y-4">
      <Link to="/staff/exams" className="text-sm text-brand hover:underline">← Exam dates</Link>
      <div>
        <h1 className="text-2xl font-bold text-navy">{when(slot.startsAt)}</h1>
        <p className="text-muted">{slot.campusName} · {slot.venue} · {counts.total} candidate{counts.total === 1 ? '' : 's'}: {counts.completed || 0} present, {counts.absent || 0} absent, {counts.scheduled || 0} not yet marked</p>
      </div>
      {!started && canEdit && <Alert kind="info">Attendance can be marked once the exam has started.</Alert>}
      <Alert>{error}</Alert>
      {candidates.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-slate-200">Nobody has booked this date yet.</p>}
      <ul className="space-y-3">
        {candidates.map((c) => {
          const [rl, rc] = RESULT[c.resultStatus] || [];
          return (
            <li key={c.examId} className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link to={`/staff/applications/${c.applicationId}`} className="font-semibold text-brand hover:underline">{c.firstName} {c.surname}</Link>
                  <div className="text-xs text-muted">{c.examNumber} · {c.applicationNumber}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {rl && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${rc}`}>{rl}</span>}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === 'completed' ? 'bg-green-50 text-green-800' : c.status === 'absent' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {c.status === 'completed' ? 'Present' : c.status === 'absent' ? 'Absent' : 'Not marked'}
                  </span>
                  {canEdit && started && <>
                    <Button variant="secondary" disabled={c.status === 'completed'} onClick={() => attend(c, true)}>Present</Button>
                    <Button variant="secondary" disabled={c.status === 'absent'} onClick={() => attend(c, false)}>Absent</Button>
                  </>}
                  {c.status === 'completed' && <button onClick={() => setOpen(open === c.examId ? null : c.examId)} className="font-semibold text-brand hover:underline">{open === c.examId ? 'Hide marks' : 'Marks'}</button>}
                </div>
              </div>
              {open === c.examId && <Marks candidate={c} canEdit={canEdit} onChanged={load} onError={setError} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
