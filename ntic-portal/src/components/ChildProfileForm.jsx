// src/components/ChildProfileForm.jsx
// The child's personal details. Used on its own (/children/...) and as step 1 of the application.
import { useState } from 'react';
import { createChild, updateChild } from '../api/applicants.js';
import { COUNTRIES, HOME_COUNTRY } from '../data/countries.js';
import { useOptions } from '../hooks/useOptions.js';
import { Alert, Button, Field, Select } from './ui.jsx';

const EMPTY = {
  firstName: '', middleName: '', surname: '', dateOfBirth: '', gender: '', nationality: HOME_COUNTRY,
  placeOfBirth: '', stateOfOriginId: '', contactPhone: '', contactEmail: '', addressLine: '', residenceStateId: '',
};
// Earlier versions stored the word "Nigerian"; the drop-down uses country names, so show it as "Nigeria"
const fromServer = (c) => {
  const f = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c?.[k] ?? EMPTY[k]]));
  if (f.nationality === 'Nigerian') f.nationality = HOME_COUNTRY;
  return f;
};
const REQUIRED = ['firstName', 'surname', 'dateOfBirth', 'gender', 'nationality'];
// blank optional boxes become null (clears the value); required ones are sent as typed
const toPayload = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => {
  const t = typeof v === 'string' ? v.trim() : v;
  return [k, t === '' && !REQUIRED.includes(k) ? null : t];
}));

const countryOptions = COUNTRIES.map((c) => ({ value: c, label: c }));

// child = saved child or null (new). onSaved(child) is called after a successful save.
export default function ChildProfileForm({ child, onSaved, submitLabel = 'Save', onCancel }) {
  const { options, error: optionsError } = useOptions();
  const [form, setForm] = useState(fromServer(child));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (e) => { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setSaved(''); };
  const stateOptions = (options?.states || []).map((s) => ({ value: s.id, label: s.name }));
  const nigerian = form.nationality === HOME_COUNTRY;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(''); setErrors({}); setSaved('');
    try {
      const payload = toPayload(form);
      if (!nigerian) payload.stateOfOriginId = null; // a state of origin only applies to Nigerians
      const c = child ? await updateChild(child.id, payload) : await createChild(payload);
      setForm(fromServer(c)); setSaved('Saved.');
      onSaved?.(c);
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Alert>{error}</Alert>
      <Alert kind="success">{saved}</Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="First name" name="firstName" value={form.firstName} onChange={change} error={errors.firstName} required />
        <Field label="Middle name" name="middleName" value={form.middleName} onChange={change} error={errors.middleName} />
        <Field label="Surname" name="surname" value={form.surname} onChange={change} error={errors.surname} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date of birth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={change} error={errors.dateOfBirth} required />
        <Select label="Gender" name="gender" value={form.gender} onChange={change} error={errors.gender} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <Select label="Nationality" name="nationality" value={form.nationality} onChange={change} error={errors.nationality} options={countryOptions} placeholder="Choose a country…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Place of birth" name="placeOfBirth" value={form.placeOfBirth} onChange={change} error={errors.placeOfBirth} />
        {nigerian && <Select label="State of origin" name="stateOfOriginId" value={form.stateOfOriginId} onChange={change} error={errors.stateOfOriginId} options={stateOptions} />}
      </div>

      <h3 className="pt-2 text-base font-bold text-navy">Contact and home address</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact phone" name="contactPhone" type="tel" value={form.contactPhone} onChange={change} error={errors.contactPhone} hint="A number we can reach you on" />
        <Field label="Contact email (optional)" name="contactEmail" type="email" value={form.contactEmail} onChange={change} error={errors.contactEmail} />
      </div>
      <Field label="Home address" name="addressLine" value={form.addressLine} onChange={change} error={errors.addressLine} />
      <Select label="State of residence" name="residenceStateId" value={form.residenceStateId} onChange={change} error={errors.residenceStateId} options={stateOptions} />
      {optionsError && <Alert>The lists could not be loaded: {optionsError}</Alert>}

      <div className="flex gap-3">
        <Button type="submit" loading={busy}>{submitLabel}</Button>
        {onCancel && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
