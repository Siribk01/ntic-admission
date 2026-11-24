// src/pages/staff/Claims.jsx
// Bank-transfer payments that parents say they made. Check your bank statement, then confirm (this records the payment
// and issues the receipt) or reject with a reason the parent will see.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmClaim, listClaims, rejectClaim } from '../../api/staff.js';
import { naira } from '../../api/reference.js';
import { Alert, Button } from '../../components/ui.jsx';

const TABS = [['pending', 'To check'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected']];

function Row({ claim, onDone, onError }) {
  const [mode, setMode] = useState(null); // 'confirm' | 'reject'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await (mode === 'confirm' ? confirmClaim(claim.id) : rejectClaim(claim.id, reason.trim())); onDone(); }
    catch (e) { onError(e.fieldErrors?.reason || e.message); setMode(null); }
    finally { setBusy(false); }
  }
  return (
    <li className="rounded-xl bg-white p-4 text-sm shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-navy">{naira(claim.amountMinor)}</div>
          <Link to={`/staff/applications/${claim.applicationId}`} className="font-medium text-brand hover:underline">{claim.candidate} · {claim.applicationNumber}</Link>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted">Reference</dt><dd className="font-mono font-medium">{claim.bankReference}</dd>
          <dt className="text-muted">Paid on</dt><dd>{claim.paidOn}</dd>
          {claim.bankName && <><dt className="text-muted">From bank</dt><dd>{claim.bankName}</dd></>}
          {claim.note && <><dt className="text-muted">Note</dt><dd>{claim.note}</dd></>}
        </dl>
      </div>
      {claim.status === 'rejected' && <p className="mt-2 text-xs text-red-700">Rejected: {claim.rejectionReason}</p>}
      {claim.status === 'confirmed' && <p className="mt-2 text-xs text-green-800">Receipt {claim.receiptNumber}</p>}
      {claim.status === 'pending' && !mode && (
        <div className="mt-3 flex gap-2"><Button onClick={() => setMode('confirm')}>Money received</Button><Button variant="secondary" onClick={() => setMode('reject')}>Reject</Button></div>
      )}
      {mode === 'confirm' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-green-50 p-3">
          <span className="text-green-900">Confirm that {naira(claim.amountMinor)} with reference <strong>{claim.bankReference}</strong> is in the account?</span>
          <Button onClick={go} loading={busy}>Yes, confirm</Button><Button variant="secondary" onClick={() => setMode(null)}>Back</Button>
        </div>
      )}
      {mode === 'reject' && (
        <div className="mt-3 space-y-2 rounded-lg bg-red-50 p-3">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason the parent will see, e.g. We did not receive this transfer"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2"><Button onClick={go} loading={busy} disabled={reason.trim().length < 3}>Reject this claim</Button><Button variant="secondary" onClick={() => setMode(null)}>Back</Button></div>
        </div>
      )}
    </li>
  );
}

export default function Claims() {
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setRows(null); listClaims(tab).then((r) => setRows(Array.isArray(r) ? r : r.items || [])).catch((e) => { setError(e.message); setRows([]); }); }, [tab]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-navy">Bank transfer payments</h1>
      <div className="flex gap-1">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>)}</div>
      <Alert>{error}</Alert>
      {rows === null && <p className="text-muted">Loading…</p>}
      {rows?.length === 0 && <p className="rounded-xl bg-white p-8 text-center text-muted ring-1 ring-slate-200">{tab === 'pending' ? 'Nothing to check right now.' : 'Nothing here.'}</p>}
      <ul className="space-y-3">{rows?.map((c) => <Row key={c.id} claim={c} onDone={load} onError={setError} />)}</ul>
    </div>
  );
}
