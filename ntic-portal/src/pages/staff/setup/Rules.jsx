// src/pages/staff/setup/Rules.jsx
// Deadlines, reminder timings and two switches, plus the background jobs that act on them.
import { useCallback, useEffect, useState } from 'react';
import { systemSettings } from '../../../api/staff.js';
import { Alert, Button, Field } from '../../../components/ui.jsx';

const GROUPS = [
  { title: 'Payment deadline', items: [
    ['unpaidExpiryDays', 'Days to pay before the application is closed', 'days'],
    ['unpaidWarningDays', 'Send a payment reminder this many days before the deadline', 'days'],
    ['onlinePaymentsEnabled', 'Allow online card payments'],
  ] },
  { title: 'Reminders', items: [
    ['offerReminderDays', 'Remind parents to reply to an offer, days before the deadline', 'days'],
    ['examReminderHours', 'Remind parents before an exam, hours before', 'hours'],
    ['interviewReminderHours', 'Remind parents before an interview, hours before', 'hours'],
  ] },
  { title: 'Applications', items: [['requireVerifiedEmail', 'Parents must confirm their email before submitting']] },
];
const JOBS = {
  reconcile_payments: ['Check online payments', 'Asks the payment provider about payments that are still pending.'],
  expire_unpaid: ['Close unpaid applications', 'Closes applications whose payment deadline has passed.'],
  expire_offers: ['Expire unanswered offers', 'Marks offers as expired once their deadline has passed.'],
  send_reminders: ['Send reminders', 'Emails the payment, offer, exam and interview reminders that are due.'],
};
const DUE = { applicationsToExpire: 'Applications to close', offersToExpire: 'Offers to expire', paymentWarningsToSend: 'Payment reminders due', offerRemindersToSend: 'Offer reminders due', examRemindersToSend: 'Exam reminders due', interviewRemindersToSend: 'Interview reminders due', onlinePaymentsToCheck: 'Online payments to check', onlinePaymentsNeedingReview: 'Online payments needing review' };
const stamp = (iso) => (iso ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso)) : 'never');

function Jobs() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => systemSettings.jobs().then(setS).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function run(job) {
    setBusy(job); setError(''); setInfo(''); setConfirm('');
    try { const r = await systemSettings.runJob(job); setInfo(`Done. ${(Array.isArray(r) ? r : r.results || []).map((x) => `${(JOBS[x.job] || [x.job])[0]}: ${x.processed} handled${x.failed ? `, ${x.failed} failed` : ''}`).join(' · ')}`); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  if (!s) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  const due = Object.entries(s.dueNow || {}).filter(([, n]) => n > 0);
  return (
    <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="font-bold text-navy">Background jobs</h2>
      <p className="text-sm text-muted">{s.scheduled ? 'These run by themselves on the server.' : 'The automatic schedule is switched off on this server, so these only run when you press the buttons below.'} Reminders are only sent between {s.reminderHours}.</p>
      <Alert>{error}</Alert><Alert kind="success">{info}</Alert>
      <p className="text-sm">{due.length ? <>Waiting right now: {due.map(([k, n]) => `${DUE[k] || k} ${n}`).join(' · ')}</> : <span className="text-muted">Nothing is waiting right now.</span>}</p>
      <ul className="divide-y divide-slate-100">{s.jobs.map((j) => (
        <li key={j.job} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><div className="font-semibold">{(JOBS[j.job] || [j.job])[0]}</div><div className="text-xs text-muted">{(JOBS[j.job] || [])[1]}</div>
            <div className="text-xs text-muted">Last run: {stamp(j.lastFinishedAt)}{j.runs ? ` · ${j.lastProcessed} handled` : ''}</div>
            {j.lastError && <div className="text-xs text-red-600">Last error: {j.lastError}</div>}</div>
          {confirm === j.job
            ? <div className="flex items-center gap-2 text-sm"><span>Run it now?</span><Button loading={busy === j.job} onClick={() => run(j.job)}>Yes, run</Button><Button variant="secondary" onClick={() => setConfirm('')}>No</Button></div>
            : <Button variant="secondary" disabled={Boolean(busy)} onClick={() => setConfirm(j.job)}>Run now</Button>}
        </li>))}</ul>
    </section>
  );
}

export default function Rules() {
  const [data, setData] = useState(null);
  const [vals, setVals] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const d = await systemSettings.get(); setData(d); setVals(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.type === 'boolean' ? v.value : String(v.value)]))); }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function save() {
    setBusy(true); setError(''); setErrors({}); setInfo('');
    const changes = {};
    for (const [k, v] of Object.entries(data)) {
      const now = v.type === 'boolean' ? vals[k] : (vals[k] === '' ? NaN : Number(vals[k]));
      if (now !== v.value) changes[k] = now;
    }
    if (!Object.keys(changes).length) { setBusy(false); setInfo('Nothing has changed.'); return; }
    try { await systemSettings.save(changes); setInfo('Saved. The new rules apply from now on.'); await load(); }
    catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-5">
      <Alert>{error}</Alert><Alert kind="success">{info}</Alert>
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-bold text-navy">{g.title}</h2>
          {g.items.map(([k, label, unit]) => { const d = data[k]; if (!d) return null; return d.type === 'boolean' ? (
            <label key={k} className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={Boolean(vals[k])} onChange={(e) => setVals((x) => ({ ...x, [k]: e.target.checked }))} />
              <span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{d.description}</span></span></label>
          ) : (
            <div key={k} className="grid items-start gap-2 sm:grid-cols-[1fr_9rem]">
              <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted">{d.description} Usual value: {d.default}.</div></div>
              <Field label={`Number of ${unit}`} type="number" min={d.min} max={d.max} value={vals[k]} onChange={(e) => setVals((x) => ({ ...x, [k]: e.target.value }))} error={errors[k]} hint={`${d.min} to ${d.max}`} />
            </div>); })}
        </section>))}
      <Button loading={busy} onClick={save}>Save changes</Button>
      <Jobs />
    </div>
  );
}
