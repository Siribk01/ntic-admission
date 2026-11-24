// src/pages/staff/setup/Emails.jsx
// Re-word the automatic emails. The built-in wording always remains as the fallback, and every save is kept as a version.
import { useCallback, useEffect, useState } from 'react';
import { emails } from '../../../api/staff.js';
import { Alert, Button, Field } from '../../../components/ui.jsx';

const nice = (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
const stamp = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));

function Editor({ k, onClose, onSaved }) {
  const [t, setT] = useState(null);
  const [versions, setVersions] = useState([]);
  const [f, setF] = useState({ subject: '', body: '', enabled: true });
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const [x, v] = await Promise.all([emails.get(k), emails.versions(k)]);
    setT(x); setVersions(v);
    const o = x.override;
    // With no custom wording yet, start from a short template. The built-in text has sample values in it, so it is not copied into the box.
    const starterSubject = x.builtIn.subject.replace('NTIC-2027-000123', '{{applicationNumber}}');
    setF({ subject: o?.subject ?? starterSubject, body: o?.body ?? 'Dear parent of {{applicantName}},\n\n{{details}}\n\nNTIC Admissions', enabled: o ? o.enabled : true });
  }, [k]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const set = (name) => (e) => setF((x) => ({ ...x, [name]: e.target.value }));
  const fail = (err) => { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); };

  async function doPreview() {
    setBusy('preview'); setError(''); setErrors({}); setInfo('');
    try { setPreview(await emails.preview(k, { subject: f.subject, body: f.body })); } catch (e) { fail(e); } finally { setBusy(''); }
  }
  async function save() {
    setBusy('save'); setError(''); setErrors({}); setInfo('');
    try { await emails.save(k, { subject: f.subject, body: f.body, enabled: f.enabled, version: t.override?.version ?? 0 }); setInfo('Saved. New emails will use this wording.'); setPreview(null); await load(); onSaved(); }
    catch (e) { fail(e); } finally { setBusy(''); }
  }

  if (!t) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold text-navy">{nice(k)}</h2><button onClick={onClose} className="text-sm font-semibold text-brand hover:underline">← Back to the list</button></div>
      <Alert>{error}</Alert><Alert kind="success">{info}</Alert>

      <details className="rounded-lg bg-surface p-3 text-sm"><summary className="cursor-pointer font-medium">Built-in wording, for reference (the values shown are samples)</summary>
        <p className="mt-2 font-semibold">{t.builtIn.subject}</p><pre className="mt-1 whitespace-pre-wrap font-sans text-muted">{t.builtIn.text}</pre></details>

      <Field label="Subject" value={f.subject} onChange={set('subject')} error={errors.subject} />
      <div>
        <label htmlFor="em-body" className="mb-1 block text-sm font-medium text-slate-700">Message</label>
        <textarea id="em-body" rows={12} value={f.body} onChange={set('body')} className={`w-full rounded-lg border px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-brand/40 ${errors.body ? 'border-red-500' : 'border-slate-300'}`} />
        {errors.body && <p className="mt-1 text-xs text-red-600">{errors.body}</p>}
        <p className="mt-1 text-xs text-muted">Leave a blank line between paragraphs. You can use {t.placeholders.map((p) => `{{${p}}}`).join(', ')}.
          {t.requiresDetails ? ' Keep a line with only {{details}}: the system fills it in with the dates, links and amounts for this email.' : ' A line with only {{details}} adds the system\'s own lines, if this email has any.'}</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.enabled} onChange={(e) => setF((x) => ({ ...x, enabled: e.target.checked }))} /> Use this wording (untick to go back to the built-in wording without losing your text)</label>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy === 'preview'} disabled={Boolean(busy)} onClick={doPreview}>Preview with sample values</Button>
        <Button loading={busy === 'save'} disabled={Boolean(busy)} onClick={save}>Save</Button>
      </div>

      {preview && (
        <div className="rounded-lg border border-brand/20 bg-brand-light/40 p-4 text-sm">
          <div className="text-xs font-semibold uppercase text-muted">Preview (sample values, nothing is sent)</div>
          <p className="mt-1 font-semibold">{preview.custom.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans">{preview.custom.text}</pre>
        </div>
      )}

      {versions.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer text-muted">Earlier versions ({versions.length})</summary>
          <ul className="mt-2 space-y-2">{versions.map((v) => (
            <li key={v.version} className="rounded-lg bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>Version {v.version} · {stamp(v.savedAt)} · {v.savedBy}</span>
              <button className="font-semibold text-brand hover:underline" onClick={() => { setF({ subject: v.subject, body: v.body, enabled: v.enabled }); setPreview(null); setInfo('Loaded into the form. Press Save to use it again.'); }}>Load into the form</button></div>
              <div className="mt-1 font-medium">{v.subject}</div></li>))}</ul></details>
      )}
    </div>
  );
}

export default function Emails() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => emails.list().then(setRows).catch((e) => { setError(e.message); setRows([]); }), []);
  useEffect(() => { load(); }, [load]);

  if (open) return <Editor k={open} onClose={() => { setOpen(null); load(); }} onSaved={load} />;
  if (!rows) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">These are the emails the system sends by itself. Change the wording to suit NTIC; the dates, links and amounts are added automatically.</p>
      <Alert>{error}</Alert>
      <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">{rows.map((r) => (
        <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><div className="font-semibold">{nice(r.key)}</div><div className="text-xs text-muted">Subject: {r.defaultSubject}</div></div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.custom && r.enabled ? 'bg-green-50 text-green-800' : r.custom ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{r.custom ? (r.enabled ? 'Custom wording' : 'Custom (switched off)') : 'Built-in'}</span>
            <button onClick={() => setOpen(r.key)} className="text-sm font-semibold text-brand hover:underline">Edit</button>
          </div>
        </li>))}</ul>
    </div>
  );
}
