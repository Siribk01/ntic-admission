// src/pages/Apply.jsx
// The application, step by step, with a timeline. Route: /applications/:applicationId  (?step=0..5 keeps your place on refresh)
// Everything the backend still needs is reported in application.missing, so the ticks on the timeline come from the server, not from guesses.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getApplication, listDocumentTypes } from '../api/applications.js';
import ChildProfileForm from '../components/ChildProfileForm.jsx';
import GuardianSection from '../components/GuardianSection.jsx';
import Stepper from '../components/Stepper.jsx';
import { Alert, Button } from '../components/ui.jsx';
import { useOptions } from '../hooks/useOptions.js';
import ApplicationDashboard from './apply/ApplicationDashboard.jsx';
import DocumentsStep from './apply/DocumentsStep.jsx';
import ExtrasStep from './apply/ExtrasStep.jsx';
import ProgrammeStep from './apply/ProgrammeStep.jsx';
import ReviewStep from './apply/ReviewStep.jsx';

export default function Apply() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { options, error: optionsError } = useOptions();
  const [application, setApplication] = useState(null);
  const [docNames, setDocNames] = useState({});
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try { setApplication(await getApplication(applicationId)); } catch (e) { setError(e.message); }
  }, [applicationId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { listDocumentTypes().then((t) => setDocNames(Object.fromEntries(t.map((x) => [x.code, x.name])))).catch(() => {}); }, []);

  const steps = useMemo(() => {
    if (!application) return [];
    const none = (prefixes) => !application.missing.some((m) => prefixes.some((p) => m.startsWith(p)));
    const extrasTouched = application.heardFrom?.length || application.interviewAvailability || application.preferredExamDate || application.preferredExamTime;
    return [
      { key: 'child', title: 'Child details', hint: 'Name, birth, address', done: none(['applicant.']) },
      { key: 'parents', title: 'Parents / guardians', hint: 'Who we can contact', done: none(['guardians.']) },
      { key: 'programme', title: 'Programme', hint: 'Campus, class, day or boarding', done: none(['application.campusId', 'application.categoryId', 'application.boarding']) },
      { key: 'documents', title: 'Documents', hint: 'Upload what is required', done: none(['documents.']) },
      { key: 'extras', title: 'Additional information', hint: 'Optional', done: Boolean(extrasTouched) && none(['application.heardFromOther']) },
      { key: 'review', title: 'Review and submit', hint: 'Check and confirm', done: false },
    ];
  }, [application]);

  if (error || optionsError) return <Alert>{error || optionsError}</Alert>;
  if (!application || !options) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (application.status !== 'draft') return <ApplicationDashboard application={application} options={options} onRefresh={reload} />;

  const current = Math.min(Math.max(parseInt(params.get('step') || '0', 10) || 0, 0), steps.length - 1);
  const go = (i) => { setParams({ step: String(i) }, { replace: true }); window.scrollTo({ top: 0 }); };
  const a = application.applicant;

  return (
    <div>
      <Link to="/" className="text-sm text-brand hover:underline">← Back to my children</Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-navy">Admission application</h1>
      <p className="mb-6 text-sm text-muted">{a.firstName} {a.surname} · your progress is saved as you go.</p>

      <div className="grid gap-6 md:grid-cols-[250px_1fr] md:gap-10">
        <div className="md:sticky md:top-6 md:self-start"><Stepper steps={steps} current={current} onSelect={go} /></div>

        <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
          <h2 className="mb-5 text-xl font-bold text-navy">{steps[current].title}</h2>

          {current === 0 && <ChildProfileForm child={a} submitLabel="Save" onSaved={reload} />}
          {current === 1 && <GuardianSection applicantId={a.id} guardians={a.guardians} onChanged={reload} />}
          {current === 2 && <ProgrammeStep key={application.updatedAt} application={application} options={options} onSaved={reload} />}
          {current === 3 && <DocumentsStep applicationId={application.id} onChanged={reload} />}
          {current === 4 && <ExtrasStep application={application} options={options} onSaved={reload} />}
          {current === 5 && <ReviewStep application={application} options={options} docNames={docNames} onSaved={reload} onGoto={go} />}

          <div className="mt-8 flex justify-between border-t border-slate-100 pt-5">
            <Button variant="secondary" onClick={() => (current === 0 ? navigate('/') : go(current - 1))}>{current === 0 ? 'Save and exit' : '← Back'}</Button>
            {current < steps.length - 1 && <Button onClick={() => go(current + 1)}>Next →</Button>}
          </div>
        </section>
      </div>
    </div>
  );
}
