// src/pages/staff/Interviews.jsx
// The interview list. An interviewer sees only their own interviews; staff see their campuses'.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInterviews } from '../../api/staff.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Alert, Select } from '../../components/ui.jsx';
import { INTERVIEW_STATUS_LABEL, PLATFORM_LABEL, SCORECARD_LABEL, interviewTone, whenLagos } from '../../components/interviewShared.js';

const PAGE = 25;

export default function Interviews() {
  const { user } = useAuth();
  const mine = user.role === 'interviewer';
  const [status, setStatus] = useState('scheduled');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setData(null); setError('');
    listInterviews({ status: status || undefined, limit: PAGE, offset }).then(setData).catch((e) => { setError(e.message); setData({ total: 0, items: [] }); });
  }, [status, offset]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-navy">{mine ? 'My interviews' : 'Interviews'}</h1>
          <p className="text-sm text-muted">{mine ? 'Interviews assigned to you.' : 'Interviews for your campuses. Schedule one from the application page.'}</p></div>
        <div className="w-48"><Select label="Show" placeholder="All" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }}
          options={Object.entries(INTERVIEW_STATUS_LABEL).filter(([k]) => k !== 'not_scheduled').map(([value, label]) => ({ value, label }))} /></div>
      </div>
      <Alert>{error}</Alert>
      {!data ? <p className="text-muted">Loading…</p> : data.items.length === 0 ? <p className="rounded-xl bg-white p-6 text-center text-muted ring-1 ring-slate-200">No interviews to show.</p> : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted"><tr><th className="p-3">When</th><th className="p-3">Candidate</th><th className="p-3">Campus</th>{!mine && <th className="p-3">Interviewer</th>}<th className="p-3">How</th><th className="p-3">Status</th><th className="p-3">Scorecard</th></tr></thead>
            <tbody>{data.items.map((i) => (
              <tr key={i.id} className="border-t border-slate-100 hover:bg-surface/60">
                <td className="p-3 whitespace-nowrap"><Link className="font-semibold text-brand hover:underline" to={`/staff/interviews/${i.applicationId}`}>{whenLagos(i.startsAt)}</Link></td>
                <td className="p-3">{i.candidate}<span className="block text-xs text-muted">{i.applicationNumber}</span></td>
                <td className="p-3">{i.campusName}</td>
                {!mine && <td className="p-3">{i.interviewer?.name}</td>}
                <td className="p-3">{PLATFORM_LABEL[i.platform] || i.platform}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${interviewTone(i.status)}`}>{INTERVIEW_STATUS_LABEL[i.status] || i.status}</span></td>
                <td className="p-3">{SCORECARD_LABEL[i.scorecardStatus] || i.scorecardStatus}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="font-semibold text-brand disabled:text-slate-400">← Previous</button>
          <span className="text-muted">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)} className="font-semibold text-brand disabled:text-slate-400">Next →</button>
        </div>
      )}
    </div>
  );
}
