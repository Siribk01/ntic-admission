// Step 6: check everything, give consent, submit.
import { useState } from 'react';
import { submitApplication, updateApplication } from '../../api/applications.js';
import { feeFor, naira } from '../../api/reference.js';
import { Alert, Button } from '../../components/ui.jsx';

// what a missing item means, and which step fixes it
const WHERE = { applicant: 0, guardians: 1, application: 2, documents: 3 };
const TEXT = {
  'applicant.contactPhone': 'Add a contact phone number', 'applicant.addressLine': 'Add the home address', 'applicant.residenceStateId': 'Choose the state of residence',
  'guardians.parentOrGuardian': 'Add the father, mother or a guardian', 'guardians.emergencyContact': 'Add an emergency contact',
  'application.campusId': 'Choose a campus', 'application.categoryId': 'Choose an admission category', 'application.boarding': 'Choose day or boarding',
  'application.heardFromOther': 'Say how you heard about NTIC', 'application.consent': null,
};

function Row({ label, children }) {
  return <div className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium text-slate-800">{children || '—'}</dd></div>;
}

export default function ReviewStep({ application, options, docNames, onSaved, onGoto }) {
  const [consent, setConsent] = useState(Boolean(application.consentGivenAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const a = application.applicant;
  const missing = application.missing.filter((m) => m !== 'application.consent');
  const campus = options.campuses.find((c) => c.id === application.campusId);
  const category = options.cycles.flatMap((c) => c.categories).find((c) => c.id === application.categoryId);
  const fee = feeFor(options, application.categoryId, application.campusId);
  const label = (m) => TEXT[m] || (m.startsWith('documents.') ? `Upload the ${(docNames[m.slice(10)] || m.slice(10)).toLowerCase()}` : m);

  async function submit() {
    setBusy(true); setError('');
    try {
      if (!application.consentGivenAt) await updateApplication(application.id, { consent: true });
      await submitApplication(application.id);
      onSaved();
    } catch (err) {
      const items = err.details?.filter((d) => d.field !== 'body').map((d) => d.message);
      setError(items?.length ? `Please fix: ${items.join('; ')}` : err.message);
      onSaved(); // refresh the list of what is missing
    } finally { setBusy(false); }
  }

  const ready = missing.length === 0 && consent;
  return (
    <div className="space-y-6">
      {missing.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">Still to do before you can submit:</p>
          <ul className="space-y-1 text-sm">
            {missing.map((m) => (
              <li key={m}><button onClick={() => onGoto(WHERE[m.split('.')[0]])} className="text-left text-amber-900 underline hover:no-underline">{label(m)}</button></li>
            ))}
          </ul>
        </div>
      ) : <Alert kind="success">Everything is filled in. Read through the summary, then submit.</Alert>}

      <dl className="rounded-xl border border-slate-200 bg-white px-4 py-2">
        <Row label="Child">{[a.firstName, a.middleName, a.surname].filter(Boolean).join(' ')}</Row>
        <Row label="Date of birth">{a.dateOfBirth}</Row>
        <Row label="Parent / guardian">{a.guardians.filter((g) => g.relationship !== 'emergency_contact').map((g) => g.fullName).join(', ')}</Row>
        <Row label="Emergency contact">{a.guardians.find((g) => g.relationship === 'emergency_contact')?.fullName}</Row>
        <Row label="Campus">{campus?.name}</Row>
        <Row label="Class / category">{category?.name}</Row>
        <Row label="Day or boarding">{application.boarding === 'boarding' ? 'Boarding' : application.boarding === 'day' ? 'Day' : ''}</Row>
        <Row label="Application fee">{fee != null ? naira(fee) : ''}</Row>
      </dl>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <input type="checkbox" checked={consent} disabled={Boolean(application.consentGivenAt)} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-brand" />
        <span>I confirm that the information given is true and complete, and I agree that NTIC may use it, and the documents uploaded, to consider this application.</span>
      </label>

      <Alert>{error}</Alert>
      <Button onClick={submit} loading={busy} disabled={!ready}>Submit application</Button>
      <p className="text-xs text-muted">After you submit, the details are locked. Contact NTIC afterwards if something needs to be corrected.</p>
    </div>
  );
}
