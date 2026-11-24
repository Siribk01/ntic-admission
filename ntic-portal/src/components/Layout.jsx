// src/components/Layout.jsx
// The parent portal frame: a left menu (My children, Help, My account) around every parent page.
import Shell from './Shell.jsx';

const ITEMS = [
  { to: '/', label: 'My children', icon: 'home', end: true },
  { to: '/support', label: 'Help and messages', icon: 'chat' },
  { to: '/account', label: 'My account', icon: 'user' },
];

export default function Layout() {
  return <Shell title="NTIC Admissions" subtitle="Parent portal" home="/" items={ITEMS} roleLabel="Parent" maxWidth="max-w-5xl" />;
}
