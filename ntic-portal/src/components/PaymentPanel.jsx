// src/components/PaymentPanel.jsx
// Paying the application fee by bank transfer:
//   1. the parent sees the school's account and pays at the bank or by transfer,
//   2. then tells us the details ("I have paid"),
//   3. staff check the money arrived and confirm; the application moves to review and a receipt becomes available.
import { useCallback, useEffect, useState } from 'react';
import { listClaims, listPayments, openReceipt, submitClaim } from '../api/payments.js';
import { naira } from '../api/reference.js';
import { useOptions } from '../hooks/useOptions.js';
import { Alert, Button, Field } from './ui.jsx';

const CLAIM_TEXT = { pending: ['Waiting for NTIC to confirm', 'bg-amber-50 text-amber-800'], confirmed: ['Confirmed', 'bg-green-50 text-green-800'], rejected: ['Not confirmed', 'bg-red-50 text-red-700'] };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date()); // YYYY-MM-DD in Nigeria

function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="ml-2 text-xs font-semibold text-brand hover:underline"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function BankCard({ bank, reference }) {
  if (!bank) return <Alert kind="info">NTIC has not published its bank account details yet. Please contact the school to get them.</Alert>;
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-light p-4 text-sm">
      <p className="mb-3 font-semibold text-navy">Pay into this account</p>
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-3"><dt className="text-muted">Bank</dt><dd className="font-medium">{bank.bankName}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Account name</dt><dd className="font-medium">{bank.accountName}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Account number</dt><dd className="text-lg font-bold tracking-wide text-navy">{bank.accountNumber}<Copy text={bank.accountNumber} /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Narration</dt><dd className="font-medium">{reference}<Copy text={reference} /></dd></div>
      </dl>
      {bank.instructions && <p className="mt-3 text-xs text-slate-600">{bank.instructions}</p>}
      <p className="mt-3 text-xs text-slate-600">Write your application number as the narration, so we can find your payment. Keep the receipt or transfer reference: you will need it below.</p>
    </div>
  );
}

function ClaimForm({ applicationId, balanceMinor, bankName, onDone }) {
  const [form, setForm] = useState({ amount: String(balanceMinor / 100), bankReference: '', bankName: '', paidOn: today(), note: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    const amount = form.amount.replace(/[,\s₦]/g, '');
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) { setErrors({ amount: 'Enter the amount as a number, for example 10000 or 10000.50' }); setBusy(false); return; }
    try {
      await submitClaim(applicationId, {
        amount, bankReference: form.bankReference.trim(), paidOn: form.paidOn,
        ...(form.bankName.trim() ? { bankName: form.bankName.trim() } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      onDone();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4" noValidate>
      <h3 className="font-semibold text-navy">I have paid</h3>
      <Alert>{error}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount paid (₦)" name="amount" inputMode="decimal" value={form.amount} onChange={change} error={errors.amount} required />
        <Field label="Date you paid" name="paidOn" type="date" max={today()} value={form.paidOn} onChange={change} error={errors.paidOn} required />
      </div>
      <Field label="Transfer reference or receipt number" name="bankReference" value={form.bankReference} onChange={change} error={errors.bankReference} required hint="From your bank alert, app or teller" />
      <Field label="Bank you paid from (optional)" name="bankName" value={form.bankName} onChange={change} error={errors.bankName} />
      <Field label="Note (optional)" name="note" value={form.note} onChange={change} error={errors.note} />
      <Button type="submit" loading={busy}>Send payment details</Button>
      <p className="text-xs text-muted">NTIC checks that the money has arrived in {bankName || 'its account'}, usually within one working day. You will get an email.</p>
    </form>
  );
}

// application = the application record (feeAmountMinor, paidMinor, paymentStatus, applicationNumber)
export default function PaymentPanel({ application, onRefresh }) {
  const { options } = useOptions();
  const [claims, setClaims] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([listClaims(application.id), listPayments(application.id)]);
      setClaims(c); setPayments(p);
    } catch (e) { setError(e.message); }
  }, [application.id]);
  useEffect(() => { load(); }, [load]);

  const fee = application.feeAmountMinor;
  const paid = application.paidMinor || 0;
  const balance = Math.max(fee - paid, 0);
  const pending = claims.some((c) => c.status === 'pending');
  const refresh = async () => { setBusy(true); await Promise.all([load(), onRefresh()]); setBusy(false); };

  if (fee == null) return null;
  return (
    <div className="space-y-5 text-left">
      <h2 className="text-lg font-bold text-navy">Application fee</h2>
      <Alert>{error}</Alert>
      <dl className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
        <div className="flex justify-between border-b border-slate-100 py-2"><dt className="text-muted">Fee</dt><dd className="font-medium">{naira(fee)}</dd></div>
        <div className="flex justify-between border-b border-slate-100 py-2"><dt className="text-muted">Paid</dt><dd className="font-medium">{naira(paid)}</dd></div>
        <div className="flex justify-between py-2"><dt className="text-muted">Balance</dt><dd className="font-bold text-navy">{naira(balance)}</dd></div>
      </dl>

      {balance === 0 ? (
        <Alert kind="success">Payment received. Thank you. Your application is now being processed.</Alert>
      ) : (
        <>
          <BankCard bank={options?.bank} reference={application.applicationNumber} />
          {pending
            ? <Alert kind="info">We have your payment details and are checking them. You can send another only after we reply.</Alert>
            : <ClaimForm applicationId={application.id} balanceMinor={balance} bankName={options?.bank?.bankName} onDone={refresh} />}
        </>
      )}

      {claims.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-navy">Your payment details</h3>
          <ul className="space-y-2">
            {claims.map((c) => {
              const [label, look] = CLAIM_TEXT[c.status] || [c.status, 'bg-slate-100'];
              return (
                <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{naira(c.amountMinor)} · {c.bankReference}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${look}`}>{label}</span>
                  </div>
                  <div className="text-xs text-muted">Paid on {c.paidOn}</div>
                  {c.status === 'rejected' && c.rejectionReason && <p className="mt-1 text-xs text-red-700">Reason: {c.rejectionReason}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {payments.filter((p) => p.status === 'successful').length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold text-navy">Receipts</h3>
          <ul className="space-y-2">
            {payments.filter((p) => p.status === 'successful').map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <span>{p.receiptNumber} · {naira(p.amountMinor)}</span>
                <button onClick={() => openReceipt(application.id, p.id).catch((e) => setError(e.message))} className="font-semibold text-brand hover:underline">View receipt (PDF)</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="secondary" onClick={refresh} loading={busy}>Refresh status</Button>
    </div>
  );
}
