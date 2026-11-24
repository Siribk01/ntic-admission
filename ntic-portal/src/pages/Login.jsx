import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, Button, Card, Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const notice = location.state?.notice; // e.g. "Account created" after registering

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <Card title="Sign in">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert kind="success">{notice}</Alert>
        <Alert>{error}</Alert>
        <Field label="Email address" name="email" type="email" autoComplete="email" value={form.email} onChange={change} required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={change} required />
        <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-brand hover:underline">Forgot password?</Link>
        <Link to="/register" className="text-brand hover:underline">Create an account</Link>
      </div>
    </Card>
  );
}
