// src/components/StatusPanel.jsx
// "Where is my application?"  A timeline of what has happened, plus whatever NTIC is waiting for from the parent:
//   information_required -> answer NTIC's question
//   offered              -> accept or decline the place, download the offer letter
//   waitlisted/rejected  -> the message from NTIC
// and, while the application is still open, a Withdraw button.
import { useCallback, useEffect, useState } from 'react';
import { acceptOffer, declineOffer, getStatus, openOfferLetter, respondToInformationRequest, withdrawApplication } from '../api/status.js';
import { Alert, Button } from './ui.jsx';

export const STATUS_LABEL = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', information_required: 'More information needed',
  decision_pending: 'Awaiting decision', offered: 'Offer made', waitlisted: 'On the waiting list', rejected: 'Not successful',
  withdrawn: 'Withdrawn', closed: 'Closed',
};
const WITHDRAWABLE = ['submitted', 'under_review', 'information_required', 'decision_pending', 'waitlisted', 'offered'];
const fmt = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const day = (d) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'long', timeZone: 'Africa/Lagos' }).format(new Date(d));

function Timeline({ items }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-brand/20 pl-5">
      {items.map((t, i) => {
        const last = i === items.length - 1;
        return (
          <li key={i} className="relative">
            <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 ${last ? 'border-brand bg-brand' : 'border-brand/40 bg-white'}`} />
            <div className={`text-sm ${last ? 'font-semibold text-navy' : 'text-ink'}`}>{STATUS_LABEL[t.status] || t.status}</div>
            <div className="text-xs text-muted">{fmt(t.at)}</div>
            {t.note && <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-xs text-slate-700">{t.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function InfoRequest({ applicationId, question, onDone }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true); setError('');
    try { await respondToInformationRequest(applicationId, message.trim()); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">NTIC needs more information</p>
      {question && <p className="text-amber-900">“{question}”</p>}
      <Alert>{error}</Alert>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Your reply</span>
        <textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </label>
      <Button onClick={send} loading={busy}>Send reply to NTIC</Button>
    </div>
  );
}

function Offer({ applicationId, decision, onDone, onError }) {
  const [confirm, setConfirm] = useState(null); // 'accept' | 'decline'
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await (confirm === 'accept' ? acceptOffer : declineOffer)(applicationId); onDone(); } catch (e) { onError(e.message); setConfirm(null); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
      <p className="text-base font-bold text-green-900">Congratulations, a place has been offered</p>
      {decision.message && <p className="text-green-900">{decision.message}</p>}
      {decision.offerDeadline && <p className="text-green-900">Please respond by <strong>{day(decision.offerDeadline)}</strong>. After that date the offer expires.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => openOfferLetter(applicationId).catch((e) => onError(e.message))}>Download offer letter (PDF)</Button>
      </div>
      {!confirm ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => setConfirm('accept')}>Accept the place</Button>
          <Button variant="secondary" onClick={() => setConfirm('decline')}>Decline</Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg bg-white p-3">
          <p className="font-medium text-slate-800">{confirm === 'accept' ? 'Accept this place for your child?' : 'Decline this place? This cannot be undone.'}</p>
          <div className="flex gap-2">
            <Button onClick={go} loading={busy}>{confirm === 'accept' ? 'Yes, accept' : 'Yes, decline'}</Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Go back</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Withdraw({ applicationId, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setError('');
    try { await withdrawApplication(applicationId, reason.trim()); onDone(); } catch (e) { setError(e.fieldErrors?.reason || e.message); } finally { setBusy(false); }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm text-red-700 hover:underline">Withdraw this application</button>;
  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
      <p className="font-semibold text-red-800">Withdraw this application?</p>
      <p className="text-red-800">NTIC will stop processing it. Fees already paid are not refunded automatically.</p>
      <Alert>{error}</Alert>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-700">Why are you withdrawing?</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
      </label>
      <div className="flex gap-2">
        <Button onClick={go} loading={busy} disabled={reason.trim().length < 3}>Yes, withdraw</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>Keep my application</Button>
      </div>
    </div>
  );
}

export default function StatusPanel({ application, onChanged }) {
  const id = application.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => getStatus(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load, application.status]);
  const changed = async () => { await load(); onChanged(); };

  if (!data) return error ? <Alert>{error}</Alert> : null;
  const { status, timeline, decision } = data;
  const lastInfoNote = [...timeline].reverse().find((t) => t.status === 'information_required')?.note;

  return (
    <div className="space-y-5 text-left">
      <h2 className="text-lg font-bold text-navy">Application progress</h2>
      <Alert>{error}</Alert>
      <Timeline items={timeline} />
      {status === 'information_required' && <InfoRequest applicationId={id} question={lastInfoNote} onDone={changed} />}
      {status === 'offered' && decision && <Offer applicationId={id} decision={decision} onDone={changed} onError={setError} />}
      {status === 'waitlisted' && <Alert kind="info">{decision?.message || 'Your child is on the waiting list. NTIC will contact you if a place becomes available.'}</Alert>}
      {status === 'rejected' && <Alert kind="info">{decision?.message || 'We are sorry: the application was not successful this time.'}</Alert>}
      {decision?.response && ['accepted', 'declined'].includes(decision.response) && (
        <Alert kind={decision.response === 'accepted' ? 'success' : 'info'}>{decision.response === 'accepted' ? 'You accepted this offer. NTIC will contact you with the next steps.' : 'You declined this offer.'}</Alert>
      )}
      {WITHDRAWABLE.includes(status) && <Withdraw applicationId={id} onDone={changed} />}
    </div>
  );
}
