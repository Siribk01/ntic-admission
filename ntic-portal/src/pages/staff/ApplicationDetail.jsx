// src/pages/staff/ApplicationDetail.jsx
// One application: the child, guardians, documents, payments, exam, history, and (for officers) the review actions.
//   under_review      -> ask the parent for information, or send for decision
//   decision_pending  -> record the decision (offer / waiting list / reject)
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { decide, getApplication, getInterview, openDocument, requestInformation, sendForDecision } from '../../api/staff.js';
import { naira } from '../../api/reference.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { CAN_DECIDE, CAN_SCHEDULE_INTERVIEWS } from '../../auth/roles.js';
import StaffInterviewPanel from '../../components/StaffInterviewPanel.jsx';
import { Banner, InfoCard, ProgressStrip } from '../../components/dash.jsx';
import { Alert, Button, Field } from '../../components/ui.jsx';
import { STATUS_LABEL } from '../../components/StatusPanel.jsx';
import { StatusBadge } from './Applications.jsx';

const when = (iso) => (iso ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso)) : '—');
const pretty = (v) => (v ? String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : v);
const OUTCOME = { offer: 'Offer', waitlist: 'Waiting list', reject: 'Reject' };

const Section = ({ title, children }) => (
  <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"><h2 className="mb-3 font-bold text-navy">{title}</h2>{children}</section>
);
const Row = ({ k, v }) => <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v || '—'}</dd></div>;


const short = (iso) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));

// One plain sentence: what does the office do with this application now?
function officeNext(app, paid) {
  const s = app.status;
  if (['rejected', 'withdrawn', 'closed'].includes(s)) return { tone: 'idle', text: 'Finished. No further action is needed.' };
  if (s === 'information_required') return { tone: 'wait', text: 'Waiting for the parent to reply to your question.' };
  if (s === 'offered') return { tone: 'wait', text: 'Offer sent. Waiting for the parent to accept or decline.' };
  if (!paid) return { tone: 'wait', text: 'Waiting for the application fee to be paid.' };
  if (s === 'submitted') return { tone: 'todo', text: 'Start the review: check the child’s details and documents.' };
  if (s === 'under_review') return { tone: 'todo', text: 'Finish the review. Ask the parent for more information, or move it to the decision stage.' };
  if (s === 'decision_pending') return { tone: 'todo', text: 'Record the decision: offer a place, put on the waiting list, or reject.' };
  if (s === 'waitlisted') return { tone: 'wait', text: 'On the waiting list. You can record a final decision at any time.' };
  return { tone: 'idle', text: '' };
}

function Actions({ app, onDone }) {
  const [mode, setMode] = useState(null); // 'info' | 'decision'
  const [form, setForm] = useState({ message: '', outcome: 'offer', publicMessage: '', notes: '', offerDeadline: '' });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn) {
    setBusy(true); setError(''); setErrors({});
    try { await fn(); setMode(null); onDone(); }
    catch (e) { setErrors(e.fieldErrors || {}); setError(Object.keys(e.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : e.message); }
    finally { setBusy(false); }
  }
  const s = app.status;
  const canAsk = ['under_review', 'decision_pending'].includes(s);
  const canDecide = ['under_review', 'decision_pending', 'waitlisted'].includes(s);
  if (!canAsk && !canDecide) return null;

  return (
    <Section title="What would you like to do?">
      <Alert>{error}</Alert>
      {!mode && (
        <div className="flex flex-wrap gap-2">
          {canAsk && <Button variant="secondary" onClick={() => setMode('info')}>Ask the parent for more information</Button>}
          {s === 'under_review' && <Button variant="secondary" onClick={() => run(() => sendForDecision(app.id))} loading={busy}>Move to the decision stage</Button>}
          {canDecide && <Button onClick={() => setMode('decision')}>Record the decision</Button>}
        </div>
      )}
      {mode === 'info' && (
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-sm font-medium">What do you need from the parent? (they will see this)</span>
            <textarea rows={3} maxLength={1000} value={form.message} onChange={set('message')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {errors.message && <span className="text-xs text-red-600">{errors.message}</span>}</label>
          <div className="flex gap-2"><Button loading={busy} disabled={form.message.trim().length < 5} onClick={() => run(() => requestInformation(app.id, form.message.trim()))}>Send request</Button><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button></div>
        </div>
      )}
      {mode === 'decision' && (
        <div className="space-y-3">
          <div className="flex gap-2">{Object.entries(OUTCOME).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, outcome: k }))}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${form.outcome === k ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{l}</button>))}</div>
          {form.outcome === 'offer' && <Field label="Parent must respond by" type="date" value={form.offerDeadline} onChange={set('offerDeadline')} error={errors.offerDeadline} hint="Between tomorrow and 120 days from now" />}
          <Field label="Message to the parent (optional)" value={form.publicMessage} onChange={set('publicMessage')} error={errors.publicMessage} />
          <Field label="Internal notes (parents do not see these)" value={form.notes} onChange={set('notes')} error={errors.notes} />
          <div className="flex gap-2">
            <Button loading={busy} disabled={form.outcome === 'offer' && !form.offerDeadline}
              onClick={() => run(() => decide(app.id, { outcome: form.outcome, ...(form.publicMessage.trim() ? { publicMessage: form.publicMessage.trim() } : {}), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}), ...(form.outcome === 'offer' ? { offerDeadline: form.offerDeadline } : {}) }))}>
              Confirm: {OUTCOME[form.outcome].toLowerCase()}
            </Button>
            <Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button>
          </div>
          <p className="text-xs text-muted">The parent is emailed straight away. An offer cannot be taken back, so check the outcome first.</p>
        </div>
      )}
    </Section>
  );
}

export default function ApplicationDetail() {
  const { applicationId } = useParams();
  const { user } = useAuth();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [iv, setIv] = useState(null);
  const load = useCallback(() => getApplication(applicationId).then(setApp).catch((e) => setError(e.message)), [applicationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getInterview(applicationId).then(setIv).catch(() => {}); }, [applicationId, app?.status]);

  if (!app) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  const paid = (app.feeAmountMinor || 0) > 0 ? (app.paidMinor || 0) >= app.feeAmountMinor : true;
  const next = officeNext(app, paid);
  const lastDecision = app.decisions?.[0];
  const docCount = app.documents?.length || 0;
  const steps = [
    { label: 'Child details', icon: 'users', value: 'Completed', tone: 'done' },
    { label: 'Documents', icon: 'doc', value: docCount ? `${docCount} uploaded` : 'None', tone: docCount ? 'done' : 'todo' },
    { label: 'Application fee', icon: 'card', value: paid ? 'Paid' : (app.paidMinor || 0) > 0 ? 'Part paid' : 'Not paid', tone: paid ? 'done' : 'wait' },
    { label: 'Entrance exam', icon: 'book', ...(app.exam?.slot ? { value: app.exam.status === 'scheduled' ? `Booked, ${short(app.exam.slot.startsAt)}` : pretty(app.exam.status), tone: 'done' } : { value: paid ? 'Not booked' : 'Not yet', tone: paid ? 'wait' : 'idle' }) },
    { label: 'Interview', icon: 'chat', ...(iv?.status === 'completed' ? { value: 'Done', tone: 'done' } : iv?.status === 'scheduled' ? { value: short(iv.startsAt), tone: 'wait' } : iv?.status === 'absent' ? { value: 'Absent', tone: 'todo' } : { value: 'Not scheduled', tone: 'idle' }) },
    { label: 'Decision', icon: 'flag', ...(lastDecision ? { value: pretty(lastDecision.outcome === 'offer' ? 'Offered' : lastDecision.outcome === 'waitlist' ? 'Waiting list' : 'Rejected'), tone: lastDecision.outcome === 'offer' ? 'done' : 'idle' } : { value: 'Pending', tone: 'wait' }) },
  ];
  return (
    <div className="space-y-4">
      <Link to="/staff" className="text-sm text-brand hover:underline">← All applications</Link>
      <Banner title={`${app.firstName} ${app.middleName || ''} ${app.surname}`.replace(/\s+/g, ' ')} subtitle={`${app.applicationNumber} · submitted ${when(app.submittedAt)}`} right={<StatusBadge status={app.status} />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <InfoCard label="Class and campus"><p className="font-semibold text-ink">{app.categoryName || '—'}</p><p className="mt-1 text-muted">{app.campusName}{app.boarding ? ` · ${pretty(app.boarding)}` : ''}</p></InfoCard>
        <InfoCard label="Application fee" tone={paid ? 'done' : 'wait'}><p className="font-semibold text-ink">{naira(app.paidMinor || 0)} of {naira(app.feeAmountMinor || 0)}</p><p className="mt-1 text-muted">{paid ? 'Fully paid' : 'Not fully paid'}</p></InfoCard>
        <InfoCard label="What happens next" tone={next.tone}><p className="font-semibold text-ink">{STATUS_LABEL[app.status] || app.status}</p>{next.text && <p className="mt-1 text-slate-700">{next.text}</p>}</InfoCard>
      </div>
      <ProgressStrip steps={steps} />
      <Alert>{error}</Alert>
      {CAN_DECIDE.includes(user?.role) && <Actions app={app} onDone={load} />}

      {['submitted', 'under_review', 'information_required', 'decision_pending', 'offered', 'waitlisted'].includes(app.status) && (
        <StaffInterviewPanel applicationId={app.id} canSchedule={CAN_SCHEDULE_INTERVIEWS.includes(user?.role)} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Child"><dl className="text-sm">
          <Row k="Date of birth" v={app.dateOfBirth} /><Row k="Gender" v={pretty(app.gender)} /><Row k="Nationality" v={app.nationality} /><Row k="Place of birth" v={app.placeOfBirth} />
          <Row k="Phone" v={app.contactPhone} /><Row k="Email" v={app.contactEmail} /><Row k="Address" v={app.addressLine} />
        </dl></Section>
        <Section title="Programme"><dl className="text-sm">
          <Row k="Campus" v={app.campusName} /><Row k="Class / category" v={app.categoryName} /><Row k="Programme" v={app.program} /><Row k="Day or boarding" v={pretty(app.boarding)} />
          <Row k="Preferred exam date" v={app.preferredExamDate} /><Row k="Heard about NTIC" v={pretty(app.heardFrom)} />
        </dl></Section>
      </div>

      <Section title="Parents and guardians">
        {app.guardians?.length ? <div className="grid gap-3 md:grid-cols-2">{app.guardians.map((g) => (
          <div key={g.relationship} className="rounded-lg bg-surface p-3 text-sm"><div className="font-semibold">{pretty(g.relationship)}: {g.fullName}</div>
            <div className="text-muted">{g.phone}{g.email ? ` · ${g.email}` : ''}</div><div className="text-muted">{g.occupation}</div></div>))}</div> : <p className="text-sm text-muted">None recorded.</p>}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Documents">
          {app.documents?.length ? <ul className="space-y-2 text-sm">{app.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2"><span>{d.typeName}<span className="block text-xs text-muted">{d.originalName}</span></span>
              <button onClick={() => openDocument(app.id, d.typeCode).catch((e) => setError(e.message))} className="font-semibold text-brand hover:underline">Open</button></li>))}</ul> : <p className="text-sm text-muted">No documents uploaded.</p>}
        </Section>
        <Section title="Payments">
          <dl className="mb-2 text-sm"><Row k="Fee" v={naira(app.feeAmountMinor || 0)} /><Row k="Paid" v={naira(app.paidMinor || 0)} /><Row k="Status" v={pretty(app.paymentStatus)} /></dl>
          {app.payments?.length > 0 && <ul className="space-y-1 text-xs text-muted">{app.payments.map((p) => <li key={p.id}>{p.receiptNumber} · {naira(p.amountMinor)} · {pretty(p.method)} · {pretty(p.status)}</li>)}</ul>}
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Exam">
          {app.exam ? <dl className="text-sm"><Row k="Exam number" v={app.exam.examNumber} /><Row k="Status" v={pretty(app.exam.status)} />
            <Row k="Date" v={app.exam.slot ? when(app.exam.slot.startsAt) : null} /><Row k="Venue" v={app.exam.slot?.venue} /></dl> : <p className="text-sm text-muted">Not booked yet.</p>}
        </Section>
        <Section title="Decisions">
          {app.decisions?.length ? <ul className="space-y-2 text-sm">{app.decisions.map((d) => (
            <li key={d.id}><strong className="capitalize">{d.outcome}</strong> · {when(d.decidedAt)} · {d.decidedBy}
              {d.offerDeadline && <span className="block text-xs text-muted">Respond by {d.offerDeadline} · reply: {d.response}</span>}
              {d.notes && <span className="block text-xs text-muted">Notes: {d.notes}</span>}</li>))}</ul> : <p className="text-sm text-muted">No decision yet.</p>}
        </Section>
      </div>

      <Section title="History">
        <ol className="space-y-1.5 text-sm">{app.history?.map((h, i) => (
          <li key={i} className="flex flex-wrap gap-x-3"><span className="w-36 text-xs text-muted">{when(h.at)}</span><span className="font-medium">{h.from ? `${pretty(h.from)} → ` : ''}{pretty(h.to)}</span>
            <span className="text-xs text-muted">{h.by}{h.reason ? ` · ${h.reason}` : ''}</span></li>))}</ol>
      </Section>
    </div>
  );
}
