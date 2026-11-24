import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, Button, Card, Field } from '../components/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    // Checked here first so a simple typo does not cost a round trip to the server
    if (form.password !== form.confirm) { setErrors({ confirm: 'The two passwords do not match' }); return; }
    setErrors({}); setBusy(true);
    try {
      const { confirm, ...fields } = form;
      await register({ ...fields, email: fields.email.trim() });
      navigate('/login', { replace: true, state: { notice: 'Account created. Sign in, then confirm your email address using the link we send you.' } });
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message);
    } finally { setBusy(false); }
  }

  return (
    <Card title="Create a parent account">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" value={form.firstName} onChange={change} error={errors.firstName} autoComplete="given-name" required />
          <Field label="Last name" name="lastName" value={form.lastName} onChange={change} error={errors.lastName} autoComplete="family-name" required />
        </div>
        <Field label="Email address" name="email" type="email" value={form.email} onChange={change} error={errors.email} autoComplete="email" required />
        <Field label="Phone number" name="phone" type="tel" value={form.phone} onChange={change} error={errors.phone} autoComplete="tel" hint="For example 08012345678" />
        <Field label="Password" name="password" type="password" value={form.password} onChange={change} error={errors.password} autoComplete="new-password" required />
        <Field label="Confirm password" name="confirm" type="password" value={form.confirm} onChange={change} error={errors.confirm} autoComplete="new-password" required />
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-5 text-sm text-slate-600">Already registered? <Link to="/login" className="text-brand hover:underline">Sign in</Link></p>
    </Card>
  );
}
