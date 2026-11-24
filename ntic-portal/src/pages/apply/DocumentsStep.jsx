// Step 4: upload the required documents. Each document saves as soon as the file is chosen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { listDocumentTypes, listDocuments, openDocument, removeDocument, uploadDocument } from '../../api/applications.js';
import { Alert, Button } from '../../components/ui.jsx';

const LABEL = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'application/pdf': 'PDF' };
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

function Row({ applicationId, type, doc, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = '';           // lets the same file be chosen again after an error
    if (!file) return;
    if (file.size > type.maxBytes) { setError(`This file is too large. The maximum is ${size(type.maxBytes)}.`); return; }
    setBusy(true); setError('');
    try { await uploadDocument(applicationId, type.code, file); await onChanged(); }
    catch (err) { setError(err.fieldErrors?.file || err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Remove the ${type.name.toLowerCase()}?`)) return;
    setBusy(true); setError('');
    try { await removeDocument(applicationId, type.code); await onChanged(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-navy">
            {type.name} {type.required ? <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Required</span> : <span className="ml-1 text-xs font-normal text-muted">Optional</span>}
          </div>
          <div className="text-xs text-muted">{type.allowedMimes.map((m) => LABEL[m]).join(', ')} · up to {size(type.maxBytes)}</div>
          {doc && <div className="mt-2 text-sm text-green-700">✓ {doc.originalName} ({size(doc.sizeBytes)})</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {doc && <Button variant="secondary" onClick={() => openDocument(applicationId, type.code).catch((e) => setError(e.message))}>View</Button>}
          <Button variant={doc ? 'secondary' : 'primary'} loading={busy} onClick={() => input.current.click()}>{doc ? 'Replace' : 'Upload'}</Button>
          {doc && <button onClick={remove} disabled={busy} className="text-sm text-red-600 hover:underline">Remove</button>}
          <input ref={input} type="file" className="hidden" accept={type.allowedMimes.join(',')} onChange={pick} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export default function DocumentsStep({ applicationId, onChanged }) {
  const [types, setTypes] = useState(null);
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [t, d] = await Promise.all([listDocumentTypes(), listDocuments(applicationId)]);
    setTypes(t); setDocs(d);
  }, [applicationId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function changed() { await load(); onChanged(); }

  if (error) return <Alert>{error}</Alert>;
  if (!types) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Take a clear photo or scan of each document. Make sure every page is readable.</p>
      <ul className="space-y-3">
        {types.map((t) => <Row key={t.code} applicationId={applicationId} type={t} doc={docs.find((d) => d.typeCode === t.code)} onChanged={changed} />)}
      </ul>
    </div>
  );
}
