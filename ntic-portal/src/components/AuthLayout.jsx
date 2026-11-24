// src/components/AuthLayout.jsx
// The frame around every page a visitor sees before signing in: a blue panel with the school logo, and the form beside it.
// On a phone the panel shrinks to a slim blue bar so the form is the first thing you see.
import { Outlet } from 'react-router-dom';
import logoWhite from '../assets/logo-white.png';
import logoMark from '../assets/logo-mark.png';

export default function AuthLayout() {
  return (
    <div className="grid min-h-screen md:grid-cols-[2fr_3fr]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-navy to-navy-dark p-10 text-white md:flex">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-white/5" />
        <img src={logoWhite} alt="NTIC logo" className="relative h-64 w-auto" />
        <h2 className="relative mt-8 text-center text-2xl font-bold leading-snug">Nigerian Tulip<br />International Colleges</h2>
        <p className="relative mt-3 rounded-full bg-gold px-4 py-1 text-center text-xs font-semibold uppercase tracking-wide text-navy-dark">Admissions Portal</p>
      </aside>

      <div className="flex flex-col">
        {/* Brand bar (phone) */}
        <div className="flex items-center gap-3 bg-navy px-4 py-3 text-white md:hidden">
          <span className="rounded-lg bg-white p-1"><img src={logoMark} alt="NTIC logo" className="h-9 w-auto" /></span>
          <div className="leading-tight">
            <div className="font-bold">NTIC Admissions</div>
            <div className="text-xs text-white/80">Nigerian Tulip International Colleges</div>
          </div>
        </div>
        <main className="flex flex-1 items-center justify-center px-4 py-10"><Outlet /></main>
        <footer className="py-5 text-center text-xs text-muted">© Nigerian Tulip International Colleges</footer>
      </div>
    </div>
  );
}
