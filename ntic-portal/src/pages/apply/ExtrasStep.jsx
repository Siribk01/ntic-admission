// Step 5: optional extras. Nothing here blocks submission, except that "Other" needs a few words.
import { useState } from 'react';
import { updateApplication } from '../../api/applications.js';
import { Alert, Button, Field, Select } from '../../components/ui.jsx';

const HEARD = [
  ['friends_relatives', 'Friends or relatives'], ['siblings', 'My other children / siblings'], ['parent', 'A current NTIC parent'], ['alumni', 'NTIC alumni'],
  ['ntic_staff', 'NTIC staff'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['educational_website', 'An educational website'],
  ['newspaper', 'Newspaper'], ['television', 'Television'], ['billboard', 'Billboard'], ['banner', 'Banner'], ['handbill', 'Handbill'], ['other', 'Other'],
];

export default function ExtrasStep({ application, options, onSaved }) {
  const [form, setForm] = useState({
    preferredExamDate: application.preferredExamDate || '', preferredExamTime: application.preferredExamTime || '',
    preferredExamCampusId: application.preferredExamCampusId || '', interviewAvailability: application.interviewAvailability || '',
    heardFrom: application.heardFrom || [], heardFromOther: application.heardFromOther || '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (e) => { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setSaved(''); };
  const toggle = (v) => { setForm((f) => ({ ...f, heardFrom: f.heardFrom.includes(v) ? f.heardFrom.filter((x) => x !== v) : [...f.heardFrom, v] })); setSaved(''); };

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({}); setSaved('');
    const blank = (v) => (v === '' ? null : v);
    try {
      await updateApplication(application.id, {
        preferredExamDate: blank(form.preferredExamDate), preferredExamTime: blank(form.preferredExamTime),
        preferredExamCampusId: blank(form.preferredExamCampusId), interviewAvailability: blank(form.interviewAvailability),
        heardFrom: form.heardFrom, heardFromOther: form.heardFrom.includes('other') ? blank(form.heardFromOther.trim()) : null,
      });
      setSaved('Saved.'); onSaved();
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <Alert>{error}</Alert>
      <Alert kind="success">{saved}</Alert>
      <div>
        <h3 className="mb-1 font-semibold text-navy">Entrance exam preference (optional)</h3>
        <p className="mb-3 text-xs text-muted">You choose the actual exam date after you submit. This only helps us plan.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Preferred date" name="preferredExamDate" type="date" value={form.preferredExamDate} onChange={change} error={errors.preferredExamDate} />
          <Select label="Preferred time" name="preferredExamTime" value={form.preferredExamTime} onChange={change} error={errors.preferredExamTime} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }]} />
          <Select label="Exam centre" name="preferredExamCampusId" value={form.preferredExamCampusId} onChange={change} error={errors.preferredExamCampusId} options={options.campuses.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      </div>
      <Field label="When are you available for an interview? (optional)" name="interviewAvailability" value={form.interviewAvailability} onChange={change} error={errors.interviewAvailability} hint="For example: weekday afternoons" />
      <fieldset>
        <legend className="mb-2 font-semibold text-navy">How did you hear about NTIC? (optional)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {HEARD.map(([v, label]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={form.heardFrom.includes(v)} onChange={() => toggle(v)} className="accent-brand" />{label}
            </label>
          ))}
        </div>
        {errors.heardFrom && <p className="mt-1 text-xs text-red-600">{errors.heardFrom}</p>}
      </fieldset>
      {form.heardFrom.includes('other') && <Field label="Please say how" name="heardFromOther" value={form.heardFromOther} onChange={change} error={errors.heardFromOther} />}
      <Button type="submit" loading={busy}>Save</Button>
    </form>
  );
}
