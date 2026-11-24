// src/components/ui.jsx
// The small building blocks every page uses, so buttons, inputs and messages look the same everywhere.
import { useId } from 'react';

export function Button({ children, loading, variant = 'primary', className = '', ...props }) {
  const look = variant === 'primary'
    ? 'bg-brand text-white hover:bg-brand-dark'
    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${look} ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

// A label, an input and the error for that field, tied together for screen readers
export function Field({ label, error, hint, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40 ${error ? 'border-red-500' : 'border-slate-300'}`}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Same look as Field, but a drop-down. options = [{ value, label }]
export function Select({ label, error, options, placeholder = 'Choose…', ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <select
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40 ${error ? 'border-red-500' : 'border-slate-300'}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const look = { error: 'bg-red-50 text-red-800 border-red-200', success: 'bg-green-50 text-green-800 border-green-200', info: 'bg-brand-light text-navy border-brand/20' }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${look}`}>{children}</div>;
}

export function Card({ title, children }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-lg shadow-brand/5 ring-1 ring-slate-200 sm:p-8">
      {title && <h1 className="mb-6 text-2xl font-bold text-navy">{title}</h1>}
      {children}
    </div>
  );
}
