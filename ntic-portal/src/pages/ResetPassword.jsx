import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth.js';
import { Alert, Button, Card, Field } from '../components/ui.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token) {
    return <Card title="Reset your password"><Alert>This link is not complete. Open the link from your email again, or <Link to="/forgot-password" className="underline">ask for a new one</Link>.</Alert></Card>;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setErrors({ confirm: 'The two passwords do not match' }); return; }
    setErrors({}); setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/login', { replace: true, state: { notice: 'Your password has been changed. Sign in with the new one.' } });
    } catch (err) {
      setErrors(err.fieldErrors || {});
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <Card title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert>{error}</Alert>
        <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="new-password" required />
        <Field label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" required />
        <Button type="submit" loading={busy} className="w-full">Change password</Button>
      </form>
    </Card>
  );
}
