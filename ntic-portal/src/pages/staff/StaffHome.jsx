// src/pages/staff/StaffHome.jsx
// /staff : the applications list for those who review, otherwise a short pointer to what their role can do.
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { CAN_READ_APPLICATIONS } from '../../auth/roles.js';
import Applications from './Applications.jsx';

export default function StaffHome() {
  const { user } = useAuth();
  if (CAN_READ_APPLICATIONS.includes(user.role)) return <Applications />;
  return (
    <div className="rounded-xl bg-white p-8 text-center ring-1 ring-slate-200">
      <h1 className="text-xl font-bold text-navy">Welcome, {user.firstName || user.email}</h1>
      {user.role === 'finance_officer'
        ? <p className="mt-2 text-muted">Your work is in <Link to="/staff/payments" className="text-brand hover:underline">Payments</Link>.</p>
        : <p className="mt-2 text-muted">Your interview screens are coming in a later update.</p>}
    </div>
  );
}
