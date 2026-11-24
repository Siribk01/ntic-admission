import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth.js';
import { Alert, Card } from '../components/ui.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState(token ? 'working' : 'bad');
  const [message, setMessage] = useState('');
  // React in development runs effects twice. A verification token works only once, so we guard the call.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyEmail(token).then(() => setState('ok')).catch((err) => { setMessage(err.message); setState('bad'); });
  }, [token]);

  return (
    <Card title="Confirm your email">
      {state === 'working' && <p className="text-slate-600">Confirming your email address…</p>}
      {state === 'ok' && <Alert kind="success">Your email address is confirmed. You can now submit applications.</Alert>}
      {state === 'bad' && <Alert>{message || 'This link is not valid or has expired. Sign in and ask for a new confirmation email.'}</Alert>}
      <p className="mt-5 text-sm"><Link to="/" className="text-brand hover:underline">Continue to the portal</Link></p>
    </Card>
  );
}
