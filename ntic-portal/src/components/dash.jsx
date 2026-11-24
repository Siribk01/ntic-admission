// src/components/dash.jsx
// Building blocks for the dashboard look: icons, a welcome banner, summary cards and the progress strip.
// Plain words and colour carry the meaning: green = done, amber = waiting, red = you need to do something, grey = not yet.

const PATHS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z',
  users: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  list: 'M4 6h16M4 12h16M4 18h10',
  card: 'M3 7h18v10H3zM3 11h18M7 15h3',
  book: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11',
  chat: 'M4 5h16v11H9l-5 4V5z',
  flag: 'M5 21V4m0 0h12l-2 4 2 4H5',
  doc: 'M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6',
  chart: 'M4 20V10m6 10V4m6 16v-7m5 7H3',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  help: 'M9.5 9a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 4M12 17h.01M12 3a9 9 0 100 18 9 9 0 000-18z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0',
  check: 'M5 13l4 4L19 7',
  cross: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  calendar: 'M4 7h16v13H4zM4 11h16M8 3v4m8-4v4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 20h14',
  alert: 'M12 4l9 16H3L12 4zM12 10v4m0 3h.01',
};
export function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] || PATHS.doc} />
    </svg>
  );
}

// tone: done | wait | todo | idle
const TONE = {
  done: { text: 'text-green-700', chip: 'bg-green-100 text-green-700', mark: 'check' },
  wait: { text: 'text-amber-700', chip: 'bg-amber-100 text-amber-700', mark: 'clock' },
  todo: { text: 'text-red-600', chip: 'bg-red-100 text-red-600', mark: 'alert' },
  idle: { text: 'text-slate-500', chip: 'bg-slate-100 text-slate-500', mark: 'clock' },
};

export function Banner({ title, subtitle, right }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div><h1 className="text-2xl font-bold text-navy sm:text-3xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}</div>
      {right}
    </div>
  );
}

export function InfoCard({ label, children, tone, className = '' }) {
  const bar = tone ? { done: 'border-l-green-500', wait: 'border-l-amber-400', todo: 'border-l-red-500', idle: 'border-l-slate-300' }[tone] : 'border-l-transparent';
  return (
    <div className={`rounded-xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-slate-200 ${bar} ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

// One step in the overview strip. `to` scrolls to the panel with that id.
export function ProgressStrip({ steps }) {
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-100 px-5 pt-3"><span className="inline-block border-b-2 border-brand pb-2 text-sm font-medium text-brand">Overview</span></div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 xl:divide-x xl:divide-slate-100">
        {steps.map((s) => {
          const t = TONE[s.tone] || TONE.idle;
          const body = (
            <>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${t.chip}`}><Icon name={s.icon} className="h-6 w-6" /></span>
              <span className="min-w-0 leading-tight">
                <span className="block text-xs text-muted">{s.label}</span>
                <span className={`mt-0.5 flex items-start gap-1 text-sm font-semibold ${t.text}`}><Icon name={t.mark} className="mt-0.5 h-4 w-4 shrink-0" /><span>{s.value}</span></span>
              </span>
            </>
          );
          return (
            <li key={s.label} className="border-b border-slate-100 xl:border-b-0">
              {s.to
                ? <a href={`#${s.to}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface">{body}</a>
                : <div className="flex items-center gap-3 px-5 py-4">{body}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// A heading for a block lower on the page that the strip can scroll to
export function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      {title && <h2 className="mb-4 text-lg font-bold text-navy">{title}</h2>}
      {children}
    </section>
  );
}
