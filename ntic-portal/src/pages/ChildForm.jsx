// src/pages/ChildForm.jsx
// "Add a child" (/children/new) and "edit a child" (/children/:id). After adding, the parent lands on the edit page,
// where the parents/guardians boxes appear.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getChild } from '../api/applicants.js';
import ChildProfileForm from '../components/ChildProfileForm.jsx';
import GuardianSection from '../components/GuardianSection.jsx';
import { Alert } from '../components/ui.jsx';

export default function ChildForm() {
  const { childId } = useParams();
  const isNew = !childId;
  const navigate = useNavigate();
  const [child, setChild] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');

  const load = useCallback(async () => setChild(await getChild(childId)), [childId]);
  useEffect(() => {
    if (isNew) return;
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [isNew, load]);

  if (loading) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (!isNew && !child) return <Alert>{error || 'Child not found.'}</Alert>;

  return (
    <div className="space-y-10">
      <div>
        <Link to="/" className="text-sm text-brand hover:underline">← Back to my children</Link>
        <h1 className="mt-2 text-2xl font-bold text-navy">{isNew ? 'Add a child' : `${child.firstName} ${child.surname}`}</h1>
        <p className="text-sm text-muted">{isNew ? 'Enter the details exactly as they appear on the birth certificate.' : 'Child details'}</p>
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-7">
        <ChildProfileForm
          child={child}
          submitLabel={isNew ? 'Save and continue' : 'Save changes'}
          onSaved={(c) => (isNew ? navigate(`/children/${c.id}`, { replace: true }) : setChild((old) => ({ ...old, ...c })))}
          onCancel={() => navigate('/')}
        />
      </div>
      {!isNew && <GuardianSection applicantId={childId} guardians={child.guardians} onChanged={() => load().catch(() => {})} />}
    </div>
  );
}
