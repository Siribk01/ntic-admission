// src/pages/staff/Reports.jsx
// Numbers for the admissions office, and spreadsheet downloads. The server applies campus limits and hides money from roles that may not see it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadExport, getDashboard, setup } from '../../api/staff.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { EXPORTS } from '../../auth/roles.js';
import { Alert, Button, Field, Select } from '../../components/ui.jsx';
import { STATUS_LABEL } from '../../components/StatusPanel.jsx';
import { useOptions } from '../../hooks/useOptions.js';

const num = (n) => new Intl.NumberFormat('en-NG').format(n || 0);
const naira = (s) => `₦${new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(String(s).replace(/,/g, '')) || 0)}`;

function Tile({ label, value, tone = 'text-navy', to }) {
  const body = (<div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div><div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div></div>);
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body;
}
function Box({ title, children, className = '' }) {
  return <section className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}><h2 className="mb-3 font-bold text-navy">{title}</h2>{children}</section>;
}
function Pairs({ rows }) {
  return <dl className="space-y-1.5 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1 last:border-0"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>;
}
function Bars({ rows }) { // rows: [{ label, count }]
  const max = Math.max(1, ...rows.map((r) => r.count));
  return <ul className="space-y-2">{rows.map((r) => (
    <li key={r.label} className="text-sm"><div className="mb-0.5 flex justify-between"><span>{r.label}</span><span className="font-semibold">{num(r.count)}</span></div>
      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand" style={{ width: `${(r.count / max) * 100}%` }} /></div></li>))}</ul>;
}
function Daily({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <div className="flex h-28 items-end gap-0.5" role="img" aria-label="Applications submitted per day, last 30 days">
        {rows.map((r) => <div key={r.date} title={`${r.date}: ${r.count}`} className="flex-1 rounded-t bg-brand/80" style={{ height: `${Math.max((r.count / max) * 100, r.count ? 4 : 1)}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{rows[0]?.date}</span><span>{rows.at(-1)?.date}</span></div>
    </div>
  );
}

function Exports({ role, cycles, campuses, cycleId, campusId }) {
  const mine = EXPORTS.filter((e) => e.roles.includes(role));
  const [dataset, setDataset] = useState(mine[0]?.dataset);
  const [f, setF] = useState({ status: '', from: '', to: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const cur = mine.find((e) => e.dataset === dataset);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function go(format) {
    setBusy(format); setError(''); setErrors({});
    try { await downloadExport(dataset, format, { cycleId, campusId, status: f.status, from: f.from, to: f.to }); }
    catch (err) { setErrors(err.fieldErrors || {}); setError(err.message); }
    finally { setBusy(''); }
  }
  if (!mine.length) return null;
  return (
    <Box title="Download as a spreadsheet">
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><span className="mb-1 block text-sm font-medium text-slate-700">What to download</span>
            <div className="flex flex-wrap gap-2">{mine.map((e) => (
              <button key={e.dataset} type="button" onClick={() => { setDataset(e.dataset); setF((x) => ({ ...x, status: '' })); }}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${dataset === e.dataset ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'}`}>{e.label}</button>))}</div></div>
          <Select label="Status (optional)" placeholder="Any" value={f.status} onChange={set('status')} error={errors.status} options={cur.statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] || s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') }))} />
          <Field label="From (optional)" type="date" value={f.from} onChange={set('from')} error={errors.from} />
          <Field label="To (optional)" type="date" value={f.to} onChange={set('to')} error={errors.to} />
        </div>
        <p className="text-xs text-muted">{cur.hint} It uses the session and campus chosen above{campuses.length === 0 ? '' : ' (or all your campuses)'}. Every download is recorded in the audit log because it contains personal details.</p>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy === 'xlsx'} disabled={Boolean(busy)} onClick={() => go('xlsx')}>Download Excel</Button>
          <Button variant="secondary" loading={busy === 'csv'} disabled={Boolean(busy)} onClick={() => go('csv')}>Download CSV</Button>
        </div>
      </div>
    </Box>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { options } = useOptions();
  const [cycles, setCycles] = useState([]);
  const [cycleId, setCycleId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { // central admin can pick any session; others get the sessions that are open
    const open = (options?.cycles || []).map((c) => ({ id: c.id, label: c.name }));
    if (user.role === 'central_admin') setup.cycles().then((r) => setCycles((Array.isArray(r) ? r : r.items || []).map((c) => ({ id: c.id, label: c.name })))).catch(() => setCycles(open));
    else setCycles(open);
  }, [options, user.role]);

  useEffect(() => {
    setD(null); setError('');
    getDashboard({ cycleId, campusId }).then(setD).catch((e) => { setError(e.message); setD({ cycle: null }); });
  }, [cycleId, campusId]);

  const campuses = options?.campuses || [];
  const money = d && d.payments;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy">Reports</h1>
          <p className="text-sm text-muted">{d?.cycle ? `Session ${d.cycle.academicSession}${d.generatedAt ? ` · updated ${new Intl.DateTimeFormat('en-NG', { timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(d.generatedAt))}` : ''}` : 'Admissions overview'}</p></div>
        <div className="flex flex-wrap gap-3">
          <div className="w-56"><Select label="Session" placeholder="Latest" value={cycleId} onChange={(e) => setCycleId(e.target.value)} options={cycles.map((c) => ({ value: c.id, label: c.label }))} /></div>
          <div className="w-48"><Select label="Campus" placeholder="All my campuses" value={campusId} onChange={(e) => setCampusId(e.target.value)} options={campuses.map((c) => ({ value: c.id, label: c.name }))} /></div>
        </div>
      </div>
      <Alert>{error}</Alert>
      {!d ? <p className="text-muted">Loading…</p> : !d.cycle ? <p className="rounded-xl bg-white p-6 text-center text-muted ring-1 ring-slate-200">{d.message || 'No data to show.'}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Applications submitted" value={num(d.applications.submitted)} />
            <Tile label="Still in draft" value={num(d.applications.drafts)} tone="text-slate-600" />
            {money ? <Tile label="Fees collected" value={naira(money.collected)} tone="text-green-700" /> : <Tile label="Offers accepted" value={num(d.offers.accepted)} tone="text-green-700" />}
            {money ? <Tile label="Fees still owed" value={naira(money.stillOwed)} tone="text-amber-700" /> : <Tile label="Free exam seats" value={num(d.exams.upcomingFree)} />}
          </div>

          <Box title="Needs attention">
            <ul className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
              {[['Waiting for the parent to send information', d.needsAttention.informationRequested], ['Waiting for a decision', d.needsAttention.awaitingDecision], ['Exam results to review', d.needsAttention.resultsAwaitingReview], ['Interviews past their time with no outcome', d.needsAttention.interviewsAwaitingOutcome],
                ...(money ? [['Bank transfers to confirm', d.needsAttention.bankTransfersToConfirm], ['Online payments to review', d.needsAttention.onlinePaymentsToReview]] : [])].map(([k, v]) => (
                <li key={k} className="flex justify-between border-b border-slate-100 pb-1"><span>{k}</span><span className={`font-bold ${v ? 'text-amber-700' : 'text-slate-400'}`}>{num(v)}</span></li>))}
            </ul>
          </Box>

          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="From application to offer"><Bars rows={d.funnel} /></Box>
            <Box title="Applications by status"><Bars rows={Object.entries(d.applications.byStatus).map(([k, v]) => ({ label: STATUS_LABEL[k] || k, count: v }))} /></Box>
          </div>

          <Box title="Submitted per day, last 30 days"><Daily rows={d.applications.submittedPerDay} /></Box>

          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="By campus">{d.applications.byCampus.length ? <Bars rows={d.applications.byCampus.map((r) => ({ label: r.name, count: r.count }))} /> : <p className="text-sm text-muted">Nothing yet.</p>}</Box>
            <Box title="By class">{d.applications.byCategory.length ? <Bars rows={d.applications.byCategory.map((r) => ({ label: r.name, count: r.count }))} /> : <p className="text-sm text-muted">Nothing yet.</p>}</Box>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Box title="Exams (upcoming dates)"><Pairs rows={[['Exam dates', num(d.exams.upcomingSlots)], ['Seats', num(d.exams.upcomingSeats)], ['Booked', num(d.exams.upcomingBooked)], ['Free', num(d.exams.upcomingFree)]]} /></Box>
            <Box title="Interviews"><Pairs rows={[['Upcoming', num(d.interviews.upcoming)], ['Past time, no outcome', num(d.interviews.awaitingOutcome)], ['Completed', num(d.interviews.completed)], ['Absent', num(d.interviews.absent)], ['Cancelled', num(d.interviews.cancelled)]]} /></Box>
            <Box title="Offers"><Pairs rows={[['Waiting for reply', num(d.offers.pending)], ['Accepted', num(d.offers.accepted)], ['Declined', num(d.offers.declined)], ['Expired', num(d.offers.expired)]]} /></Box>
          </div>

          {money && (
            <Box title="Payments">
              <div className="grid gap-6 md:grid-cols-2">
                <Pairs rows={[['Collected', `${naira(money.collected)} (${num(money.paymentCount)} payments)`], ['Waived', naira(money.waived)], ['Reversed', `${naira(money.reversed)} (${num(money.reversedCount)})`], ['Still owed', `${naira(money.stillOwed)} on ${num(money.applicationsWithBalance)} applications`]]} />
                <Pairs rows={Object.entries(money.byMethod).map(([m, v]) => [m.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), `${naira(v.amount)} (${num(v.count)})`])} />
              </div>
            </Box>
          )}
          <Exports role={user.role} cycles={cycles} campuses={campuses} cycleId={d.cycle.id} campusId={campusId} />
        </>
      )}
    </div>
  );
}
