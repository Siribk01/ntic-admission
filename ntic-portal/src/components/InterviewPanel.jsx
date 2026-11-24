// src/components/InterviewPanel.jsx
// Shown only when NTIC has scheduled an interview. Nothing appears otherwise.
import { useEffect, useState } from 'react';
import { getInterview } from '../api/interview.js';
import { Alert } from './ui.jsx';

const when = (iso, tz) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'full', timeStyle: 'short', timeZone: tz || 'Africa/Lagos' }).format(new Date(iso));

export default function InterviewPanel({ application }) {
  const [i, setI] = useState(null);
  useEffect(() => { getInterview(application.id).then(setI).catch(() => {}); }, [application.id, application.status]);
  if (!i || !['scheduled', 'completed'].includes(i.status)) return null;
  return (
    <div className="space-y-3 text-left">
      <h2 className="text-lg font-bold text-navy">Interview</h2>
      {i.status === 'completed' && <Alert kind="info">The interview has taken place. NTIC will contact you about the decision.</Alert>}
      {i.status === 'scheduled' && (
        <div className="rounded-xl border border-brand/30 bg-brand-light p-4 text-sm">
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3"><dt className="text-muted">Date and time</dt><dd className="text-right font-semibold text-navy">{when(i.startsAt, i.timezone)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Duration</dt><dd className="font-medium">{i.durationMinutes} minutes</dd></div>
            {i.platform && <div className="flex justify-between gap-3"><dt className="text-muted">Where</dt><dd className="font-medium capitalize">{String(i.platform).replace(/_/g, ' ')}</dd></div>}
            {i.location && <div className="flex justify-between gap-3"><dt className="text-muted">Venue</dt><dd className="font-medium">{i.location}</dd></div>}
            {i.meetingUrl && <div className="flex justify-between gap-3"><dt className="text-muted">Meeting link</dt><dd><a href={i.meetingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">Join the meeting</a></dd></div>}
          </dl>
          {i.instructions && <p className="mt-3 text-slate-700">{i.instructions}</p>}
        </div>
      )}
    </div>
  );
}
