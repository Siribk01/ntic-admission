// src/pages/staff/Scorecard.jsx
// One interview and its scorecard. The assigned interviewer marks attendance and writes the scorecard;
// an administrator can reopen a submitted one; everyone else reads it.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getInterview, getScorecard, interviewOutcome, reopenScorecard, saveScorecard, submitScorecard } from '../../api/staff.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Button, Field, Select } from '../../components/ui.jsx';
import { INTERVIEW_STATUS_LABEL, PLATFORM_LABEL, RECOMMENDATION_LABEL, SCORECARD_LABEL, interviewTone, whenLagos } from '../../components/interviewShared.js';

function ScoreForm({ applicationId, card, onChanged }) {
  const existing = new Map((card.scores || []).map((s) => [s.criterion, s]));
  const [scores, setScores] = useState(() => Object.fromEntries(card.criteria.map((c) => [c.key, { score: existing.get(c.key)?.score ?? '', comment: existing.get(c.key)?.comment || '' }])));
  const [recommendation, setRecommendation] = useState(card.recommendation || '');
  const [notes, setNotes] = useState(card.notes || '');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState('');
  const setLine = (key, field) => (e) => setScores((s) => ({ ...s, [key]: { ...s[key], [field]: e.target.value } }));

  const body = () => ({
    scores: card.criteria.filter((c) => scores[c.key].score !== '').map((c) => ({
      criterion: c.key, score: Number(scores[c.key].score), ...(scores[c.key].comment.trim() ? { comment: scores[c.key].comment.trim() } : {}),
    })),
    ...(recommendation ? { recommendation } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
  });
  const fail = (err) => {
    // Field errors from the server look like "scores.2.score"; turn them into one message per criterion
    const out = {};
    Object.entries(err.fieldErrors || {}).forEach(([k, v]) => { const m = k.match(/^scores\.(\d+)\./); out[m ? `row${body().scores[Number(m[1])]?.criterion}` : k] = v; });
    setErrors(out); setError(Object.keys(out).length ? 'Please correct the highlighted fields.' : err.message);
  };

  async function save(thenSubmit) {
    setBusy(thenSubmit ? 'submit' : 'save'); setError(''); setErrors({}); setInfo('');
    try {
      await saveScorecard(applicationId, body());
      if (thenSubmit) await submitScorecard(applicationId);
      else setInfo('Draft saved.');
      await onChanged();
    } catch (err) { fail(err); } finally { setBusy(''); }
  }

  const total = card.criteria.reduce((a, c) => a + (Number(scores[c.key].score) || 0), 0);
  const max = card.criteria.reduce((a, c) => a + c.maxScore, 0);
  return (
    <div className="space-y-4">
      <Alert>{error}</Alert><Alert kind="success">{info}</Alert>
      {card.criteria.map((c) => (
        <div key={c.key} className="rounded-lg bg-surface p-4">
          <div className="mb-2"><div className="font-semibold">{c.label} <span className="text-xs font-normal text-muted">(out of {c.maxScore})</span></div>{c.description && <div className="text-xs text-muted">{c.description}</div>}</div>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field label="Score" type="number" min="0" max={c.maxScore} value={scores[c.key].score} onChange={setLine(c.key, 'score')} error={errors[`row${c.key}`]} />
            <Field label="Comment (optional)" value={scores[c.key].comment} onChange={setLine(c.key, 'comment')} />
          </div>
        </div>
      ))}
      <p className="text-sm text-muted">Total so far: <strong className="text-ink">{total} / {max}</strong></p>
      <Select label="Your recommendation" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} error={errors.recommendation} placeholder="Choose…"
        options={Object.entries(RECOMMENDATION_LABEL).map(([value, label]) => ({ value, label }))} />
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sc-notes">Notes</label>
        <textarea id="sc-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40" />
        {errors.notes && <p className="mt-1 text-xs text-red-600">{errors.notes}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy === 'save'} disabled={Boolean(busy)} onClick={() => save(false)}>Save draft</Button>
        <Button loading={busy === 'submit'} disabled={Boolean(busy)} onClick={() => save(true)}>Submit scorecard</Button>
      </div>
      <p className="text-xs text-muted">After you submit, only an administrator can reopen the scorecard for a correction.</p>
    </div>
  );
}

function ScoreView({ card }) {
  return (
    <div className="space-y-3 text-sm">
      <table className="w-full text-left"><thead className="text-xs uppercase text-muted"><tr><th className="py-1">Criterion</th><th className="py-1">Score</th><th className="py-1">Comment</th></tr></thead>
        <tbody>{card.scores.map((s) => <tr key={s.criterion} className="border-t border-slate-100"><td className="py-1.5">{s.label}</td><td className="py-1.5 whitespace-nowrap">{s.score} / {s.maxScore}</td><td className="py-1.5 text-muted">{s.comment}</td></tr>)}</tbody></table>
      {card.totals && <p><strong>Total: {card.totals.score} / {card.totals.maxScore}</strong>{card.totals.percentage != null && ` (${card.totals.percentage}%)`}</p>}
      {card.recommendation && <p>Recommendation: <strong>{RECOMMENDATION_LABEL[card.recommendation]}</strong></p>}
      {card.notes && <p className="whitespace-pre-wrap rounded-lg bg-surface p-3">{card.notes}</p>}
      <p className="text-xs text-muted">{card.status === 'submitted' ? `Submitted${card.submittedAt ? ` ${whenLagos(card.submittedAt)}` : ''}` : 'Draft'}{card.writtenBy ? ` · ${card.writtenBy}` : ''}</p>
    </div>
  );
}

export default function Scorecard() {
  const { applicationId } = useParams();
  const { user } = useAuth();
  const isInterviewer = user.role === 'interviewer';
  const isAdmin = user.role === 'central_admin';
  const [iv, setIv] = useState(null);
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const i = await getInterview(applicationId);
      setIv(i);
      setCard(i.status === 'not_scheduled' || i.status === 'cancelled' ? null : await getScorecard(applicationId).catch(() => null));
    } catch (e) { setError(e.message); }
  }, [applicationId]);
  useEffect(() => { load(); }, [load]);

  async function act(fn) { setBusy(true); setError(''); try { await fn(); setReopening(false); setReason(''); await load(); } catch (e) { setError(e.fieldErrors?.reason || e.message); } finally { setBusy(false); } }

  if (!iv) return error ? <Alert>{error}</Alert> : <p className="text-muted">Loading…</p>;
  const started = iv.startsAt && new Date(iv.startsAt) <= new Date();
  const canWrite = isInterviewer && iv.status === 'completed' && card && card.status !== 'submitted' && card.criteria;

  return (
    <div className="space-y-4">
      <Link to="/staff/interviews" className="text-sm text-brand hover:underline">← Interviews</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy">{iv.candidate || 'Interview'}</h1><p className="text-muted">{iv.applicationNumber}{iv.campusName ? ` · ${iv.campusName}` : ''}{iv.categoryName ? ` · ${iv.categoryName}` : ''}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${interviewTone(iv.status)}`}>{INTERVIEW_STATUS_LABEL[iv.status] || iv.status}</span>
      </div>
      <Alert>{error}</Alert>

      <section className="space-y-2 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-bold text-navy">Details</h2>
        {iv.status === 'not_scheduled' ? <p className="text-sm text-muted">No interview has been scheduled.</p> : (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted">When: </dt><dd className="inline font-medium">{whenLagos(iv.startsAt)} ({iv.durationMinutes} min)</dd></div>
            {!isInterviewer && <div><dt className="inline text-muted">Interviewer: </dt><dd className="inline font-medium">{iv.interviewer?.name}</dd></div>}
            <div><dt className="inline text-muted">How: </dt><dd className="inline font-medium">{PLATFORM_LABEL[iv.platform] || iv.platform}</dd></div>
            {iv.meetingUrl && <div><dt className="inline text-muted">Link: </dt><dd className="inline"><a href={iv.meetingUrl} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Open meeting</a></dd></div>}
            {iv.location && <div><dt className="inline text-muted">Where: </dt><dd className="inline font-medium">{iv.location}</dd></div>}
            {iv.instructions && <div className="sm:col-span-2"><dt className="inline text-muted">Instructions: </dt><dd className="inline">{iv.instructions}</dd></div>}
          </dl>
        )}
        {iv.status === 'scheduled' && started && (isInterviewer || ['central_admin', 'campus_officer'].includes(user.role)) && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-sm text-muted">Did the candidate attend?</span>
            <Button loading={busy} onClick={() => act(() => interviewOutcome(applicationId, true))}>Yes, attended</Button>
            <Button variant="secondary" loading={busy} onClick={() => act(() => interviewOutcome(applicationId, false))}>No, absent</Button>
          </div>
        )}
        {iv.status === 'scheduled' && !started && <p className="text-xs text-muted">You can mark attendance and write the scorecard once the interview has started.</p>}
      </section>

      {card && (
        <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between"><h2 className="font-bold text-navy">Scorecard</h2><span className="text-xs font-semibold text-muted">{SCORECARD_LABEL[card.status] || card.status}</span></div>
          {canWrite ? <ScoreForm applicationId={applicationId} card={card} onChanged={load} />
            : card.status === 'not_started' ? <p className="text-sm text-muted">{iv.status === 'completed' ? 'The interviewer has not started the scorecard.' : 'A scorecard can be written after the interview is marked as completed.'}</p>
            : card.status === 'not_submitted' ? <p className="text-sm text-muted">The scorecard has not been submitted yet.</p>
            : <ScoreView card={card} />}

          {isAdmin && card.status === 'submitted' && !reopening && <Button variant="secondary" onClick={() => setReopening(true)}>Reopen for correction</Button>}
          {isAdmin && reopening && (
            <div className="space-y-3"><Field label="Reason for reopening" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2"><Button loading={busy} disabled={reason.trim().length < 3} onClick={() => act(() => reopenScorecard(applicationId, reason.trim()))}>Reopen</Button><Button variant="secondary" onClick={() => setReopening(false)}>Close</Button></div></div>
          )}
          {isAdmin && card.history?.length > 0 && (
            <details className="text-sm"><summary className="cursor-pointer text-muted">Scorecard history</summary>
              <ol className="mt-2 space-y-1 text-xs">{card.history.map((h, i) => <li key={i}><span className="mr-2 text-muted">{whenLagos(h.at)}</span><span className="font-medium">{h.action}</span><span className="text-muted"> · {h.by}{h.reason ? ` · ${h.reason}` : ''}</span></li>)}</ol></details>
          )}
        </section>
      )}
    </div>
  );
}
