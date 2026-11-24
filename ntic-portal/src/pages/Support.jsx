// src/pages/Support.jsx
// Contact the NTIC office.  /support = your requests and a "new request" form;  /support/:requestId = one conversation.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, closeRequest, createRequest, getRequest, listRequests, reply } from '../api/support.js';
import { listApplications } from '../api/applications.js';
import { Alert, Button, Field, Select } from '../components/ui.jsx';

const STATUS = { open: ['Waiting for NTIC', 'bg-amber-50 text-amber-800'], answered: ['NTIC has replied', 'bg-green-50 text-green-800'], closed: ['Closed', 'bg-slate-100 text-slate-600'] };
const fmt = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const Badge = ({ status }) => { const [l, c] = STATUS[status] || [status, 'bg-slate-100']; return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c}`}>{l}</span>; };

function NewRequest({ onCreated }) {
  const [apps, setApps] = useState([]);
  const [form, setForm] = useState({ category: '', subject: '', message: '', applicationId: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { listApplications().then((a) => setApps(a.filter((x) => x.applicationNumber))).catch(() => {}); }, []);
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({});
    try {
      const r = await createRequest({ category: form.category, subject: form.subject.trim(), message: form.message, ...(form.applicationId ? { applicationId: form.applicationId } : {}) });
      onCreated(r.id);
    } catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" noValidate>
      <h2 className="text-lg font-bold text-navy">New message to NTIC</h2>
      <Alert>{error}</Alert>
      <Select label="Topic" name="category" value={form.category} onChange={change} options={CATEGORIES} error={errors.category} />
      {apps.length > 0 && <Select label="About which application? (optional)" name="applicationId" value={form.applicationId} onChange={change} placeholder="Not about one application"
        options={apps.map((a) => ({ value: a.id, label: `${a.applicationNumber}${a.applicant ? ` · ${a.applicant.firstName || ''}` : ''}` }))} error={errors.applicationId} />}
      <Field label="Subject" name="subject" value={form.subject} onChange={change} error={errors.subject} maxLength={120} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Message</span>
        <textarea name="message" rows={5} maxLength={2000} value={form.message} onChange={change}
          className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40 ${errors.message ? 'border-red-500' : 'border-slate-300'}`} />
        {errors.message && <span className="mt-1 block text-xs text-red-600">{errors.message}</span>}
      </label>
      <Button type="submit" loading={busy} disabled={!form.category || !form.subject || !form.message}>Send message</Button>
    </form>
  );
}

function Thread({ requestId }) {
  const [r, setR] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => getRequest(requestId).then(setR).catch((e) => setError(e.message)), [requestId]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    setBusy(true); setError('');
    try { await reply(requestId, text); setText(''); await load(); } catch (e) { setError(e.fieldErrors?.body || e.message); } finally { setBusy(false); }
  }
  async function close() { try { await closeRequest(requestId); await load(); } catch (e) { setError(e.message); } }

  if (!r) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <Link to="/support" className="text-sm text-brand hover:underline">← All messages</Link>
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-navy">{r.subject}</h1><Badge status={r.status} />
        </div>
        <Alert>{error}</Alert>
        <ul className="mt-3 space-y-3">
          {r.messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${m.fromStaff ? 'bg-brand-light text-navy' : 'ml-auto bg-surface text-ink'}`}>
              <div className="mb-1 text-xs font-semibold text-muted">{m.fromStaff ? 'NTIC' : 'You'} · {fmt(m.createdAt)}</div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
        {r.status !== 'closed' ? (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <textarea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={send} loading={busy} disabled={text.trim().length < 2}>Send reply</Button>
              <Button variant="secondary" onClick={close}>Mark as solved</Button>
            </div>
          </div>
        ) : <p className="mt-5 text-sm text-muted">This conversation is closed. Start a new message if you need more help.</p>}
      </div>
    </div>
  );
}

export default function Support() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!requestId) listRequests().then(setList).catch((e) => setError(e.message)); }, [requestId]);

  if (requestId) return <div className="mx-auto max-w-2xl"><Thread requestId={requestId} /></div>;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-navy">Help and messages</h1>
      <Alert>{error}</Alert>
      {list && list.length > 0 && (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link to={`/support/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm hover:border-brand">
                <span><span className="block font-semibold text-navy">{r.subject}</span><span className="text-xs text-muted">{fmt(r.updatedAt)}</span></span>
                <Badge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewRequest onCreated={(id) => navigate(`/support/${id}`)} />
    </div>
  );
}
