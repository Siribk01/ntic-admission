// src/components/StaffLayout.jsx
// The staff frame: a left menu that shows only what your role may use.
import { useAuth } from '../auth/AuthContext.jsx';
import { CAN_ADMIN, CAN_HANDLE_PAYMENTS, CAN_READ_APPLICATIONS, CAN_SEE_INTERVIEWS, CAN_SEE_REPORTS, ROLE_LABEL } from '../auth/roles.js';
import Shell from './Shell.jsx';

export default function StaffLayout() {
  const { user } = useAuth();
  const role = user?.role;
  const items = [
    CAN_READ_APPLICATIONS.includes(role) && { to: '/staff', label: 'Applications', icon: 'list', end: true },
    CAN_READ_APPLICATIONS.includes(role) && { to: '/staff/exams', label: 'Exams', icon: 'book' },
    CAN_SEE_INTERVIEWS.includes(role) && { to: '/staff/interviews', label: 'Interviews', icon: 'chat' },
    CAN_HANDLE_PAYMENTS.includes(role) && { to: '/staff/payments', label: 'Payments', icon: 'card' },
    CAN_SEE_REPORTS.includes(role) && { to: '/staff/reports', label: 'Reports', icon: 'chart' },
    CAN_ADMIN.includes(role) && { to: '/staff/setup', label: 'Setup', icon: 'gear' },
  ].filter(Boolean);
  return <Shell title="NTIC Staff" subtitle="Admissions office" home="/staff" items={items} roleLabel={ROLE_LABEL[role] || role} />;
}
