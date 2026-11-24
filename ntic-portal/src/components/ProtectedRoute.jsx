// src/components/ProtectedRoute.jsx
// Wrap a page with this and only a signed-in user may see it. Everyone else goes to /login.
//   <ProtectedRoute>                        any signed-in user
//   <ProtectedRoute roles={['finance_officer']}>   only those roles; anyone else is sent to their own home page
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { homeFor } from '../auth/roles.js';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="py-20 text-center text-slate-500">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}
