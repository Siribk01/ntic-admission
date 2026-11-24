import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { homeFor, isStaff } from '../auth/roles.js';
import { emailStatus, resendVerification } from '../api/auth.js';
import { listChildren } from '../api/applicants.js';
import { createApplication, listApplications } from '../api/applications.js';
import { useOptions } from '../hooks/useOptions.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, Button } from '../components/ui.jsx';

// Shown when the email is not confirmed yet: submitting an application needs it
function EmailBanner() {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { emailStatus().then(setStatus).catch(() => {}); }, []);
  if (!status || status.verified) return null;

  async function resend() {
    setBusy(true); setMsg('');
    try { await resendVerification(); setMsg('A new confirmation email has been sent.'); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mb-6 space-y-3">
      <Alert kind="info">Please confirm your email address ({status.email}) using the link we sent you. You need this before you can submit an application.</Alert>
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={resend} loading={busy}>Send the email again</Button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

const age = (dob) => {
  const d = new Date(`${dob}T00:00:00`); const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1;
  return a;
};

const STATUS_TEXT = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', information_required: 'More information needed', decision_pending: 'Awaiting decision',
  offered: 'Offer made', waitlisted: 'Waiting list', rejected: 'Not successful', withdrawn: 'Withdrawn', closed: 'Closed',
};

function Children() {
  const navigate = useNavigate();
  const { options } = useOptions();
  const [children, setChildren] = useState(null);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState('');

  useEffect(() => {
    Promise.all([listChildren(), listApplications()])
      .then(([c, a]) => { setChildren(Array.isArray(c) ? c : c.items || []); setApplications(Array.isArray(a) ? a : a.items || []); })
      .catch((e) => setError(e.message));
  }, []);

  const cycle = options?.cycles?.[0]; // the open admission session (if several are open, the newest)

  async function start(childId) {
    setStarting(childId); setError('');
    try { const app = await createApplication(childId, cycle.id); navigate(`/applications/${app.id}`); }
    catch (e) { setError(e.message); setStarting(''); }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy">My children</h2>
        <Link to="/children/new" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">+ Add a child</Link>
      </div>
      <Alert>{error}</Alert>
      {options && !cycle && <div className="mb-4"><Alert kind="info">Admissions are not open at the moment. You can add your children now and apply when the next session opens.</Alert></div>}
      {children === null && !error && <p className="text-muted">Loading…</p>}
      {children && children.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-muted">You have not added a child yet.</p>
          <Link to="/children/new" className="mt-3 inline-block font-semibold text-brand hover:underline">Add your first child</Link>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {(children || []).map((c) => {
          const app = applications.find((x) => x.applicantId === c.id);
          return (
            <li key={c.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="font-semibold text-navy">{c.firstName} {c.middleName || ''} {c.surname}</div>
              <div className="mt-1 text-sm text-muted">{c.gender === 'female' ? 'Girl' : 'Boy'} · {age(c.dateOfBirth)} years old</div>
              {app && (
                <div className="mt-2 text-sm">
                  <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-semibold text-navy">{STATUS_TEXT[app.status] || app.status}</span>
                  {app.applicationNumber && <span className="ml-2 text-xs text-muted">{app.applicationNumber}</span>}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {app ? (
                  <Link to={`/applications/${app.id}`} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">{app.status === 'draft' ? 'Continue application' : 'View application'}</Link>
                ) : (
                  <Button onClick={() => start(c.id)} loading={starting === c.id} disabled={!cycle}>Start application</Button>
                )}
                {(!app || app.status === 'draft') && <Link to={`/children/${c.id}`} className="text-sm text-brand hover:underline">Edit details</Link>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ParentHome() {
  const { user } = useAuth();
  const isParent = !user.role || user.role === 'applicant';
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Welcome{user.firstName ? `, ${user.firstName}` : ''}</h1>
      <p className="mb-6 text-muted">Apply to Nigerian Tulip International Colleges and follow your application here.</p>
      {isParent ? (
        <>
          <EmailBanner />
          <Children />
        </>
      ) : (
        <Alert kind="info">You are signed in as staff ({user.role}). The staff dashboard is built after the parent portal.</Alert>
      )}
    </div>
  );
}

// Staff who land on "/" are sent to the staff screens
export default function Home() {
  const { user } = useAuth();
  return isStaff(user) ? <Navigate to={homeFor(user)} replace /> : <ParentHome />;
}
