// src/pages/Account.jsx
// Your account: email and change password.
import { useState } from 'react';
import { changePassword } from '../api/auth.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, Button, Field } from '../components/ui.jsx';

export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(''); setErrors({}); setDone(false);
    if (form.newPassword !== form.confirm) { setErrors({ confirm: 'The two passwords do not match' }); return; }
    setBusy(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirm: '' }); setDone(true);
    } catch (err) { setErrors(err.fieldErrors || {}); setError(Object.keys(err.fieldErrors || {}).length ? 'Please correct the highlighted fields.' : err.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold text-navy">My account</h1>
      <div className="rounded-2xl bg-white p-6 text-sm shadow-sm ring-1 ring-slate-200">
        <div className="flex justify-between"><span className="text-muted">Email</span><span className="font-medium">{user?.email}</span></div>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" noValidate>
        <h2 className="text-lg font-bold text-navy">Change password</h2>
        <Alert>{error}</Alert>
        {done && <Alert kind="success">Your password has been changed.</Alert>}
        <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" value={form.currentPassword} onChange={change} error={errors.currentPassword} required />
        <Field label="New password" name="newPassword" type="password" autoComplete="new-password" value={form.newPassword} onChange={change} error={errors.newPassword} required />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={change} error={errors.confirm} required />
        <Button type="submit" loading={busy}>Change password</Button>
      </form>
    </div>
  );
}
