import { Route, Routes } from 'react-router-dom';
import AuthLayout from './components/AuthLayout.jsx';
import Layout from './components/Layout.jsx';
import StaffLayout from './components/StaffLayout.jsx';
import { CAN_ADMIN, CAN_HANDLE_PAYMENTS, CAN_READ_APPLICATIONS, CAN_SEE_INTERVIEWS, CAN_SEE_REPORTS } from './auth/roles.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Apply from './pages/Apply.jsx';
import Account from './pages/Account.jsx';
import ChildForm from './pages/ChildForm.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Support from './pages/Support.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import StaffApplicationDetail from './pages/staff/ApplicationDetail.jsx';
import StaffApplications from './pages/staff/Applications.jsx';
import StaffClaims from './pages/staff/Claims.jsx';
import StaffExams from './pages/staff/Exams.jsx';
import StaffRoster from './pages/staff/ExamRoster.jsx';
import StaffInterviews from './pages/staff/Interviews.jsx';
import StaffScorecard from './pages/staff/Scorecard.jsx';
import StaffReports from './pages/staff/Reports.jsx';
import StaffSetup from './pages/staff/Setup.jsx';
import StaffHome from './pages/staff/StaffHome.jsx';

export default function App() {
  return (
    <Routes>
      {/* before signing in: blue brand panel + form */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Route>
      {/* staff: menu depends on the role */}
      <Route element={<StaffLayout />}>
        <Route path="/staff" element={<ProtectedRoute roles={['central_admin', 'campus_officer', 'reviewer', 'interviewer', 'finance_officer']}><StaffHome /></ProtectedRoute>} />
        <Route path="/staff/applications/:applicationId" element={<ProtectedRoute roles={CAN_READ_APPLICATIONS}><StaffApplicationDetail /></ProtectedRoute>} />
        <Route path="/staff/exams" element={<ProtectedRoute roles={CAN_READ_APPLICATIONS}><StaffExams /></ProtectedRoute>} />
        <Route path="/staff/exams/:slotId" element={<ProtectedRoute roles={CAN_READ_APPLICATIONS}><StaffRoster /></ProtectedRoute>} />
        <Route path="/staff/setup" element={<ProtectedRoute roles={CAN_ADMIN}><StaffSetup /></ProtectedRoute>} />
        <Route path="/staff/interviews" element={<ProtectedRoute roles={CAN_SEE_INTERVIEWS}><StaffInterviews /></ProtectedRoute>} />
        <Route path="/staff/interviews/:applicationId" element={<ProtectedRoute roles={CAN_SEE_INTERVIEWS}><StaffScorecard /></ProtectedRoute>} />
        <Route path="/staff/reports" element={<ProtectedRoute roles={CAN_SEE_REPORTS}><StaffReports /></ProtectedRoute>} />
        <Route path="/staff/payments" element={<ProtectedRoute roles={CAN_HANDLE_PAYMENTS}><StaffClaims /></ProtectedRoute>} />
      </Route>
      {/* signed-in users only: white header with the logo */}
      <Route element={<Layout />}>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/children/new" element={<ProtectedRoute><ChildForm /></ProtectedRoute>} />
        <Route path="/children/:childId" element={<ProtectedRoute><ChildForm /></ProtectedRoute>} />
        <Route path="/applications/:applicationId" element={<ProtectedRoute><Apply /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/support/:requestId" element={<ProtectedRoute><Support /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="*" element={<p className="py-20 text-center text-slate-500">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
