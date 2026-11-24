// src/components/Stepper.jsx
// The application timeline. On a computer: a vertical timeline beside the form. On a phone: a slim progress bar with
// "Step 2 of 6". Each step is either done (tick), current (highlighted) or to do (number).
const Tick = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
);

export default function Stepper({ steps, current, onSelect }) {
  return (
    <>
      {/* phone */}
      <div className="md:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-navy">{steps[current].title}</span>
          <span className="text-xs text-muted">Step {current + 1} of {steps.length}</span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <button key={s.key} onClick={() => onSelect(i)} aria-label={s.title}
              className={`h-2 flex-1 rounded-full ${i === current ? 'bg-brand' : s.done ? 'bg-brand/50' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {/* computer */}
      <ol className="hidden md:block">
        {steps.map((s, i) => {
          const active = i === current;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative pb-7 last:pb-0">
              {!last && <span className={`absolute left-[15px] top-8 h-full w-0.5 ${s.done ? 'bg-brand' : 'bg-slate-200'}`} />}
              <button onClick={() => onSelect(i)} className="relative flex w-full items-start gap-3 text-left" aria-current={active ? 'step' : undefined}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-4 ring-surface
                  ${s.done ? 'bg-brand text-white' : active ? 'border-2 border-brand bg-white text-brand' : 'border-2 border-slate-300 bg-white text-slate-400'}`}>
                  {s.done ? <Tick /> : i + 1}
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${active ? 'text-navy' : 'text-slate-700'}`}>{s.title}</span>
                  <span className="block text-xs text-muted">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
