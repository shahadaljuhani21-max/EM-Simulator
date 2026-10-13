import { useState } from 'react';
import { Database, FileJson, KeyRound, Pencil, RefreshCcw, Save, Send, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { caseStudioRequest, type ApiCase } from '@/lib/case-library';

type AdminCaseRow = {
  caseId: string;
  status: ApiCase['status'];
  level: ApiCase['level'];
  lecture: string;
  internalTitle: string;
  updatedAt: string;
  caseData: ApiCase;
};

export function CaseStudioPage() {
  const [adminKey, setAdminKey] = useState('');
  const [rows, setRows] = useState<AdminCaseRow[]>([]);
  const [editor, setEditor] = useState('');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [message, setMessage] = useState('Enter the administrator key, then load the case library.');
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try { await task(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const loadCases = () => run(async () => {
    const payload = await caseStudioRequest('', adminKey) as { cases: AdminCaseRow[] };
    setRows(payload.cases);
    setMessage(`${payload.cases.length} case${payload.cases.length === 1 ? '' : 's'} loaded.`);
  });

  const openCase = (row: AdminCaseRow) => {
    setActiveCaseId(row.caseId);
    setEditor(JSON.stringify(row.caseData, null, 2));
    setMessage(`Editing ${row.caseId}. Changes are saved only when you press Save.`);
  };

  const loadJsonFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const parsed = await Promise.all(Array.from(files).map(async (file) => JSON.parse(await file.text()) as ApiCase | ApiCase[]));
      const cases = parsed.flatMap((item) => Array.isArray(item) ? item : [item]);
      setEditor(JSON.stringify(cases.length === 1 ? cases[0] : cases, null, 2));
      setActiveCaseId(cases.length === 1 ? cases[0].caseId : null);
      setMessage(`${cases.length} JSON case${cases.length === 1 ? '' : 's'} loaded into the editor. Press Import JSON to validate and save.`);
    } catch { setMessage('One of the selected files is not valid JSON.'); }
  };

  const importJson = () => run(async () => {
    const parsed = JSON.parse(editor) as ApiCase | ApiCase[];
    const result = await caseStudioRequest('/import', adminKey, { method: 'POST', body: JSON.stringify(parsed) }) as { imported: string[] };
    setMessage(`Imported: ${result.imported.join(', ')}`);
    await loadCases();
  });

  const saveCase = () => run(async () => {
    const parsed = JSON.parse(editor) as ApiCase;
    const caseId = activeCaseId ?? parsed.caseId;
    await caseStudioRequest(`/${caseId}`, adminKey, { method: 'PUT', body: JSON.stringify(parsed) });
    setActiveCaseId(parsed.caseId);
    setMessage(`${parsed.caseId} saved successfully.`);
    await loadCases();
  });

  const changeStatus = (caseId: string, status: ApiCase['status']) => run(async () => {
    await caseStudioRequest(`/${caseId}/status`, adminKey, { method: 'PATCH', body: JSON.stringify({ status }) });
    setMessage(`${caseId} is now ${status}.`);
    await loadCases();
  });

  const deleteCase = (caseId: string) => {
    if (!window.confirm(`Delete ${caseId}? This cannot be undone from Case Studio.`)) return;
    void run(async () => {
      await caseStudioRequest(`/${caseId}`, adminKey, { method: 'DELETE' });
      if (activeCaseId === caseId) { setActiveCaseId(null); setEditor(''); }
      setMessage(`${caseId} deleted.`);
      await loadCases();
    });
  };

  return (
    <AppShell pageTitle="Case Studio" pageKicker="Administrator workspace">
      <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <section className="surface-card rounded-2xl p-5 md:p-7">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--mint)]"><Database size={18} /></span>
            <div><p className="eyebrow">Case library</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">Draft, review and publish safely.</h2></div>
          </div>
          <label className="mt-6 block text-xs font-extrabold text-[var(--ink)]" htmlFor="admin-key">Administrator key</label>
          <div className="mt-2 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3"><KeyRound size={16} /><input id="admin-key" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" autoComplete="current-password" /></div>
            <button type="button" disabled={busy || !adminKey} onClick={loadCases} className="rounded-xl bg-[var(--ink)] px-4 text-sm font-extrabold text-white disabled:opacity-40"><RefreshCcw size={16} /></button>
          </div>
          <p className="mt-3 rounded-xl bg-[#eef6f4] p-3 text-xs leading-5 text-[var(--ink-soft)]">{message}</p>
          <div className="mt-5 space-y-3">
            {rows.map((row) => (
              <article key={row.caseId} className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="mono-label text-[var(--teal)]">{row.caseId} · {row.level}</p><h3 className="mt-1 truncate text-sm font-extrabold text-[var(--ink)]">{row.internalTitle}</h3><p className="mt-1 text-xs text-[var(--ink-soft)]">{row.lecture}</p></div>
                  <button type="button" onClick={() => openCase(row)} className="rounded-lg border border-[var(--line)] p-2" title="Edit JSON"><Pencil size={15} /></button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(['draft', 'review', 'published', 'inactive'] as const).map((status) => <button key={status} type="button" onClick={() => changeStatus(row.caseId, status)} className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${row.status === status ? 'bg-[var(--teal)] text-white' : 'bg-[#edf2f1] text-[var(--ink-soft)]'}`}>{status}</button>)}
                  <button type="button" onClick={() => deleteCase(row.caseId)} className="ml-auto rounded-lg p-2 text-[#a6463b]" title="Delete case"><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card rounded-2xl p-5 md:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">JSON editor</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">Import or correct a case.</h2></div><FileJson size={22} className="text-[var(--coral)]" /></div>
          <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">Paste one case object or an array of cases. Imported content is validated by the server before it reaches the database.</p>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-xs font-extrabold text-[var(--ink)]">
            <FileJson size={15} /> Choose JSON file(s)
            <input type="file" accept="application/json,.json" multiple className="sr-only" onChange={(event) => void loadJsonFiles(event.target.files)} />
          </label>
          <textarea value={editor} onChange={(event) => setEditor(event.target.value)} spellCheck={false} placeholder="Paste case JSON here…" className="mt-5 min-h-[560px] w-full resize-y rounded-xl border border-[var(--line)] bg-[#102c3f] p-4 font-mono text-xs leading-5 text-[#e7f4ef] outline-none focus:border-[var(--teal)]" />
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy || !adminKey || !editor.trim()} onClick={importJson} className="inline-flex items-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"><Send size={16} /> Import JSON</button>
            <button type="button" disabled={busy || !adminKey || !editor.trim()} onClick={saveCase} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-extrabold text-[var(--ink)] disabled:opacity-40"><Save size={16} /> Save correction</button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
