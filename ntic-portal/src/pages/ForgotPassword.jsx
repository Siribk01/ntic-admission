import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth.js';
import { Alert, Button, Card, Field } from '../components/ui.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const d = await forgotPassword(email.trim());
      // The backend gives the same answer whether or not the email has an account, so we show it as it is
      setDone(d?.message || 'If an account exists for that email address, we have sent instructions to reset the password.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Card title="Reset your password">
      {done ? <Alert kind="success">{done}</Alert> : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Alert>{error}</Alert>
          <Field label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
      <p className="mt-5 text-sm"><Link to="/login" className="text-brand hover:underline">Back to sign in</Link></p>
    </Card>
  );
}
