// src/pages/apply/ApplicationDashboard.jsx
// What the parent sees after submitting: who, where things stand in plain words, what to do next,
// and a strip of the six stages (green = done, amber = waiting, red = your turn, grey = not yet).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getExam, openExamCard } from '../../api/exams.js';
import { getInterview } from '../../api/interview.js';
import { naira } from '../../api/reference.js';
import { getStatus, openOfferLetter } from '../../api/status.js';
import CorrectionsPanel from '../../components/CorrectionsPanel.jsx';
import ExamPanel from '../../components/ExamPanel.jsx';
import InterviewPanel from '../../components/InterviewPanel.jsx';
import PaymentPanel from '../../components/PaymentPanel.jsx';
import StatusPanel, { STATUS_LABEL } from '../../components/StatusPanel.jsx';
import { Banner, Icon, InfoCard, ProgressStrip, Section } from '../../components/dash.jsx';
import { Alert, Button } from '../../components/ui.jsx';

const dayTime = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const dayOnly = (iso) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'long', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const short = (iso) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(iso));

const MESSAGE = {
  submitted: 'We have received your application and will start reviewing it soon.',
  under_review: 'NTIC is reviewing your application.',
  information_required: 'NTIC needs more information from you.',
  decision_pending: 'Your application has been reviewed. The admissions team is now making a decision.',
  offered: 'Congratulations! A place has been offered to your child.',
  waitlisted: 'Your child is on the waiting list. NTIC will contact you if a place opens.',
  rejected: 'Sorry, this application was not successful this time.',
  withdrawn: 'This application was withdrawn.',
  closed: 'This application is closed.',
};
const CLOSED = ['withdrawn', 'rejected', 'closed'];

export default function ApplicationDashboard({ application, options, onRefresh }) {
  const a = application.applicant;
  const [exam, setExam] = useState(null);
  const [interview, setInterview] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const fee = application.feeAmountMinor;
  const paid = fee != null && (application.paidMinor || 0) >= fee;
  const part = (application.paidMinor || 0) > 0 && !paid;

  useEffect(() => {
    getStatus(application.id).then(setStatus).catch(() => {});
    getInterview(application.id).then(setInterview).catch(() => {});
    if (paid) getExam(application.id).then(setExam).catch(() => {}); else setExam(null);
  }, [application.id, application.status, application.paidMinor, paid]);

  const campus = options.campuses.find((c) => c.id === application.campusId)?.name;
  const cycle = options.cycles.find((c) => c.id === application.cycleId);
  const category = options.cycles.flatMap((c) => c.categories || []).find((c) => c.id === application.categoryId)?.name;

  const st = application.status;
  const decision = status?.decision;
  const accepted = decision?.response === 'accepted';
  const examBooked = exam?.status === 'scheduled' && exam.slot;
  const interviewOn = interview?.status === 'scheduled';

  // ---- the three words a parent needs: where are we, what next
  let message = MESSAGE[st] || STATUS_LABEL[st] || st;
  if (st === 'closed' && accepted) message = 'You accepted the offer. Welcome to NTIC! We will contact you with the next steps.';
  const statusTone = st === 'offered' ? 'done' : st === 'information_required' ? 'todo' : st === 'closed' && accepted ? 'done' : CLOSED.includes(st) ? 'idle' : 'wait';

  let next = 'Nothing to do now. We will email you when something changes.';
  if (CLOSED.includes(st)) next = null;
  else if (st === 'information_required') next = 'Reply to NTIC’s question in the “Application progress” box below.';
  else if (st === 'offered' && decision && !decision.response) next = `Accept or decline the offer${decision.offerDeadline ? ` before ${dayOnly(decision.offerDeadline)}` : ''}.`;
  else if (!paid && fee != null) next = 'Pay the application fee, so your child can book the entrance exam.';
  else if (paid && exam && !examBooked) next = 'Choose a date for the entrance exam.';
  else if (examBooked && new Date(exam.slot.startsAt) > new Date()) next = `Download the exam card and bring it on ${dayTime(exam.slot.startsAt)}.`;
  else if (interviewOn) next = `Be ready for the interview on ${dayTime(interview.startsAt)}.`;
  if (paid && exam === null && !CLOSED.includes(st)) next = null; // still loading the exam booking: say nothing rather than something wrong

  // ---- the strip
  const steps = [
    { label: 'Child details', icon: 'users', value: 'Completed', tone: 'done', to: 'corrections' },
    { label: 'Documents', icon: 'doc', value: 'Uploaded', tone: 'done', to: 'corrections' },
    { label: 'Application fee', icon: 'card', value: paid ? 'Paid' : part ? 'Part paid' : fee == null ? '—' : 'Not paid', tone: paid ? 'done' : fee == null ? 'idle' : 'todo', to: 'payment' },
    { label: 'Entrance exam', icon: 'book', to: 'exam',
      ...(examBooked ? { value: `Booked, ${short(exam.slot.startsAt)}`, tone: 'done' } : paid ? { value: 'Choose a date', tone: 'todo' } : { value: 'Pay the fee first', tone: 'idle' }) },
    { label: 'Interview', icon: 'chat', to: 'interview',
      ...(interview?.status === 'completed' ? { value: 'Done', tone: 'done' } : interviewOn ? { value: short(interview.startsAt), tone: 'wait' } : { value: 'Not scheduled', tone: 'idle' }) },
    { label: 'Decision', icon: 'flag', to: 'status',
      ...(st === 'offered' ? { value: 'Offer made', tone: 'done' } : st === 'closed' && accepted ? { value: 'Accepted', tone: 'done' } : st === 'rejected' ? { value: 'Not successful', tone: 'idle' } : st === 'waitlisted' ? { value: 'Waiting list', tone: 'wait' } : st === 'withdrawn' ? { value: 'Withdrawn', tone: 'idle' } : { value: 'Pending', tone: 'wait' }) },
  ];

  return (
    <div className="space-y-5">
      <Banner title={`Welcome, ${a.firstName} ${a.surname}`} subtitle={<>Application number <strong className="text-ink">{application.applicationNumber}</strong>{application.submittedAt ? ` · submitted ${dayOnly(application.submittedAt)}` : ''}</>} />
      <Alert>{error}</Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Admission session"><p className="font-semibold text-ink">{cycle?.name || 'Admission'}</p>{fee != null && <p className="mt-1 text-muted">Application fee {naira(fee)}</p>}</InfoCard>
        <InfoCard label="Class applied for"><p className="font-semibold text-ink">{category || '—'}</p><p className="mt-1 text-muted">{campus || ''}{application.boarding ? ` · ${application.boarding === 'boarding' ? 'Boarding' : 'Day'}` : ''}</p></InfoCard>
        <InfoCard label="Admission status" tone={statusTone}>
          <p className="font-semibold text-ink">{STATUS_LABEL[st] || st}</p>
          <p className="mt-1 text-slate-700">{message}</p>
          {next && <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-slate-800"><span className="font-semibold">What to do next: </span>{next}</p>}
        </InfoCard>
        <InfoCard label="Your documents">
          <div className="space-y-2">
            {examBooked && <Button variant="secondary" className="w-full" onClick={() => openExamCard(application.id).catch((e) => setError(e.message))}><Icon name="download" className="mr-2 h-4 w-4" />Exam card (PDF)</Button>}
            {(st === 'offered' || accepted) && <Button variant="secondary" className="w-full" onClick={() => openOfferLetter(application.id).catch((e) => setError(e.message))}><Icon name="download" className="mr-2 h-4 w-4" />Offer letter (PDF)</Button>}
            {!examBooked && st !== 'offered' && !accepted && <p className="text-muted">Your exam card and offer letter will appear here when they are ready.</p>}
          </div>
        </InfoCard>
      </div>

      <ProgressStrip steps={steps} />

      <Section id="status"><StatusPanel application={application} onChanged={onRefresh} /></Section>
      {!CLOSED.includes(st) && <Section id="payment"><PaymentPanel application={application} onRefresh={onRefresh} /></Section>}
      {!CLOSED.includes(st) && paid && <Section id="exam"><ExamPanel application={application} /></Section>}
      {!CLOSED.includes(st) && <div id="interview" className="scroll-mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 empty:hidden sm:p-6"><InterviewPanel application={application} /></div>}
      {!CLOSED.includes(st) && <Section id="corrections"><CorrectionsPanel application={application} /></Section>}

      <p className="text-center text-sm text-muted">Need help? <Link to="/support" className="text-brand hover:underline">Message NTIC</Link> · <Link to="/" className="text-brand hover:underline">Back to my children</Link></p>
    </div>
  );
}
