// src/components/StaffInterviewPanel.jsx
// Staff: schedule, move or cancel an interview, and see its outcome. Shown on the application page.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelInterview, getInterview, interviewOutcome, listInterviewers, scheduleInterview } from '../api/staff.js';
import { Alert, Button, Field, Select } from './ui.jsx';
import { HISTORY_LABEL, INTERVIEW_STATUS_LABEL, PLATFORM_LABEL, SCORECARD_LABEL, interviewTone, lagosParts, whenLagos } from './interviewShared.js';

const ONLINE = (p) => !['phone', 'in_person'].includes(p);

function ScheduleForm({ applicationId, interview, onDone, onCancel }) {
  const moving = interview?.status === 'scheduled';
  const start = interview?.startsAt ? lagosParts(interview.startsAt) : { date: '', time: '10:00' };
  const [people, setPeople] = useState(null);
  const [f, setF] = useState({
    interviewerId: interview?.interviewer?.id || '', date: start.date, time: start.time,
    durationMinutes: String(interview?.durationMinutes || 30), platform: interview?.platform || 'google_meet',
    meetingUrl: interview?.meetingUrl || '', location: interview?.location || '', instructions: interview?.instructions || '', reason: '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => { listInterviewers().then((r) => setPeople(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setPeople([]); }); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    const body = {
      interviewerId: f.interviewerId, startsAt: `${f.date}T${f.time}:00+01:00`, durationMinutes: Number(f.durationMinutes), timezone: 'Africa/Lagos', platform: f.platform,
    };
    if (f.platform === 'in_person') body.location = f.location.trim();
    else if (f.meetingUrl.trim()) body.meetingUrl = f.meetingUrl.trim();
    if (f.instructions.trim()) body.instructions = f.instructions.trim();
    if (moving && f.reason.trim()) body.reason = f.reason.trim();
    try { await scheduleInterview(applicationId, body); onDone(); }
    catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }

  if (!people) return <p className="text-sm text-muted">Loading interviewers…</p>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Alert>{error}</Alert>
      {people.length === 0 && <Alert kind="info">There are no interviewers yet. Add one under Setup → Staff, with the role Interviewer and a campus.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Interviewer" value={f.interviewerId} onChange={set('interviewerId')} error={errors.interviewerId}
          options={people.map((p) => ({ value: p.id, label: `${p.name}${p.campuses?.length ? ` (${p.campuses.join(', ')})` : ''}` }))} />
        <Select label="How" value={f.platform} onChange={set('platform')} error={errors.platform} placeholder="Choose…"
          options={Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }))} />
        <Field label="Date" type="date" value={f.date} onChange={set('date')} error={errors.startsAt} />
        <Field label="Start time (Nigeria)" type="time" value={f.time} onChange={set('time')} />
        <Field label="Length (minutes)" type="number" min="10" max="240" value={f.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
        {f.platform === 'in_person'
          ? <Field label="Where" value={f.location} onChange={set('location')} error={errors.location} hint="Building, room, campus" />
          : <Field label={ONLINE(f.platform) ? 'Meeting link' : 'Meeting link (optional)'} value={f.meetingUrl} onChange={set('meetingUrl')} error={errors.meetingUrl} placeholder="https://" hint="Paste the link you created. The system does not create meetings." />}
      </div>
      <Field label="Instructions for the parent (optional)" value={f.instructions} onChange={set('instructions')} error={errors.instructions} hint="For example: join five minutes early with the child." />
      {moving && <Field label="Reason for the change" value={f.reason} onChange={set('reason')} error={errors.reason} hint="Required when moving a scheduled interview." />}
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!f.interviewerId || !f.date}>{moving ? 'Save changes' : 'Schedule'}</Button>
        <Button variant="secondary" type="button" onClick={onCancel}>Close</Button>
      </div>
    </form>
  );
}

export default function InterviewPanel({ applicationId, canSchedule }) {
  const [iv, setIv] = useState(null);
  const [mode, setMode] = useState(null); // 'schedule' | 'cancel' | 'absent-change'
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getInterview(applicationId).then(setIv).catch((e) => setError(e.message)), [applicationId]);
  useEffect(() => { load(); }, [load]);

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); setMode(null); setReason(''); await load(); }
    catch (e) { setError(e.fieldErrors?.reason || e.message); }
    finally { setBusy(false); }
  }

  if (!iv) return <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="mb-2 font-bold text-navy">Interview</h2>{error ? <Alert>{error}</Alert> : <p className="text-sm text-muted">Loading…</p>}</section>;
  const none = iv.status === 'not_scheduled';
  const started = iv.startsAt && new Date(iv.startsAt) <= new Date();
  const ended = iv.status === 'completed' || iv.status === 'absent';

  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-navy">Interview</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${interviewTone(iv.status)}`}>{INTERVIEW_STATUS_LABEL[iv.status] || iv.status}</span>
      </div>
      <Alert>{error}</Alert>

      {none && iv.availabilityNote && <p className="rounded-lg bg-surface p-3 text-sm"><span className="font-semibold">Parent&apos;s preferred times (a request only): </span>{iv.availabilityNote}</p>}
      {none && <p className="text-sm text-muted">No interview has been scheduled.</p>}

      {!none && (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-muted">When: </dt><dd className="inline font-medium">{whenLagos(iv.startsAt)} ({iv.durationMinutes} min)</dd></div>
          <div><dt className="inline text-muted">Interviewer: </dt><dd className="inline font-medium">{iv.interviewer?.name}</dd></div>
          <div><dt className="inline text-muted">How: </dt><dd className="inline font-medium">{PLATFORM_LABEL[iv.platform] || iv.platform}</dd></div>
          {iv.meetingUrl && <div><dt className="inline text-muted">Link: </dt><dd className="inline"><a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Open meeting</a></dd></div>}
          {iv.location && <div><dt className="inline text-muted">Where: </dt><dd className="inline font-medium">{iv.location}</dd></div>}
          <div><dt className="inline text-muted">Scorecard: </dt><dd className="inline font-medium">{SCORECARD_LABEL[iv.scorecardStatus] || iv.scorecardStatus}</dd></div>
          {iv.instructions && <div className="sm:col-span-2"><dt className="inline text-muted">Instructions: </dt><dd className="inline">{iv.instructions}</dd></div>}
          {iv.availabilityNote && <div className="sm:col-span-2"><dt className="inline text-muted">Parent&apos;s preferred times: </dt><dd className="inline">{iv.availabilityNote}</dd></div>}
        </dl>
      )}

      {mode === 'schedule' && <ScheduleForm applicationId={applicationId} interview={none ? null : iv} onDone={() => { setMode(null); load(); }} onCancel={() => setMode(null)} />}

      {mode === 'cancel' && (
        <div className="space-y-3">
          <Field label="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2"><Button loading={busy} disabled={reason.trim().length < 3} onClick={() => run(() => cancelInterview(applicationId, reason.trim()))}>Cancel interview</Button><Button variant="secondary" onClick={() => setMode(null)}>Keep it</Button></div>
        </div>
      )}

      {mode === 'outcome' && (
        <div className="space-y-3">
          <Field label="Reason for changing the recorded outcome" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            {iv.status !== 'completed' && <Button loading={busy} disabled={reason.trim().length < 3} onClick={() => run(() => interviewOutcome(applicationId, true, reason.trim()))}>Mark attended</Button>}
            {iv.status !== 'absent' && <Button loading={busy} disabled={reason.trim().length < 3} onClick={() => run(() => interviewOutcome(applicationId, false, reason.trim()))}>Mark absent</Button>}
            <Button variant="secondary" onClick={() => setMode(null)}>Close</Button>
          </div>
        </div>
      )}

      {!mode && (
        <div className="flex flex-wrap gap-2">
          {canSchedule && (none || iv.status === 'cancelled' || iv.status === 'absent') && <Button onClick={() => setMode('schedule')}>{none ? 'Schedule interview' : 'Schedule again'}</Button>}
          {canSchedule && iv.status === 'scheduled' && <Button variant="secondary" onClick={() => setMode('schedule')}>Reschedule or edit</Button>}
          {canSchedule && iv.status === 'scheduled' && <Button variant="secondary" onClick={() => setMode('cancel')}>Cancel</Button>}
          {canSchedule && iv.status === 'scheduled' && started && <Button loading={busy} onClick={() => run(() => interviewOutcome(applicationId, true))}>Mark attended</Button>}
          {canSchedule && iv.status === 'scheduled' && started && <Button variant="secondary" loading={busy} onClick={() => run(() => interviewOutcome(applicationId, false))}>Mark absent</Button>}
          {canSchedule && ended && <Button variant="secondary" onClick={() => setMode('outcome')}>Change outcome</Button>}
          {!none && iv.status !== 'cancelled' && <Link to={`/staff/interviews/${applicationId}`} className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Open scorecard</Link>}
        </div>
      )}
      {canSchedule && iv.status === 'scheduled' && !started && <p className="text-xs text-muted">Attendance can be recorded once the interview has started.</p>}

      {iv.history?.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer text-muted">History</summary>
          <ol className="mt-2 space-y-1">{iv.history.map((h, i) => (
            <li key={i} className="text-xs"><span className="mr-2 text-muted">{whenLagos(h.at)}</span><span className="font-medium">{HISTORY_LABEL[h.action] || h.action}</span>
              {h.toStartsAt && ['scheduled', 'rescheduled'].includes(h.action) && <span> → {whenLagos(h.toStartsAt)}</span>}
              <span className="text-muted"> · {h.by}{h.reason ? ` · ${h.reason}` : ''}</span></li>))}</ol></details>
      )}
    </section>
  );
}
