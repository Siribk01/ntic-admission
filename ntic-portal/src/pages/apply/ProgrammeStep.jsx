// Step 3: which campus, which class/category, day or boarding. Shows the application fee before the parent commits.
import { useState } from 'react';
import { updateApplication } from '../../api/applications.js';
import { feeFor, naira } from '../../api/reference.js';
import { Alert, Button, Select } from '../../components/ui.jsx';

export default function ProgrammeStep({ application, options, onSaved }) {
  const [form, setForm] = useState({ campusId: application.campusId || '', categoryId: application.categoryId || '', boarding: application.boarding || '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const cycle = options.cycles.find((c) => c.id === application.cycleId);
  const change = (e) => { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setSaved(''); };
  const fee = feeFor(options, form.categoryId, form.campusId);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({}); setSaved('');
    try {
      await updateApplication(application.id, { campusId: form.campusId || null, categoryId: form.categoryId || null, boarding: form.boarding || null });
      setSaved('Saved.'); onSaved();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <p className="text-sm text-muted">Admission session: <strong className="text-slate-700">{cycle?.academicSession || '—'}</strong></p>
      <Alert>{error}</Alert>
      <Alert kind="success">{saved}</Alert>
      <Select label="Campus" name="campusId" value={form.campusId} onChange={change} error={errors.campusId} options={options.campuses.map((c) => ({ value: c.id, label: c.name }))} />
      <Select label="Class / admission category" name="categoryId" value={form.categoryId} onChange={change} error={errors.categoryId} options={(cycle?.categories || []).map((c) => ({ value: c.id, label: c.name }))} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Day or boarding</legend>
        <div className="flex gap-3">
          {[['day', 'Day student'], ['boarding', 'Boarding student']].map(([v, label]) => (
            <label key={v} className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 text-sm font-medium ${form.boarding === v ? 'border-brand bg-brand-light text-navy' : 'border-slate-300 bg-white text-slate-700'}`}>
              <input type="radio" name="boarding" value={v} checked={form.boarding === v} onChange={change} className="mr-2 accent-brand" />{label}
            </label>
          ))}
        </div>
        {errors.boarding && <p className="mt-1 text-xs text-red-600">{errors.boarding}</p>}
      </fieldset>
      {form.campusId && form.categoryId && (
        <div className="rounded-lg bg-brand-light px-4 py-3 text-sm text-navy">
          {fee != null ? <>Application fee: <strong>{naira(fee)}</strong>. It is paid after you submit.</> : 'The fee for this choice has not been set yet. You can still continue; NTIC will confirm it.'}
        </div>
      )}
      <Button type="submit" loading={busy}>Save</Button>
    </form>
  );
}
