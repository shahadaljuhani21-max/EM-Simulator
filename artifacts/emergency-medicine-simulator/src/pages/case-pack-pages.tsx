import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { Link, useParams } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { parseCasePack, resolveKeywordResponse, shouldShowImmediateDecisionFeedback, type Decision, type Mode, type PackAction, type PackCase } from '@/lib/case-pack';
import { installCasePack, packIdentity, recordAttempt, useCasePack } from '@/lib/case-pack-store';
import { buildActionReview, hasCompletedReassessment } from '@/lib/action-review';

const MAX_BYTES = 2 * 1024 * 1024;
const base = import.meta.env.BASE_URL;
const creatorMessage = 'Create a compatible Emergency Medicine Case Pack using the attached objectives and reference materials. If lecture material is attached, use it for additional course alignment. Follow the AI Creator instructions exactly and give me one downloadable JSON file containing the cases.';
const modes: { id: Mode; label: string }[] = [
  { id: 'guided', label: 'Guided' },
  { id: 'independent', label: 'Independent' },
  { id: 'challenge', label: 'Challenge' },
];
type Vital = PackCase['vitalSigns'][number];
type Finding = PackCase['steps'][number]['findings'][number];

const btn = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const primaryBtn = `${btn} bg-[var(--teal)] text-white hover:bg-[var(--ink)]`;
const ghostBtn = `${btn} border border-[var(--line)] bg-white/70 text-[var(--ink)] hover:bg-white`;
const toneClass: Record<Vital['tone'], string> = {
  normal: 'border-[var(--line)] bg-white/70',
  watch: 'border-[var(--sun)] bg-[#fdf6e3]',
  critical: 'border-[var(--coral)] bg-[#fcebe7]',
};
const classLabel: Record<PackAction['classification'], string> = {
  optimal: 'Optimal', acceptable: 'Acceptable', incorrect: 'Incorrect', dangerous: 'Dangerous',
};

function ResourceLinks() {
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  async function copyPrompt() {
    try {
      const response = await fetch(`${base}EM_CASE_PACK_GENERATOR_PROMPT_v1.txt`);
      if (!response.ok) throw new Error('Prompt download failed');
      const content = await response.text();
      setPrompt(content);
      try {
        await navigator.clipboard.writeText(content);
        setMessage('Prompt copied. Paste it into ChatGPT and attach the template, schema and your lecture materials.');
      } catch {
        setMessage('Clipboard access is unavailable. Select and copy the prompt below, or download it.');
      }
    } catch { setMessage('Could not load the prompt. Please try again or use the download link.'); }
  }
  return (
    <div><div className="flex flex-wrap gap-3">
      <a className={primaryBtn} href={`${base}EM_CASE_PACK_TEMPLATE_v1.json`} download data-testid="link-download-template">Download template</a>
      <a className={ghostBtn} href={`${base}EM_CASE_PACK_SCHEMA_v1.json`} download data-testid="link-download-schema">JSON schema</a>
      <a className={ghostBtn} href={`${base}EM_CASE_PACK_GUIDE_v1.md`} download data-testid="link-download-guide">Author guide</a>
      <button type="button" className={primaryBtn} onClick={copyPrompt}>Copy Case Pack Generator Prompt</button>
      <a className={ghostBtn} href={`${base}EM_CASE_PACK_GENERATOR_PROMPT_v1.txt`} download>Download generator prompt</a>
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {prompt && <details className="mt-3 text-sm"><summary>View or manually copy the prompt</summary><textarea aria-label="Case Pack Generator Prompt" readOnly value={prompt} onFocus={e => e.target.select()} className="mt-2 h-64 w-full rounded-xl border p-3" /></details>}
    </div>
  );
}

export function CasePackUploadPage() {
  const { pack, error: storeError } = useCasePack();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const messageRef = useRef<HTMLTextAreaElement>(null);
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(creatorMessage);
      setCopyStatus('Message copied. Paste it into ChatGPT after attaching your files.');
    } catch {
      messageRef.current?.focus();
      messageRef.current?.select();
      setCopyStatus('Clipboard access is unavailable. Copy the selected message manually.');
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    setError(null); setSuccess(null);
    if (!file.name.toLowerCase().endsWith('.json')) { setError('file: Please choose a .json file.'); return; }
    if (file.size > MAX_BYTES) { setError('file: The file is larger than 2 MB. Reduce its size and try again.'); return; }
    setBusy(true);
    try {
      const next = parseCasePack(await file.text());
      if (pack && !window.confirm(`Replace the active pack "${pack.title}" with "${next.title}"?\n\nProgress is saved separately for each pack, so returning to the previous pack later keeps its progress.`)) return;
      installCasePack(next);
      setSuccess(`Installed "${next.title}".`);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : String(err)}\n\nNo changes were made. The previous pack is unchanged.`);
    } finally { setBusy(false); }
  }

  return (
    <AppShell pageTitle="Case Packs" pageKicker="Content">
      <section className="surface-card rise-in rounded-2xl p-5 md:p-7">
        <p className="eyebrow">Your course sources, ready to use</p>
        <h2 className="display-font mt-2 text-2xl font-extrabold text-[var(--ink)]">Create cases with ChatGPT</h2>
        <div className="mt-6 space-y-6">
          <section className="border-t border-[var(--line)] pt-5">
            <h3 className="text-lg font-bold">1. Download AI Case Pack Files</h3>
            <a className={`${primaryBtn} mt-3`} href={`${base}api/downloads/ai-case-pack-files`} download="EM_CASE_PACK_FILES_v1.zip">Download AI Case Pack Files</a>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">Contains the instructions, official course objectives and core reference context.</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Save the ZIP to Files or Downloads and extract it. No editing needed. First Aid is included as a citation and study-alignment guide, not the textbook.</p>
          </section>
          <section className="border-t border-[var(--line)] pt-5">
            <h3 className="text-lg font-bold">2. Optional: Add your lecture</h3>
            <p className="mt-2 text-sm">If you have lecture slides/PDFs or instructor material, attach them too for better course alignment. You can generate cases without slides.</p>
          </section>
          <section className="border-t border-[var(--line)] pt-5">
            <h3 className="text-lg font-bold">3. Upload everything to ChatGPT</h3>
            <p className="mt-2 text-sm">Attach all the extracted Case Pack files and any optional lecture material.</p>
            <label htmlFor="creator-message" className="mt-4 block text-sm font-semibold">Then send this short message:</label>
            <textarea id="creator-message" ref={messageRef} readOnly value={creatorMessage} rows={4} className="mt-2 w-full resize-none rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm leading-6" />
            <button type="button" onClick={copyMessage} className={`${ghostBtn} mt-3`}>Copy Message</button>
            {copyStatus && <p role="status" className="mt-2 text-sm">{copyStatus}</p>}
          </section>
          <section className="border-t border-[var(--line)] pt-5">
            <h3 className="text-lg font-bold">4. Download the JSON ChatGPT creates</h3>
            <p className="mt-2 text-sm">Save the one .json Case Pack containing all generated cases. New packs use a writing field matched to hidden clinical keywords. The matched action and explanation appear after every submitted answer in Guided, Independent and Challenge. Older packs keep their action-choice interface.</p>
          </section>
          <section className="border-t border-[var(--line)] pt-5">
            <h3 className="text-lg font-bold">5. Upload Case Pack</h3>
            <p className="mt-2 text-sm">Upload the finished multi-case JSON file here.</p>
        <label className={`${primaryBtn} mt-5 cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          {busy ? 'Checking file...' : 'Upload Finished Case Pack'}
          <input type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={onFile} data-testid="input-case-pack" />
        </label>
        {error && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-[var(--coral)] bg-[#fcebe7] p-4 text-sm text-[var(--ink)]" data-testid="text-upload-error">{error}</p>}
        {storeError && !error && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-[var(--coral)] bg-[#fcebe7] p-4 text-sm">{storeError}</p>}
        {success && <p role="status" className="mt-4 rounded-xl border border-[var(--teal)] bg-[var(--paper-deep)] p-4 text-sm font-semibold" data-testid="text-upload-success">{success}</p>}
            <p className="mt-3 text-xs text-[var(--ink-soft)]">JSON files up to 2 MB. The file is validated before loading. Packs and progress are stored only in this browser.</p>
          </section>
        </div>
        <details className="mt-6 border-t border-[var(--line)] pt-5">
          <summary className="cursor-pointer text-sm font-semibold">Advanced / Developer Tools</summary>
          <div className="mt-4"><ResourceLinks /></div>
        </details>
      </section>

      <section className="surface-card rise-in rise-in-delay-1 mt-6 rounded-2xl p-5 md:p-7">
        <p className="eyebrow">Active pack</p>
        {!pack ? (
          <div className="py-6" data-testid="status-no-pack">
            <h3 className="text-lg font-extrabold">No case pack installed</h3>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Follow the steps above, then upload the finished file to begin.</p>
          </div>
        ) : (
          <>
            <h3 className="mt-2 text-xl font-extrabold" data-testid="text-pack-title">{pack.title}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">{pack.description}</p>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/70 p-4 text-sm">
              <h4 className="font-bold">Author-reported objective coverage</h4>
              {!pack.objectiveCoverage ? <p>Not reported in this legacy pack.</p> : <>
                <p>{pack.objectiveCoverage.scope === 'full_course' ? 'Full course' : 'Selected topics'} · {pack.objectiveCoverage.sourceId}</p>
                <p>{pack.objectiveCoverage.items.filter(o => o.status === 'covered').length} covered · {pack.objectiveCoverage.items.filter(o => o.status === 'partially_covered').length} partially covered · {pack.objectiveCoverage.items.filter(o => o.status === 'intentionally_not_applicable').length} intentionally not applicable</p>
                <p className="mt-2">These are author declarations, not proof of teaching quality or learner mastery.</p>
                <details className="mt-2"><summary>View objective coverage and gaps</summary>
                  <ul className="mt-2 space-y-3">{pack.objectiveCoverage.items.map(o => <li key={o.objectiveId}>
                    <p className="font-semibold">{o.objectiveId}: {o.text}</p>
                    <p>{o.status.replaceAll('_', ' ')} — {o.note}</p>
                    <p>Cases: {o.caseIds.length ? o.caseIds.join(', ') : 'None'}</p>
                  </li>)}</ul>
                </details>
              </>}
            </div>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/70 p-4 text-sm">
              <h4 className="font-bold">Generator-reported verification</h4>
              <p>Medical content checked: {pack.metadata ? (pack.metadata.medicalContentChecked ? 'Yes (reported)' : 'No') : 'Not reported'}</p>
              <p>References independently checked: {pack.metadata ? (pack.metadata.referenceVerificationCompleted ? 'Yes (reported)' : 'No') : 'Not reported'}</p>
              <p>Status: {pack.metadata?.verificationStatus.replaceAll('_', ' ') ?? 'Not reported'}</p>
              <p>Verification date: {pack.metadata?.verificationDate ?? 'Not reported'}</p>
              <p className="mt-2 font-semibold">These are the generator’s declarations, not independent medical validation or a guarantee of correctness. Clinical review is still required.</p>
              {pack.metadata && <details className="mt-2"><summary>Checked sources and limitations</summary>
                <p>Critical management rechecked: {pack.metadata.criticalManagementRechecked ? 'Yes (reported)' : 'No'}</p>
                <p>Citation-to-claim support checked: {pack.metadata.citationClaimsChecked ? 'Yes (reported)' : 'No'}</p>
                <ul className="list-disc pl-5">{[...pack.metadata.sourcesCrossChecked, ...pack.metadata.sourceNotes].map((note, i) => <li key={i}>{note}</li>)}</ul>
              </details>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {modes.map(m => <Link key={m.id} href={`/levels/${m.id}`} className={ghostBtn} data-testid={`link-play-${m.id}`}>Play {m.label}</Link>)}
            </div>
            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {pack.topics.map(t => (
                <li key={t.id} className="rounded-xl border border-[var(--line)] bg-white/60 p-4" data-testid={`card-topic-${t.id}`}>
                  <p className="font-bold">{t.title}</p>
                  <ul className="mt-2 space-y-1 text-sm text-[var(--ink-soft)]">
                    {t.cases.map(c => <li key={c.id}>{c.title} <span className="mono-label">({c.difficulty})</span></li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </AppShell>
  );
}

type Attempt = {
  stepId: string;
  decisions: Decision[];
  findings: Finding[];
  vitals: Vital[];
  condition: string;
  pending: PackAction | null;
  finished: boolean;
  showGuidance: boolean;
};

function freshAttempt(c: PackCase): Attempt {
  return { stepId: c.initialStepId, decisions: [], findings: [], vitals: c.vitalSigns, condition: c.initialPresentation.condition, pending: null, finished: false, showGuidance: false };
}

function mergeVitals(cur: Vital[], updates: Vital[] = []) {
  const next = [...cur];
  updates.forEach(u => { const i = next.findIndex(v => v.label === u.label); if (i >= 0) next[i] = u; else next.push(u); });
  return next;
}

export function CasePackPlayerPage() {
  const params = useParams<{ levelId: string }>();
  const mode = (modes.find(m => m.id === params.levelId)?.id ?? null) as Mode | null;
  const { pack } = useCasePack();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const topic = pack?.topics.find(t => t.id === topicId) ?? pack?.topics[0] ?? null;
  const current = topic?.cases.find(c => c.id === caseId) ?? topic?.cases[0] ?? null;
  const [attempt, setAttempt] = useState<Attempt | null>(current ? freshAttempt(current) : null);
  const [selectedAction, setSelectedAction] = useState<PackAction | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [responseError, setResponseError] = useState<string | null>(null);
  const [reassessmentRequired, setReassessmentRequired] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [score, setScore] = useState<string | null>(null);
  const submitting = useRef(false);
  const selectedActionRef = useRef<HTMLDivElement>(null);
  const identity = pack ? packIdentity() : 'empty';

  useEffect(() => {
    setAttempt(current ? freshAttempt(current) : null);
    setSelectedAction(null);
    setAnswerDraft('');
    setResponseError(null);
    setReassessmentRequired(false);
    setSaveState('idle'); setScore(null);
  }, [current?.id, mode, identity]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAction) selectedActionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedAction]);

  const active = !!attempt && (attempt.decisions.length > 0 || selectedAction !== null || answerDraft.trim().length > 0) && !attempt.finished;
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);

  const confirmAbandon = () => !active || window.confirm('Abandon the current attempt? Partial attempts are not saved.');
  const guardLink = (e: MouseEvent) => { if (!confirmAbandon()) e.preventDefault(); };

  const step = useMemo(() => current?.steps.find(s => s.id === attempt?.stepId) ?? null, [current, attempt?.stepId]);

  function save(c: PackCase, decisions: Decision[]) {
    if (!mode) return;
    try { setScore(recordAttempt(c, mode, decisions).score); setSaveState('saved'); }
    catch { setSaveState('error'); }
  }

  function selectAction(action: PackAction) {
    if (!attempt || !step || attempt.pending || attempt.finished || submitting.current) return;
    setSelectedAction(action);
  }

  function commitAction(
    action: PackAction | null = selectedAction,
    written: Pick<Decision, 'writtenResponse' | 'matchedKeywords' | 'responseCorrect'> | null = null,
  ) {
    const a = action;
    if (!attempt || !step || !current || !a || !step.actions.some(action => action.id === a.id)
      || attempt.pending || attempt.finished || submitting.current) return;
    const reassessmentStep = current.steps.find(candidate => candidate.actions.some(action => action.reassessment))
      ?? current.steps.find(candidate => candidate.kind === 'reassessment');
    const isReassessmentAction = (a.reassessment || step.kind === 'reassessment')
      && (a.classification === 'optimal' || a.classification === 'acceptable');
    if (a.nextStepId === null && reassessmentStep
      && !hasCompletedReassessment(current, attempt.decisions) && !isReassessmentAction) {
      setSelectedAction(null);
      setAnswerDraft('');
      setResponseError(null);
      setReassessmentRequired(true);
      setAttempt({ ...attempt, stepId: reassessmentStep.id, showGuidance: false });
      return;
    }
    submitting.current = true;
    setAttempt({
      ...attempt,
      pending: a,
      decisions: [...attempt.decisions, { stepId: step.id, prompt: step.prompt, action: a, ...(written ?? {}) }],
      findings: [
        ...attempt.findings,
        ...step.findings.filter(f => !attempt.findings.some(existing => existing.category === f.category && existing.label === f.label && existing.text === f.text)),
        ...a.reveals,
      ],
      vitals: mergeVitals(attempt.vitals, a.patientChanges.vitalSigns),
      condition: a.patientChanges.condition ?? attempt.condition,
    });
    setSelectedAction(null);
    if (isReassessmentAction) setReassessmentRequired(false);
    queueMicrotask(() => { submitting.current = false; });
  }

  function submitWrittenResponse() {
    const response = answerDraft.trim();
    if (!attempt || !step || !current || current.responseMode !== 'keyword_written' || !response || attempt.pending || attempt.finished || submitting.current) return;
    setResponseError(null);
    try {
      const result = resolveKeywordResponse(step.actions, response);
      commitAction(result.action, {
        writtenResponse: response,
        matchedKeywords: result.matchedKeywords,
        responseCorrect: result.correct,
      });
    } catch {
      setResponseError('This step could not evaluate a written response. No action was committed.');
    }
  }

  function proceed() {
    if (!attempt?.pending || !current) return;
    const next = attempt.pending.nextStepId;
    if (next === null) {
      setAttempt({ ...attempt, pending: null, finished: true });
      save(current, attempt.decisions);
      return;
    }
    if (!current.steps.some(candidate => candidate.id === next)) return;
    setSelectedAction(null);
    setAnswerDraft('');
    setResponseError(null);
    setAttempt({ ...attempt, pending: null, stepId: next, showGuidance: false });
  }

  if (!mode) {
    return <AppShell pageTitle="Level not found"><p className="text-sm">Unknown level. <Link href="/levels" className="font-bold text-[var(--teal)] underline">Back to levels</Link></p></AppShell>;
  }
  const modeLabel = modes.find(m => m.id === mode)!.label;

  if (!pack || !topic || !current || !attempt || !step) {
    return (
      <AppShell pageTitle={`${modeLabel} mode`} pageKicker="Levels">
        <section className="surface-card rise-in rounded-2xl p-6 md:p-8" data-testid="status-no-pack">
          <p className="eyebrow">No cases yet</p>
          <h2 className="display-font mt-2 text-2xl font-extrabold">Upload a case pack to begin</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Cases come from a JSON case pack stored in this browser.</p>
          <Link href="/case-packs" className={`${primaryBtn} mt-5`} data-testid="link-upload-pack">Upload Case Pack</Link>
        </section>
      </AppShell>
    );
  }

  const actionReview = buildActionReview(current, attempt.decisions);
  const usesKeywordWritten = current.responseMode === 'keyword_written';
  const showGuidance = (mode === 'guided' || mode === 'independent') && attempt.showGuidance;
  const showFeedback = shouldShowImmediateDecisionFeedback(mode, current.responseMode);
  const hasActionReviewMetadata = current.interactionModel === 'action_based';
  const allCaseActions = [...new Map(current.steps.flatMap(caseStep => caseStep.actions).map(action => [action.id, action])).values()];
  const groupedCriticalIds = new Set((current.criticalActionGroups ?? []).flatMap(group => group.actionIds));
  const criticalActionCount = allCaseActions.filter(action => action.critical && !groupedCriticalIds.has(action.id)).length
    + (current.criticalActionGroups?.length ?? 0);
  const writtenDecisions = attempt.decisions.filter(decision => decision.writtenResponse !== undefined);
  const correctWrittenDecisions = writtenDecisions.filter(decision => decision.responseCorrect);
  const pendingDecision = attempt.pending && attempt.decisions.at(-1)?.stepId === step.id ? attempt.decisions.at(-1) : undefined;

  return (
    <AppShell pageTitle={`${modeLabel} mode`} pageKicker={pack.title}>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Mode">
        {modes.map(m => (
          <Link key={m.id} href={`/levels/${m.id}`} onClick={m.id === mode ? undefined : guardLink} aria-current={m.id === mode ? 'page' : undefined}
            className={m.id === mode ? primaryBtn : ghostBtn} data-testid={`link-mode-${m.id}`}>{m.label}</Link>
        ))}
      </div>

      <section className="surface-card rounded-2xl p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold">Topic
            <select className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3" value={topic.id} data-testid="select-topic"
              onChange={e => { if (confirmAbandon()) { setTopicId(e.target.value); setCaseId(null); } }}>
              {pack.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold">Case
            <select className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3" value={current.id} data-testid="select-case"
              onChange={e => { if (confirmAbandon()) setCaseId(e.target.value); }}>
              {topic.cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="surface-card rounded-2xl p-5 md:p-6">
            <p className="eyebrow">{current.difficulty}</p>
            <h2 className="display-font mt-1 text-2xl font-extrabold" data-testid="text-case-title">{current.title}</h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">{current.demographics.age} years, {current.demographics.sex}. {current.demographics.context}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="mono-label text-[var(--ink-soft)]">Complaint</dt><dd className="mt-1">{current.initialPresentation.complaint}</dd></div>
              <div><dt className="mono-label text-[var(--ink-soft)]">Appearance</dt><dd className="mt-1">{current.initialPresentation.appearance}</dd></div>
            </dl>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-bold">Learning objectives</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">{current.learningObjectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
            </details>
          </section>

          {!attempt.finished ? (
            <section className="surface-card rounded-2xl p-5 md:p-6" aria-live="polite">
              <p className="mono-label text-[var(--ink-soft)]">Decision {attempt.decisions.length + (attempt.pending ? 0 : 1)} · {step.kind}</p>
              <h3 className="mt-2 whitespace-pre-wrap text-lg font-extrabold" data-testid="text-step-prompt">{step.prompt}</h3>
              {reassessmentRequired && <p role="alert" className="mt-3 rounded-xl border border-[var(--coral)] bg-[#fcebe7] p-3 text-sm">Complete an appropriate reassessment before choosing a final disposition.</p>}
              {showGuidance && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--paper-deep)] p-3 text-sm" data-testid="text-guidance">{step.guidance}</p>}
              {(mode === 'guided' || mode === 'independent') && !attempt.showGuidance && !attempt.pending && (
                <button type="button" className={`${ghostBtn} mt-3`} onClick={() => setAttempt({ ...attempt, showGuidance: true })} data-testid="button-show-guidance">Show hint</button>
              )}
              {!attempt.pending ? (
                <div className="mt-5 space-y-4">
                  <p className="text-sm font-bold">What do you do next?</p>
                  {usesKeywordWritten ? (
                    <>
                       <p className="text-xs text-[var(--ink-soft)]">Write your next clinical action. The action choices are hidden; one accepted keyword or phrase is enough. The matched action and explanation appear after you submit.</p>
                      <form className="space-y-3" onSubmit={event => { event.preventDefault(); submitWrittenResponse(); }}>
                        <label htmlFor="clinical-response" className="sr-only">Your clinical response</label>
                        <textarea id="clinical-response" rows={4} maxLength={1500} required
                          className="w-full rounded-xl border border-[var(--line)] bg-white/80 p-3 text-sm leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--teal)]"
                          placeholder="Write what you would do next and the key clinical reason."
                          value={answerDraft} onChange={event => setAnswerDraft(event.target.value)}
                          data-testid="input-clinical-response" />
                        {responseError && <p role="alert" className="rounded-xl border border-[var(--coral)] bg-[#fcebe7] p-3 text-sm">{responseError}</p>}
                        <button type="submit" className={primaryBtn} disabled={!answerDraft.trim()} data-testid="button-submit-response">Submit answer</button>
                      </form>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--ink-soft)]">Select one action, then commit it to see how the patient responds.</p>
                      {selectedAction && (
                        <div ref={selectedActionRef} className="rounded-xl border border-[var(--teal)] bg-[var(--paper-deep)] p-4" data-testid="section-selected-action">
                          <p className="mono-label text-[var(--ink-soft)]">Ready to commit</p>
                          <p className="mt-1 font-bold">{selectedAction.text}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className={primaryBtn} onClick={() => commitAction()} data-testid="button-commit-action">Commit action</button>
                            <button type="button" className={ghostBtn} onClick={() => setSelectedAction(null)} data-testid="button-change-action">Choose a different action</button>
                          </div>
                        </div>
                      )}
                      <div className="grid gap-2" role="group" aria-label="Choose one clinical action">
                        {step.actions.map(a => (
                          <button key={a.id} type="button"
                            className={`${selectedAction?.id === a.id ? primaryBtn : ghostBtn} w-full justify-start text-left`}
                            onClick={() => selectAction(a)} aria-pressed={selectedAction?.id === a.id}
                            data-testid={`button-action-${a.id}`}>{a.text}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {pendingDecision?.writtenResponse !== undefined && (
                    <p className="whitespace-pre-wrap rounded-xl bg-[var(--paper-deep)] p-3 text-sm" data-testid="text-submitted-response">
                      <span className="font-bold">Your response:</span> {pendingDecision.writtenResponse}
                    </p>
                  )}
                  <p className="text-sm"><span className="font-bold">{usesKeywordWritten ? 'Mapped action:' : 'Action performed:'}</span> {attempt.pending.text}</p>
                  {showFeedback && pendingDecision?.writtenResponse !== undefined && (
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-3 text-sm" data-testid="text-keyword-result">
                      <p className="font-bold">{pendingDecision.responseCorrect ? 'Correct: at least one accepted keyword matched.' : 'No correct answer keyword matched.'}</p>
                      {pendingDecision.matchedKeywords?.length
                        ? <p className="mt-1">Recognized: {pendingDecision.matchedKeywords.join(', ')}</p>
                        : <p className="mt-1">No authored answer phrase matched; the case used its neutral fallback response.</p>}
                    </div>
                  )}
                  {showFeedback && (
                    <div className="whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm" data-testid="text-feedback">
                      <p className="font-bold">Explanation</p>
                      <p className="mt-1">{attempt.pending.feedback}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm" data-testid="text-consequence"><span className="font-bold">Consequence:</span> {attempt.pending.consequence}</p>
                  <button type="button" className={primaryBtn} onClick={proceed} data-testid="button-continue">{attempt.pending.nextStepId === null ? 'Finish case' : 'Next decision'}</button>
                </div>
              )}
            </section>
          ) : (
            <section className="surface-card rounded-2xl p-5 md:p-6" data-testid="section-summary">
              <p className="eyebrow">End of case</p>
              <h3 className="display-font mt-1 text-2xl font-extrabold">{current.endOfCaseSummary.diagnosis}</h3>
              {score && <p className="mt-2 font-bold" data-testid="text-score">Case performance: {score}</p>}
              <p className="mt-1 text-sm" data-testid="text-patient-outcome"><span className="font-bold">Patient outcome:</span> {attempt.condition}</p>
              {saveState === 'saved' && <p role="status" className="mt-2 text-sm text-[var(--teal)]">Attempt saved to Done Cases.</p>}
              {saveState === 'error' && (
                <div role="alert" className="mt-3 rounded-xl border border-[var(--coral)] bg-[#fcebe7] p-3 text-sm">
                  Your result could not be saved in this browser storage.
                  <button type="button" className={`${ghostBtn} ml-0 mt-2 block`} onClick={() => save(current, attempt.decisions)} data-testid="button-retry-save">Retry save</button>
                </div>
              )}
              <h4 className="mt-4 font-bold">Clinical reasoning</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm">{current.endOfCaseSummary.summary}</p>
              <section className="mt-5 space-y-4 rounded-xl border border-[var(--line)] bg-white/60 p-4 text-sm" data-testid="section-action-review">
                <h4 className="font-bold">Action review</h4>
                <div><p className="font-semibold">What you did well</p>
                  {actionReview.wellDone.length ? <ul className="mt-1 list-disc pl-5">{actionReview.wellDone.map((d, i) => <li key={i}>{d.action.text}</li>)}</ul> : <p>None recorded.</p>}
                  {actionReview.acceptable.length > 0 && <p className="mt-1">Acceptable alternatives: {actionReview.acceptable.map(d => d.action.text).join('; ')}</p>}
                </div>
                <div><p className="font-semibold">Critical actions completed</p>
                  {hasActionReviewMetadata
                    ? criticalActionCount > 0
                      ? <>
                          <p className="mt-1">{actionReview.completedCritical.length} of {criticalActionCount} authored critical actions completed.</p>
                          {actionReview.completedCritical.length
                            ? <ul className="mt-1 list-disc pl-5">{actionReview.completedCritical.map((item, i) => <li key={i}>{item}</li>)}</ul>
                            : <p>None recorded.</p>}
                        </>
                      : <p>No actions were tagged as critical in this case.</p>
                    : <p>This legacy case pack does not separately tag critical actions.</p>}
                </div>
                <div><p className="font-semibold">{hasActionReviewMetadata ? 'Critical actions missed' : 'Potential missed actions to review'}</p>
                  {hasActionReviewMetadata
                    ? actionReview.missedCritical.length
                      ? <ul className="mt-1 space-y-2 pl-5">{actionReview.missedCritical.map(item => (
                          <li key={item.id}>
                            <p className="font-semibold">{item.text}</p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--ink-soft)]">{item.rationale}</p>
                          </li>
                        ))}</ul>
                      : <p>All authored critical actions were completed.</p>
                    : actionReview.potentialMissed.length
                      ? <ul className="mt-1 space-y-2 pl-5">{actionReview.potentialMissed.map(({ stepId, action }) => (
                          <li key={`${stepId}-${action.id}`}>
                            <p className="font-semibold">{action.text}</p>
                            <p className="mt-1 whitespace-pre-wrap text-[var(--ink-soft)]">{action.feedback}</p>
                          </li>
                        ))}</ul>
                      : <p>No unselected optimal action was identified in the stages you reached.</p>}
                  {!hasActionReviewMetadata && <p className="mt-1 text-xs text-[var(--ink-soft)]">Legacy packs do not separately tag critical actions. These optimal actions are review prompts, not definitive critical-action failures.</p>}
                </div>
                <div><p className="font-semibold">Actions performed too late or out of sequence</p>
                  {actionReview.performedTooLate.length ? <ul className="mt-1 list-disc pl-5">{actionReview.performedTooLate.map((d, i) => <li key={i}>{d.action.text}</li>)}</ul> : <p>No authored sequencing concern was identified.</p>}
                </div>
                <div><p className="font-semibold">Optional actions</p>
                  {actionReview.optionalTaken.length ? <ul className="mt-1 list-disc pl-5">{actionReview.optionalTaken.map((d, i) => <li key={i}>{d.action.text}</li>)}</ul> : <p>None recorded.</p>}
                </div>
                <div><p className="font-semibold">Unnecessary actions</p>
                  {actionReview.unnecessary.length ? <ul className="mt-1 list-disc pl-5">{actionReview.unnecessary.map((d, i) => <li key={i}>{d.action.text}</li>)}</ul> : <p>None explicitly identified in the authored feedback.</p>}
                </div>
                <div><p className="font-semibold">Unsafe actions</p>
                  {actionReview.unsafe.length ? <ul className="mt-1 list-disc pl-5">{actionReview.unsafe.map((d, i) => <li key={i}>{d.action.text}</li>)}</ul> : <p>None recorded.</p>}
                </div>
              </section>
              <h4 className="mt-4 font-bold">Better clinical sequence</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm">{current.endOfCaseSummary.idealApproach}</p>
              <h4 className="mt-4 font-bold">Disposition</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm">{current.endOfCaseSummary.disposition}</p>
              <h4 className="mt-4 font-bold">Your decisions</h4>
              {usesKeywordWritten && <p className="mt-1 text-sm" data-testid="text-keyword-score">
                Correct keyword responses: {correctWrittenDecisions.length} of {writtenDecisions.length} submitted. A keyword match is not a complete measure of clinical reasoning.
              </p>}
              <ol className="mt-2 space-y-2">
                {attempt.decisions.map((d, i) => (
                  <li key={i} className="rounded-xl border border-[var(--line)] bg-white/60 p-3 text-sm">
                    <p className="text-[var(--ink-soft)]">{d.prompt}</p>
                    {d.writtenResponse !== undefined && <>
                      <p className="mt-1"><span className="font-bold">Your response:</span> {d.writtenResponse}</p>
                      <p className="mt-1" data-testid="text-debrief-keyword-result">
                        <span className="font-bold">Keyword result:</span> {d.responseCorrect ? 'Correct — at least one accepted keyword matched.' : 'No correct answer keyword matched.'}
                        {d.matchedKeywords?.length ? ` Recognized: ${d.matchedKeywords.join(', ')}.` : ''}
                      </p>
                    </>}
                    <p className="mt-1 font-bold">{d.action.text} <span className="mono-label">· {classLabel[d.action.classification]}</span></p>
                    <p className="mt-1 whitespace-pre-wrap">{d.action.feedback}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[var(--ink-soft)]">Consequence: {d.action.consequence}</p>
                  </li>
                ))}
              </ol>
              {current.objectiveMappings && <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-bold">Objectives reviewed</summary>
                <ul className="mt-2 space-y-3">{current.objectiveMappings.map(mapping => <li key={mapping.objectiveId}>
                  <p className="font-semibold">{mapping.objectiveId}: {pack.objectiveCoverage?.items.find(o => o.objectiveId === mapping.objectiveId)?.text}</p>
                  <p>Decision steps: {mapping.stepIds.join(', ')}</p>
                  <p>{mapping.review}</p>
                </li>)}</ul>
              </details>}
              <h4 className="mt-4 font-bold">Learning objectives</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{current.learningObjectives.map((objective, i) => <li key={i}>{objective}</li>)}</ul>
              <h4 className="mt-4 font-bold">Learning points</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{current.endOfCaseSummary.learningPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>
              <h4 className="mt-4 font-bold">References</h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{current.endOfCaseSummary.references.map((p, i) => <li key={i}>{p}</li>)}</ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className={primaryBtn} onClick={() => { setAttempt(freshAttempt(current)); setSelectedAction(null); setAnswerDraft(''); setResponseError(null); setReassessmentRequired(false); setSaveState('idle'); setScore(null); }} data-testid="button-replay">Replay case</button>
                {modes.filter(m => m.id !== mode).map(m => <Link key={m.id} href={`/levels/${m.id}`} className={ghostBtn} data-testid={`link-replay-${m.id}`}>Replay in {m.label}</Link>)}
                <Link href="/done-cases" className={ghostBtn} data-testid="link-done-cases">Done Cases</Link>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="surface-card rounded-2xl p-5">
            <p className="eyebrow">Patient status</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold" data-testid="text-condition">{attempt.condition}</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {attempt.vitals.map(v => (
                <li key={v.label} className={`rounded-xl border p-3 ${toneClass[v.tone]}`} data-testid={`vital-${v.label}`}>
                  <p className="mono-label text-[var(--ink-soft)]">{v.label}</p>
                  <p className="mt-1 font-extrabold">{v.value}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="surface-card rounded-2xl p-5" data-testid="section-case-progress">
            <p className="eyebrow">Case progress</p>
            <p className="mt-2 text-sm font-semibold">Decision {attempt.decisions.length + (attempt.pending ? 0 : 1)} · {step.kind}</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{attempt.decisions.length} {usesKeywordWritten ? `response${attempt.decisions.length === 1 ? '' : 's'} submitted` : `action${attempt.decisions.length === 1 ? '' : 's'} committed`}</p>
          </section>
          <section className="surface-card rounded-2xl p-5" data-testid="section-actions-performed">
            <p className="eyebrow">{usesKeywordWritten ? 'Mapped actions' : 'Actions performed'}</p>
            {attempt.decisions.length === 0 ? <p className="mt-2 text-sm text-[var(--ink-soft)]">No actions committed yet.</p> : (
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                {attempt.decisions.map((decision, index) => <li key={`${decision.action.id}-${index}`}>{decision.action.text}</li>)}
              </ol>
            )}
          </section>
          <section className="surface-card rounded-2xl p-5">
            <p className="eyebrow">Findings</p>
            {attempt.findings.length === 0 ? <p className="mt-2 text-sm text-[var(--ink-soft)]">No findings yet.</p> : (
              <ul className="mt-2 space-y-2 text-sm">
                {attempt.findings.map((f, i) => (
                  <li key={i}><span className="mono-label text-[var(--ink-soft)]">{f.category}</span><p className="font-bold">{f.label}</p><p className="whitespace-pre-wrap">{f.text}</p></li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
