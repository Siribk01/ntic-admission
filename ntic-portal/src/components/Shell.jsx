// src/components/Shell.jsx
// The frame for signed-in pages: a left menu with icons, a top bar with who you are, and the page on the right.
// On a phone the menu slides in from the left. Used by the parent portal and the staff portal.
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logoMark from '../assets/logo-mark.png';
import { Icon } from './dash.jsx';

export default function Shell({ title, subtitle, home, items, roleLabel, maxWidth = 'max-w-6xl' }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const link = ({ isActive }) => `flex items-center gap-3 border-l-4 px-5 py-3 text-sm font-medium ${isActive ? 'border-brand bg-brand-light text-brand' : 'border-transparent text-slate-700 hover:bg-slate-50'}`;
  const nav = (
    <nav className="py-2" onClick={() => setOpen(false)}>
      {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}><Icon name={i.icon} />{i.label}</NavLink>)}
    </nav>
  );
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <Link to={home} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <img src={logoMark} alt="NTIC logo" className="h-10 w-auto" />
          <span className="leading-tight"><span className="block font-bold text-navy">{title}</span><span className="block text-xs text-muted">{subtitle}</span></span>
        </Link>
        {nav}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><span className="font-bold text-navy">{title}</span><button onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="cross" /></button></div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b-4 border-gold bg-white px-4 py-2.5 shadow-sm">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <span className="font-bold text-navy lg:hidden">{title}</span>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-3 text-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand"><Icon name="user" /></span>
            <span className="hidden text-right leading-tight sm:block"><span className="block font-medium">{user?.firstName || user?.email}</span><span className="block text-xs text-muted">{roleLabel}</span></span>
            <button onClick={() => { logout(); navigate('/login'); }} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
          </div>
        </header>
        <main className={`mx-auto w-full flex-1 px-4 py-6 ${maxWidth}`}><Outlet /></main>
        <footer className="py-4 text-center text-xs text-muted">© Nigerian Tulip International Colleges</footer>
      </div>
    </div>
  );
}
