import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Compass,
  Eye,
  Gauge,
  HeartPulse,
  Info,
  Layers3,
  LockKeyhole,
  Play,
  RefreshCcw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { lectureNames, allCases, casesByLevel, progressStorageKey, lectureStorageKey } from '@/lib/case-pack-store';

type LevelId = 'guided' | 'independent' | 'challenge';
type VitalTone = 'normal' | 'watch' | 'critical';

type Vital = {
  label: string;
  value: string;
  tone?: VitalTone;
};

type ResponseRule = {
  id: string;
  keywords: string[];
  excludedPhrases?: string[];
  strictKeywordsOnly?: boolean;
  response: string;
  points: number;
  critical: boolean;
  information: boolean;
  feedback: string;
  reveal?: {
    label: string;
    text: string;
  };
  updatedVitals?: Vital[];
  updatedCondition?: string;
  feedbackCategory?: 'best' | 'acceptable' | 'unnecessary' | 'unsafe';
  satisfiesRuleId?: string;
  scoreGroup?: string;
  requiresCompletedRuleIds?: string[];
  blockedResponse?: string;
};

type PlaceholderFeedback = {
  diagnosis: string;
  timeline: string[];
  wellDone: string[];
  missed: string[];
  unnecessary: string[];
  unobtained: string[];
  idealApproach: string;
  learningPoints: string[];
  reference: string;
  score: string;
  acceptable?: string[];
  unsafe?: string[];
  unclassified?: string[];
};

type DummyCase = {
  id: string;
  levelId: LevelId;
  lecture: string;
  title: string;
  triage: string;
  appearance: string;
  initialCondition: string;
  initialVitals: Vital[];
  rules: ResponseRule[];
  feedback: PlaceholderFeedback;
};

type CompletedCase = {
  caseId: string;
  levelId: LevelId;
  lecture: string;
  title: string;
  completedAt: string;
  feedback: PlaceholderFeedback;
};

type DemoProgress = {
  completedCaseIds: string[];
  completedCases: CompletedCase[];
  lectureStatuses: LectureStatuses;
};

type TranscriptEntry = {
  kind: 'student' | 'system';
  text: string;
};

const guidedActionLabels: Partial<Record<ResponseRule['id'], string>> = {
  assessment: 'Assess and stabilise (ABCDE)',
  history: 'Take a focused history',
  examination: 'Perform a focused examination',
  investigation: 'Request investigations',
  treatment: 'Start management',
  reassessment: 'Reassess the patient',
};

function normaliseClinicalText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function actionMatchesRule(actionText: string, rule: ResponseRule) {
  const action = normaliseClinicalText(actionText);
  if (rule.excludedPhrases?.some((phrase) => action.includes(normaliseClinicalText(phrase)))) {
    return false;
  }
  if (rule.keywords.some((keyword) => action.includes(normaliseClinicalText(keyword)))) {
    return true;
  }
  if (rule.strictKeywordsOnly) return false;

  const broadPatterns: Partial<Record<ResponseRule['id'], RegExp>> = {
    hint: /\b(hint|help|prompt|guide|clue)\b/,
    assessment: /\b(abcde?|assess|stabili[sz]|primary survey|monitor|iv access|resus)/,
    history: /\b(history|ask|question|collateral|medication|allerg|previous|risk|symptom|onset)/,
    examination: /\b(exam|examine|look|listen|palpat|auscult|jvp|pupil|neurolog)/,
    investigation: /\b(investig|test|lab|blood work|image|scan|x ray|ct|ecg|echo|pocus|culture)/,
    treatment: /\b(treat|manage|give|start|administer|oxygen|fluid|drug|medicine|antibiotic|vasopressor|operate|surgery|cardiovert|defibrillat)/,
    reassessment: /\b(reassess|repeat|response|review|reevaluat|recheck)/,
    delay: /\b(wait|observe only|do nothing|discharge)/,
  };

  return broadPatterns[rule.id]?.test(action) ?? false;
}

export { lectureNames };

type LectureStatus = 'Not Studied' | 'Studied' | 'Needs Revision';
type LectureStatuses = Record<string, LectureStatus>;

const defaultLectureStatuses = (): LectureStatuses =>
  Object.fromEntries(lectureNames.map((lecture) => [lecture, 'Not Studied'])) as LectureStatuses;

const levels: Record<
  LevelId,
  {
    id: LevelId;
    title: string;
    eyebrow: string;
    description: string;
    detail: string;
    accent: string;
    icon: typeof Compass;
  }
> = {
  guided: {
    id: 'guided',
    title: 'Guided',
    eyebrow: 'Build the frame',
    description:
      'A steady path through the fundamentals, with structure when you need it.',
    detail: 'Prompts and pacing keep attention on the next useful decision.',
    accent: '#b9e3d1',
    icon: Compass,
  },
  independent: {
    id: 'independent',
    title: 'Independent',
    eyebrow: 'Trust your read',
    description:
      'Practice turning an initial impression into a clear clinical approach.',
    detail: 'Work through each case at your own pace, without a handrail.',
    accent: '#f0c96b',
    icon: Layers3,
  },
  challenge: {
    id: 'challenge',
    title: 'Challenge',
    eyebrow: 'Sharpen the edge',
    description:
      'For when you want the room to get quieter and the decisions to get faster.',
    detail:
      'A focused final stretch for pattern recognition and prioritisation.',
    accent: '#e77d68',
    icon: Gauge,
  },
};

function getStoredProgress(): DemoProgress {
  if (typeof window === 'undefined') {
    return { completedCaseIds: [], completedCases: [], lectureStatuses: defaultLectureStatuses() };
  }

  try {
    const stored = window.localStorage.getItem(progressStorageKey());
    const statusStored = window.localStorage.getItem(lectureStorageKey());
    const parsed = stored ? (JSON.parse(stored) as Partial<DemoProgress>) : {};
    const rawStatuses = parsed.lectureStatuses || (statusStored ? JSON.parse(statusStored) : {});
    const lectureStatuses = defaultLectureStatuses();
    if (rawStatuses && typeof rawStatuses === 'object') {
      lectureNames.forEach((lecture) => {
        const value = (rawStatuses as Record<string, unknown>)[lecture];
        if (value === 'Studied' || value === 'Needs Revision' || value === 'Not Studied') {
          lectureStatuses[lecture] = value;
        }
      });
    }
    return {
      completedCaseIds: Array.isArray(parsed.completedCaseIds)
        ? parsed.completedCaseIds
        : [],
      completedCases: Array.isArray(parsed.completedCases)
        ? parsed.completedCases.map((completedCase) => ({
            ...completedCase,
            lecture:
              completedCase.lecture ||
              allCases.find((dummyCase) => dummyCase.id === completedCase.caseId)?.lecture ||
              'Approach to the Ill Patient',
          }))
        : [],
      lectureStatuses,
    };
  } catch {
    return { completedCaseIds: [], completedCases: [], lectureStatuses: defaultLectureStatuses() };
  }
}

function saveProgress(progress: DemoProgress) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(progressStorageKey(), JSON.stringify(progress));
  window.localStorage.setItem(lectureStorageKey(), JSON.stringify(progress.lectureStatuses));
  window.dispatchEvent(new CustomEvent('emc-progress-updated'));
}

function useDemoProgress() {
  const [progress, setProgress] = useState<DemoProgress>(() =>
    getStoredProgress(),
  );

  useEffect(() => {
    const refresh = () => setProgress(getStoredProgress());
    window.addEventListener('storage', refresh);
    window.addEventListener('emc-progress-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('emc-progress-updated', refresh);
    };
  }, []);

  const completeCase = (completedCase: CompletedCase) => {
    const current = getStoredProgress();
    if (current.completedCaseIds.includes(completedCase.caseId)) {
      setProgress(current);
      return;
    }
    const next: DemoProgress = {
      completedCaseIds: [...current.completedCaseIds, completedCase.caseId],
      completedCases: [...current.completedCases, completedCase],
      lectureStatuses: current.lectureStatuses,
    };
    saveProgress(next);
    setProgress(next);
  };

  const setLectureStatus = (lecture: string, status: LectureStatus) => {
    const current = getStoredProgress();
    const next = {
      ...current,
      lectureStatuses: { ...current.lectureStatuses, [lecture]: status },
    };
    saveProgress(next);
    setProgress(next);
  };

  const resetProgress = () => {
    const empty = {
      completedCaseIds: [],
      completedCases: [],
      lectureStatuses: defaultLectureStatuses(),
    };
    saveProgress(empty);
    setProgress(empty);
  };

  return { progress, completeCase, resetProgress, setLectureStatus };
}

function getLevelCases(levelId: LevelId): DummyCase[] {
  return casesByLevel[levelId];
}

function getRemainingCases(
  levelId: LevelId,
  completedCaseIds: string[],
  lecturePool: CaseLecturePool = 'all',
  lectureStatuses: LectureStatuses = defaultLectureStatuses(),
  includeCompleted = false,
) {
  return getLevelCases(levelId).filter(
    (dummyCase) =>
      (includeCompleted || !completedCaseIds.includes(dummyCase.id)) &&
      (lecturePool === 'all' ||
        (lecturePool === 'studied' && lectureStatuses[dummyCase.lecture] === 'Studied') ||
        (lecturePool === 'revision' && lectureStatuses[dummyCase.lecture] === 'Needs Revision')),
  );
}

type CaseLecturePool = 'studied' | 'all' | 'revision';

function selectRandomCase(
  levelId: LevelId,
  completedCaseIds: string[],
  lecturePool: CaseLecturePool = 'all',
  lectureStatuses: LectureStatuses = defaultLectureStatuses(),
  includeCompleted = false,
) {
  const remaining = getRemainingCases(
    levelId,
    completedCaseIds,
    lecturePool,
    lectureStatuses,
    includeCompleted,
  );
  if (!remaining.length) return null;
  return remaining[Math.floor(Math.random() * remaining.length)].id;
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display-font mt-2 text-3xl font-extrabold text-[var(--ink)] md:text-[40px]">
        {title}
      </h2>
      {description && (
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-[var(--ink-soft)]">
          {description}
        </p>
      )}
    </div>
  );
}

function ProgressRing({ value = 0, size = 116 }: { value?: number; size?: number }) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 116 116" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="58" cy="58" r={radius} fill="none" stroke="#dcebe5" strokeWidth="9" />
        <circle
          cx="58"
          cy="58"
          r={radius}
          fill="none"
          stroke="var(--teal)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (value / 100) * circumference}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="display-font text-2xl font-extrabold text-[var(--ink)]">
          {value}%
        </strong>
        <span className="mono-label text-[var(--ink-soft)]">complete</span>
      </span>
    </div>
  );
}

function StatBlock({
  value,
  label,
  note,
  testId,
}: {
  value: string;
  label: string;
  note: string;
  testId: string;
}) {
  return (
    <div className="border-l border-[var(--line)] pl-4 first:border-0 first:pl-0">
      <p className="display-font text-2xl font-extrabold text-[var(--ink)]" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-xs font-bold text-[var(--ink-soft)]">{label}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">{note}</p>
    </div>
  );
}

function PlaceholderNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#ead8a3] bg-[#fff8de] p-4 text-xs leading-5 text-[#6d5b22]">
      <Info size={15} className="mt-0.5 shrink-0" />
      <span>
        <strong className="font-extrabold">Fictional educational cases.</strong>{' '}
        {children}
      </span>
    </div>
  );
}

export function WelcomePage() {
  const [, setLocation] = useLocation();
  const continueDemo = () => {
    window.localStorage.setItem('emc-demo-entered', 'true');
    setLocation('/dashboard');
  };
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[var(--paper)]">
      <header className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-6 md:px-10 md:py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ink)] text-[var(--mint)]">
            <Activity size={21} strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-extrabold tracking-[-.04em] text-[var(--ink)]">
              EMC Simulator
            </p>
            <p className="mono-label mt-0.5 text-[var(--teal)]">
              Clinical learning, clarified
            </p>
          </div>
        </div>
        <span className="mono-label hidden text-[var(--ink-soft)] sm:block">
          No account required · demo mode
        </span>
      </header>
      <main className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 pb-14 pt-10 md:grid-cols-[minmax(0,1.03fr)_minmax(400px,.97fr)] md:px-10 md:pb-20 md:pt-16 lg:gap-20 lg:pt-24">
        <section className="rise-in">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 px-3 py-2 text-xs font-bold text-[var(--teal)]">
            <ShieldCheck size={15} />
            <span>Made for the first five minutes</span>
          </div>
          <h1 className="display-font max-w-[700px] text-[clamp(3.2rem,7vw,6.5rem)] font-extrabold leading-[.96] text-[var(--ink)]">
            Make the next decision
            <br />
            <span className="text-[var(--teal)]">a little clearer.</span>
          </h1>
          <p className="mt-8 max-w-[520px] text-base leading-8 text-[var(--ink-soft)] md:text-lg">
            A calm clinical simulator for medical students. Start with a level, take one case at a time, and build the habit of seeing what matters first.
          </p>
          <button
            type="button"
            onClick={continueDemo}
            data-testid="button-continue-demo"
            className="mt-9 inline-flex items-center gap-3 rounded-xl bg-[var(--ink)] px-5 py-3.5 text-sm font-extrabold text-[#f3faf6] shadow-[0_10px_24px_rgba(23,56,77,.18)] transition-transform hover:-translate-y-0.5"
          >
            Continue as Demo Student
            <ArrowRight size={17} />
          </button>
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--ink-soft)]">
            <Info size={14} /> Your progress stays in this browser for now.
          </p>
        </section>
        <section className="rise-in rise-in-delay-2 relative" aria-label="Clinical simulator preview">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[var(--mint)]/50 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] border border-[#c9dfd6] bg-[#dceee7] p-4 shadow-[0_24px_70px_rgba(29,80,79,.12)] md:p-6">
            <div className="rounded-[21px] bg-[var(--ink)] p-5 text-[#eef8f3] md:p-7">
              <div className="flex items-start justify-between">
                <div>
                  <p className="mono-label text-[#9fc9be]">Example workspace</p>
                  <p className="mt-2 text-sm font-bold">Your clinical dashboard</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#315a60] text-[var(--mint)]">
                  <Activity size={18} />
                </span>
              </div>
              <div className="mt-10 border-y border-[#315a60] py-8">
                <svg viewBox="0 0 500 112" className="h-auto w-full" role="img" aria-label="Abstract clinical signal line">
                  <path d="M0 62 H80 L95 61 L106 26 L118 93 L132 61 H210 L224 59 L237 42 L246 73 L257 61 H340 L352 61 L363 16 L377 98 L389 61 H500" fill="none" stroke="#b9e3d1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="pulse-line" />
                  <path d="M0 62 H500" fill="none" stroke="#4e7677" strokeWidth="1" strokeDasharray="2 7" />
                </svg>
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-extrabold tracking-[-.06em]">
                    {getStoredProgress().completedCaseIds.length} <span className="text-base font-medium text-[#9fc9be]">/ {allCases.length}</span>
                  </p>
                  <p className="mono-label mt-1 text-[#9fc9be]">cases completed</p>
                </div>
                <span className="rounded-full bg-[#f0c96b] px-3 py-1.5 text-[11px] font-extrabold text-[var(--ink)]">
                  Ready when you are
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-2 pb-1 pt-5 text-xs font-bold text-[var(--teal)]">
              <span className="h-2 w-2 rounded-full bg-[var(--coral)]" />
              Designed to keep your thinking spacious.
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-[1320px] flex-wrap gap-x-8 gap-y-2 border-t border-[var(--line)] px-5 py-6 text-xs font-semibold text-[var(--ink-soft)] md:px-10">
        <span className="flex items-center gap-2">
          <BookOpen size={14} /> 3 learning levels
        </span>
        <span className="flex items-center gap-2">
          <Clock3 size={14} /> Short, focused sessions
        </span>
        <span className="flex items-center gap-2">
          <CircleHelp size={14} /> A practice space, not a test
        </span>
      </footer>
    </div>
  );
}

export function DashboardPage() {
  const { progress } = useDemoProgress();
  const completedCount = progress.completedCaseIds.length;
  const progressPercent = allCases.length ? Math.round((completedCount / allCases.length) * 100) : 0;
  const levelsStarted = new Set(progress.completedCases.map((item) => item.levelId)).size;

  return (
    <AppShell pageTitle="Good to see you, Medical Student" pageKicker="Your learning workspace">
      <div className="rise-in">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Your overview"
            title="Keep the signal in view."
            description="You have a clean slate. Choose a pace that lets you notice more, not rush more."
          />
          <Link href="/levels" data-testid="link-dashboard-browse-levels" className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm font-extrabold text-[var(--ink)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]">
            Browse levels <ArrowRight size={16} />
          </Link>
        </div>
        <PlaceholderNotice>
          All patients are fictional educational scenarios derived from the stated reference. They are not a substitute for local protocols, supervision, or current clinical guidance.
        </PlaceholderNotice>
        <div className="surface-card mb-6 mt-6 grid gap-7 rounded-2xl p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:p-7">
          <ProgressRing value={progressPercent} />
          <div>
            <p className="eyebrow">Overall progress</p>
            <h3 className="mt-2 text-xl font-extrabold tracking-[-.04em] text-[var(--ink)]">
              {completedCount ? 'Your pathway is moving.' : 'Your first case is waiting.'}
            </h3>
            <p className="mt-2 max-w-[520px] text-sm leading-6 text-[var(--ink-soft)]">
              Begin in Guided level for a supported first pass, or choose your own route through the simulator.
            </p>
            <div className="mt-5 h-2 max-w-[500px] progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
          <Link href="/levels/guided" data-testid="link-dashboard-start-guided" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5">
            Start Guided <Play size={15} fill="currentColor" />
          </Link>
        </div>
        <div className="surface-card grid grid-cols-2 gap-5 rounded-2xl p-5 md:grid-cols-4 md:p-7">
          <StatBlock value={String(completedCount)} label="Cases completed" note="Your completed work will collect here." testId="text-dashboard-cases-completed" />
          <StatBlock value={`${levelsStarted} / 3`} label="Levels started" note="Pick one that fits your headspace." testId="text-dashboard-levels-started" />
          <StatBlock value={completedCount ? 'Today' : '—'} label="Last session" note="A date will appear after you begin." testId="text-dashboard-last-session" />
          <StatBlock value={completedCount ? `${completedCount * 8} min` : '0 min'} label="Practice time" note="Short sessions count, too." testId="text-dashboard-practice-time" />
        </div>
      </div>
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <section className="surface-card rounded-2xl p-5 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Quick continuation</p>
              <h2 className="mt-2 text-xl font-extrabold tracking-[-.04em] text-[var(--ink)]">
                Where would you like to start?
              </h2>
            </div>
            <Sparkles size={19} className="text-[var(--coral)]" />
          </div>
          <div className="mt-6 divide-y divide-[var(--line)]">
            {(['guided', 'independent', 'challenge'] as LevelId[]).map((id) => {
              const level = levels[id];
              const completed = progress.completedCases.filter((entry) => entry.levelId === id).length;
              return (
                <Link href={`/levels/${id}`} key={id} data-testid={`link-quick-level-${id}`} className="group flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: level.accent }}>
                    <level.icon size={18} className="text-[var(--ink)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-[var(--ink)]">{level.title}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--ink-soft)]">
                      {level.eyebrow} · {completed} of {allCases.length} cases complete
                    </span>
                  </span>
                  <ChevronRight size={18} className="text-[var(--ink-soft)] transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl bg-[var(--ink)] p-6 text-[#eaf6f0] md:p-7">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315a60] text-[var(--mint)]">
            <Info size={18} />
          </div>
          <p className="mono-label mt-10 text-[#9fc9be]">A note for your practice</p>
          <p className="mt-3 text-lg font-bold leading-7">
            You do not need to know everything before you begin.
          </p>
          <p className="mt-3 text-sm leading-6 text-[#b8d2ca]">
            This workspace is here to make your reasoning visible, one decision at a time.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

export function LevelsPage() {
  const { progress } = useDemoProgress();
  return (
    <AppShell pageTitle="Choose your level" pageKicker="Learning levels">
      <div className="rise-in">
        <SectionHeading
          eyebrow="Three ways in"
          title="Meet the moment you are in."
          description={`Practice the same ${allCases.length} uploaded cases in all three modes. Only the amount of guidance and feedback changes.`}
        />
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {(['guided', 'independent', 'challenge'] as LevelId[]).map((id, index) => {
            const level = levels[id];
            const Icon = level.icon;
              const completed = progress.completedCases.filter((entry) => entry.levelId === id).length;
            return (
              <article key={id} data-testid={`card-level-${id}`} className="level-card surface-card group relative flex min-h-[360px] flex-col overflow-hidden rounded-2xl p-6 md:p-7">
                <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-[80px] opacity-55" style={{ backgroundColor: level.accent }} />
                <div className="relative flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: level.accent }}>
                    <Icon size={22} />
                  </span>
                  <span className="mono-label text-[var(--ink-soft)]">0{index + 1}</span>
                </div>
                <div className="relative mt-9">
                  <p className="eyebrow">{level.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[var(--ink)]">{level.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{level.description}</p>
                </div>
                <div className="relative mt-auto pt-7">
                  <div className="mb-4 flex items-center justify-between text-xs font-bold">
                    <span className="text-[var(--ink-soft)]">Progress</span>
                    <span className="text-[var(--ink)]">{completed} / {allCases.length} cases</span>
                  </div>
                  <div className="h-2 progress-track">
                    <div className="progress-fill" style={{ width: `${allCases.length ? (completed / allCases.length) * 100 : 0}%`, backgroundColor: id === 'challenge' ? 'var(--coral)' : 'var(--teal)' }} />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-[var(--ink-soft)]">{completed} / {allCases.length} cases completed</p>
                  <Link href={`/levels/${id}`} data-testid={`link-open-level-${id}`} className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4 text-sm font-extrabold text-[var(--teal)]">
                    Enter level <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        <PlaceholderNotice>
          These fictional cases use the First Aid reference as their educational foundation. Always follow current local guidance in real clinical care.
        </PlaceholderNotice>
      </div>
    </AppShell>
  );
}

function VitalSigns({ vitals }: { vitals: Vital[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {vitals.map((vital) => (
        <div key={vital.label} className="rounded-xl border border-[var(--line)] bg-white/65 p-3">
          <p className="mono-label text-[var(--ink-soft)]">{vital.label}</p>
          <p className={`mt-2 text-sm font-extrabold ${vital.tone === 'critical' ? 'text-[#c8584b]' : vital.tone === 'watch' ? 'text-[#a37b1b]' : 'text-[var(--ink)]'}`}>
            {vital.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function FeedbackSection({
  title,
  items,
  accent = 'var(--teal)',
}: {
  title: string;
  items: string[];
  accent?: string;
}) {
  if (!items.length) return null;

  return (
    <div className="border-t border-[var(--line)] pt-5">
      <p className="text-sm font-extrabold text-[var(--ink)]">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-[var(--ink-soft)]">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function compactAlgorithmText(value: string) {
  return value
    .replace(/^(Focused history:|Examination findings:|Results:|Appropriate treatment begins:|Management response:)\s*/i, '')
    .replace(/\.\s*Relevant background.*$/i, '')
    .replace(/\.\s*The patient is moved.*$/i, '')
    .replace(/[.;]\s*$/g, '')
    .replace(/;\s*/g, ' → ');
}

function AlgorithmCard({ simulatorCase }: { simulatorCase: DummyCase }) {
  const rule = (id: string) => simulatorCase.rules.find((item) => item.id === id);
  const isCardiacArrest = simulatorCase.lecture === 'Cardiac Arrest';
  const sections = [
    {
      title: 'Resuscitation',
      text: isCardiacArrest
        ? 'Confirm arrest → CPR → Monitor/defibrillator → IV/IO'
        : 'ABCDE → Monitor → IV access → Treat instability',
    },
    !isCardiacArrest
      ? {
          title: 'History',
          text: 'Onset → Progression → Medications → Comorbidity → Risks',
        }
      : null,
    !isCardiacArrest && rule('examination')?.reveal?.text
      ? {
          title: 'Examination',
          text: compactAlgorithmText(rule('examination')!.reveal!.text),
        }
      : null,
    rule('investigation')?.reveal?.text
      ? {
          title: 'Investigations',
          text: compactAlgorithmText(rule('investigation')!.reveal!.text),
        }
      : null,
    {
      title: 'Treatment',
      text: compactAlgorithmText(simulatorCase.feedback.idealApproach),
    },
    {
      title: 'Reassessment',
      text: isCardiacArrest
        ? 'Rhythm → Pulse/ROSC → Reversible causes'
        : 'Vitals → Mental status → Perfusion → Response',
    },
  ].filter((section): section is { title: string; text: string } => Boolean(section?.text));

  return (
    <section className="overflow-hidden rounded-2xl border border-[#315a60] bg-[var(--ink)] text-[#eef8f3] shadow-[0_18px_55px_rgba(20,54,61,.18)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#315a60] px-5 py-5 md:px-7">
        <div>
          <p className="mono-label text-[var(--mint)]">Screenshot card</p>
          <h3 className="mt-2 text-xl font-extrabold tracking-[-.04em]">Patient algorithm</h3>
        </div>
        <ClipboardList size={21} className="mt-1 text-[var(--mint)]" />
      </div>
      <div className="divide-y divide-[#315a60]">
        {sections.map((section) => (
          <div key={section.title} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[125px_1fr] sm:gap-4 md:px-7">
            <p className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--mint)]">{section.title}</p>
            <p className="text-sm font-bold leading-6 text-[#eef8f3]">{section.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CaseFeedback({
  level,
  dummyCase,
  feedback,
}: {
  level: (typeof levels)[LevelId];
  dummyCase: DummyCase;
  feedback: PlaceholderFeedback;
}) {
  return (
    <div className="mt-7 space-y-6">
      <PlaceholderNotice>
        This is educational feedback for a fictional patient. Compare it with current local protocols and supervised clinical teaching.
      </PlaceholderNotice>
      <section className="surface-card rounded-2xl p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-start">
          <div>
            <p className="eyebrow">Case complete · {level.title}</p>
            <h2 className="display-font mt-2 text-3xl font-extrabold text-[var(--ink)]">{dummyCase.title}</h2>
          </div>
          <span className="rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs font-extrabold text-[var(--ink)]">{feedback.score}</span>
        </div>
        <div className="mt-6 rounded-xl bg-[var(--paper-deep)] p-4">
          <p className="mono-label text-[var(--ink-soft)]">Final diagnosis</p>
          <p className="mt-2 text-base font-extrabold text-[var(--ink)]">{feedback.diagnosis}</p>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/60 p-4">
          <BookOpen size={17} className="shrink-0 text-[var(--teal)]" />
          <div>
            <p className="mono-label text-[var(--ink-soft)]">Related Lecture</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--ink)]">{dummyCase.lecture}</p>
          </div>
        </div>
        <div className="mt-6">
          <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]"><Clock3 size={16} className="text-[var(--teal)]" /> Clinical timeline</p>
          <ol className="mt-4 space-y-3">
            {feedback.timeline.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--ink-soft)]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--paper-deep)] font-mono text-[10px] font-bold text-[var(--teal)]">0{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="mt-7 grid gap-6 md:grid-cols-2">
          <FeedbackSection title="What was done well" items={feedback.wellDone} />
          <FeedbackSection title="Acceptable but not preferred" items={feedback.acceptable ?? []} accent="#527b72" />
          <FeedbackSection title="Missed critical actions" items={feedback.missed} accent="var(--coral)" />
          <FeedbackSection title="Unsafe actions" items={feedback.unsafe ?? []} accent="var(--coral)" />
          <FeedbackSection title="Unnecessary or harmful actions" items={feedback.unnecessary} accent="#a37b1b" />
          <FeedbackSection title="Unclassified actions to review" items={feedback.unclassified ?? []} accent="#8b78b5" />
          <FeedbackSection title="Unobtained information" items={feedback.unobtained} accent="#8b78b5" />
        </div>
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-white/55 p-4">
          <p className="text-sm font-extrabold text-[var(--ink)]">Ideal approach</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{feedback.idealApproach}</p>
        </div>
        <FeedbackSection title="Learning points" items={feedback.learningPoints} />
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-white/55 p-4">
          <p className="mono-label text-[var(--ink-soft)]">Educational reference</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{feedback.reference}</p>
        </div>
      </section>
      <AlgorithmCard simulatorCase={dummyCase} />
    </div>
  );
}

export function LevelDetailPage() {
  const params = useParams<{ levelId: string }>();
  const levelId = (params.levelId || 'guided') as LevelId;
  const level = levels[levelId] || levels.guided;
  const activeLevelId = levels[levelId] ? levelId : 'guided';
  const Icon = level.icon;
  const [location, setLocation] = useLocation();
  const revisionMode = new URLSearchParams(location.split('?')[1] || '').get('revision') === '1';
  const { progress, completeCase } = useDemoProgress();
  const [lecturePool, setLecturePool] = useState<CaseLecturePool>('all');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'select' | 'active' | 'complete' | 'empty'>('select');
  const [currentVitals, setCurrentVitals] = useState<Vital[]>([]);
  const [condition, setCondition] = useState('');
  const [action, setAction] = useState('');
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [feedback, setFeedback] = useState<PlaceholderFeedback | null>(null);
  const [completedRuleIds, setCompletedRuleIds] = useState<string[]>([]);
  const [unrecognisedActionCount, setUnrecognisedActionCount] = useState(0);

  const dummyCase: DummyCase | undefined = allCases.find((item) => item.id === caseId);
  const remainingCases = useMemo(
    () => getRemainingCases(
      activeLevelId,
      progress.completedCaseIds,
      lecturePool,
      progress.lectureStatuses,
      revisionMode,
    ),
    [activeLevelId, progress.completedCaseIds, progress.lectureStatuses, lecturePool, revisionMode],
  );

  useEffect(() => {
    if (!dummyCase) return;
    setCurrentVitals(dummyCase.initialVitals);
    setCondition(dummyCase.initialCondition);
    setAction('');
    setMessages([]);
    setFeedback(null);
    setCompletedRuleIds([]);
    setUnrecognisedActionCount(0);
    setPhase('active');
  }, [dummyCase?.id]);

  const runAction = (actionText: string) => {
    if (!dummyCase || !actionText.trim() || phase !== 'active') return;
    const matchedRules = dummyCase.rules.filter((candidate) =>
      actionMatchesRule(actionText, candidate),
    );
    const satisfiedRuleIds = new Set(completedRuleIds);
    dummyCase.rules.forEach((candidate) => {
      if (completedRuleIds.includes(candidate.id) && candidate.satisfiesRuleId) {
        satisfiedRuleIds.add(candidate.satisfiesRuleId);
      }
    });
    const matchedRule = matchedRules[0];
    const missingPrerequisite = (matchedRule?.requiresCompletedRuleIds ?? []).some(
      (requiredId) => !satisfiedRuleIds.has(requiredId),
    );
    const rule = matchedRule && !missingPrerequisite ? matchedRule : undefined;
    const blockedRule = matchedRule && missingPrerequisite ? matchedRule : undefined;
    const response =
      rule?.response ||
      blockedRule?.blockedResponse ||
      'No new case information is revealed by that request. Try describing a more specific assessment, question, examination, investigation, treatment, or reassessment.';
    const nextMessages: TranscriptEntry[] = [
      ...messages,
      { kind: 'student', text: actionText.trim() },
      { kind: 'system', text: response },
    ];
    if (rule?.reveal) {
      nextMessages.push({
        kind: 'system',
        text: `${rule.reveal.label}: ${rule.reveal.text}`,
      });
    }
    setMessages(nextMessages);
    if (rule?.updatedVitals) setCurrentVitals(rule.updatedVitals);
    if (rule?.updatedCondition) setCondition(rule.updatedCondition);
    if (rule) {
      setCompletedRuleIds((current) =>
        current.includes(rule.id) ? current : [...current, rule.id],
      );
    } else if (!blockedRule) {
      setUnrecognisedActionCount((current) => current + 1);
    }
    setAction('');
  };

  const submitAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runAction(action);
  };

  const guidedChoices = dummyCase?.rules.filter(
    (rule) =>
      guidedActionLabels[rule.id] &&
      !completedRuleIds.includes(rule.id),
  ) ?? [];

  const endCase = () => {
    if (!dummyCase || phase !== 'active') return;
    const completedRules = dummyCase.rules.filter((rule) =>
      completedRuleIds.includes(rule.id),
    );
    const satisfiedRuleIds = new Set(completedRuleIds);
    completedRules.forEach((rule) => {
      if (rule.satisfiesRuleId) satisfiedRuleIds.add(rule.satisfiesRuleId);
    });
    const missedCriticalRules = dummyCase.rules.filter(
      (rule) => rule.critical && !satisfiedRuleIds.has(rule.id),
    );
    const unobtainedRules = dummyCase.rules.filter(
      (rule) => rule.information && !completedRuleIds.includes(rule.id),
    );
    const scoreGroupPoints = new Map<string, number>();
    let ungroupedPoints = 0;
    completedRules.forEach((rule) => {
      if (rule.scoreGroup) {
        scoreGroupPoints.set(
          rule.scoreGroup,
          Math.max(scoreGroupPoints.get(rule.scoreGroup) ?? 0, rule.points),
        );
      } else {
        ungroupedPoints += rule.points;
      }
    });
    const earnedPoints =
      ungroupedPoints +
      [...scoreGroupPoints.values()].reduce((sum, points) => sum + points, 0);
    const completedFeedback: PlaceholderFeedback = {
      ...dummyCase.feedback,
      score: `${earnedPoints} / 100`,
      wellDone: completedRules.length
        ? completedRules
            .filter((rule) => rule.points > 0 && rule.feedbackCategory !== 'acceptable')
            .map((rule) => rule.feedback)
        : ['No scored action was completed before ending the case.'],
      acceptable: completedRules
        .filter((rule) => rule.feedbackCategory === 'acceptable')
        .map((rule) => rule.feedback),
      unsafe: completedRules
        .filter((rule) => rule.feedbackCategory === 'unsafe')
        .map((rule) => rule.feedback),
      missed: missedCriticalRules.length
        ? missedCriticalRules.map((rule) => `Missed: ${rule.feedback}`)
        : ['No critical scored action was missed.'],
      unobtained: unobtainedRules.length
        ? unobtainedRules.map((rule) => `Not obtained: ${rule.feedback}`)
        : ['All predefined focused information was obtained.'],
      unnecessary: [
        ...completedRules
          .filter((rule) => rule.feedbackCategory === 'unnecessary')
          .map((rule) => rule.feedback),
        ...dummyCase.feedback.unnecessary,
      ],
      unclassified: unrecognisedActionCount
        ? [
            `${unrecognisedActionCount} request${unrecognisedActionCount === 1 ? '' : 's'} did not match a predefined case response. That does not automatically mean the action was clinically wrong; review it against local guidance.`,
          ]
        : [],
    };
    completeCase({
      caseId: dummyCase.id,
      levelId: dummyCase.levelId,
      lecture: dummyCase.lecture,
      title: dummyCase.title,
      completedAt: new Date().toISOString(),
      feedback: completedFeedback,
    });
    setFeedback(completedFeedback);
    setPhase('complete');
  };

  const beginCase = () => {
    const nextCaseId = selectRandomCase(
      activeLevelId,
      getStoredProgress().completedCaseIds,
      lecturePool,
      getStoredProgress().lectureStatuses,
      revisionMode,
    );
    if (!nextCaseId) {
      setCaseId(null);
      setPhase('empty');
      return;
    }
    setCaseId(nextCaseId);
    setPhase('active');
  };

  const beginAnotherCase = () => {
    setFeedback(null);
    setCaseId(null);
    setPhase('select');
  };

  const completedCount = getLevelCases(activeLevelId).filter((item) =>
    progress.completedCaseIds.includes(item.id),
  ).length;

  return (
    <AppShell pageTitle={`${level.title} level`} pageKicker={revisionMode ? 'Revision Mode' : 'Learning level'}>
      <div className="rise-in">
        <button type="button" onClick={() => setLocation(revisionMode ? '/revision' : '/levels')} data-testid="button-back-to-levels" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-[var(--ink-soft)] transition-colors hover:text-[var(--teal)]">
          <ArrowLeft size={16} /> {revisionMode ? 'Revision Mode' : 'All levels'}
        </button>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <section className="surface-card rounded-2xl p-6 md:p-9">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: level.accent }}>
              <Icon size={25} />
            </span>
            <p className="eyebrow mt-8">{level.eyebrow}</p>
            <h2 className="display-font mt-2 text-4xl font-extrabold text-[var(--ink)] md:text-5xl">{level.title}</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--ink-soft)]">{level.description}</p>
            <div className="mt-8 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-2">
              <div>
                <p className="mono-label text-[var(--ink-soft)]">Pathway length</p>
                <p className="mt-2 font-extrabold text-[var(--ink)]">50 cases</p>
              </div>
              <div>
                <p className="mono-label text-[var(--ink-soft)]">Level progress</p>
                <p className="mt-2 font-extrabold text-[var(--ink)]">{completedCount} / 50 complete</p>
              </div>
            </div>
          </section>
          <section className="rounded-2xl bg-[var(--ink)] p-6 text-[#eaf6f0] md:p-8">
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#315a60] text-[var(--mint)]">
                <ClipboardList size={20} />
              </div>
              <span className="mono-label text-[#f0c96b]">50 cases</span>
            </div>
             <h3 className="mt-12 text-2xl font-extrabold tracking-[-.05em]">{phase === 'active' ? 'Case in progress.' : 'Choose your lecture pool.'}</h3>
            <p className="mt-3 text-sm leading-6 text-[#b8d2ca]">
                {phase === 'active'
                  ? 'Finish the current fictional case to choose another random case.'
                  : revisionMode
                    ? 'Replay a random case from this completed level. The title and lecture stay hidden until you end it.'
                    : 'Start with a random unfinished case. The title and lecture stay hidden until you end it.'}
            </p>
             <div className="mt-8 space-y-2">
               {([
                 ['studied', 'Studied Lectures Only', 'Cases linked to lectures marked Studied.'],
                 ['all', 'All Lectures', 'Any unfinished case in this level.'],
                 ['revision', 'Needs Revision', 'Cases linked to lectures needing another look.'],
               ] as const).map(([value, label, description]) => (
                 <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${lecturePool === value ? 'border-[var(--mint)] bg-[#315a60]' : 'border-[#315a60] hover:bg-[#294f58]'}`}>
                   <input
                     type="radio"
                     name="lecture-pool"
                     value={value}
                     checked={lecturePool === value}
                     onChange={() => setLecturePool(value)}
                     disabled={phase === 'active'}
                     className="mt-1 accent-[var(--mint)]"
                     data-testid={`radio-lecture-pool-${value}`}
                   />
                   <span>
                     <span className="block text-sm font-extrabold text-[#eef8f3]">{label}</span>
                     <span className="mt-1 block text-xs leading-5 text-[#b8d2ca]">{description}</span>
                   </span>
                 </label>
               ))}
            </div>
              <button type="button" onClick={beginCase} disabled={phase === 'active'} data-testid="button-start-filtered-case" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--mint)] px-4 py-3 text-sm font-extrabold text-[var(--ink)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50">
                {phase === 'active' ? 'Case underway' : revisionMode ? 'Start revision case' : 'Start random case'} <Play size={16} fill="currentColor" />
             </button>
          </section>
        </div>

        {phase === 'active' && dummyCase && (
          <section className="mt-6">
            <PlaceholderNotice>
              This is a fictional educational patient. Use the scenario to practise prioritisation; it is not medical advice or a replacement for current clinical protocols.
            </PlaceholderNotice>
            <div className="surface-card mt-6 rounded-2xl p-6 md:p-8">
              <div className="flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-start">
                <div>
                  <p className="eyebrow">Active case · {level.title}</p>
                  <h3 className="mt-2 text-2xl font-extrabold tracking-[-.05em] text-[var(--ink)]">Case details are revealed through your questions.</h3>
                </div>
                <span className="flex w-fit items-center gap-2 rounded-full bg-[var(--paper-deep)] px-3 py-1.5 text-xs font-extrabold text-[var(--teal)]">
                  <Eye size={14} /> Title hidden
                </span>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
                <div>
                  <div className="rounded-xl bg-[var(--paper-deep)] p-5">
                    <p className="mono-label text-[var(--teal)]">Triage statement</p>
                    <p className="mt-3 text-base font-extrabold leading-7 text-[var(--ink)]">{dummyCase.triage}</p>
                  </div>
                  <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/55 p-5">
                    <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]"><Eye size={16} className="text-[var(--teal)]" /> Patient appearance</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{dummyCase.appearance}</p>
                    <p className="mt-4 border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--ink)]">Current condition:</strong> {condition}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white/55 p-5">
                  <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]"><HeartPulse size={16} className="text-[var(--coral)]" /> Initial vital signs</p>
                  <div className="mt-4"><VitalSigns vitals={currentVitals} /></div>
                </div>
              </div>
              {messages.length > 0 && (
                <div className="mt-6 space-y-3 border-t border-[var(--line)] pt-6">
                  <p className="eyebrow">Case response log</p>
                  {messages.map((message, index) => (
                    <div key={`${message.kind}-${index}`} className={`flex gap-3 rounded-xl p-4 text-sm leading-6 ${message.kind === 'student' ? 'ml-5 bg-[var(--ink)] text-[#eaf6f0]' : 'mr-5 bg-[var(--paper-deep)] text-[var(--ink-soft)]'}`}>
                      <span className="mono-label shrink-0 text-[var(--teal)]">{message.kind === 'student' ? 'You' : 'Patient'}</span>
                      <p>{message.text}</p>
                    </div>
                  ))}
                </div>
              )}
              {activeLevelId === 'guided' && (
                <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--paper-deep)] p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-extrabold text-[var(--ink)]">What would you like to do next?</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">Choose a category, or type your own specific action below.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => runAction('hint')}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--teal)] bg-white px-3 py-2 text-xs font-extrabold text-[var(--teal)]"
                      data-testid="button-guided-hint"
                    >
                      <CircleHelp size={15} /> Ask for a hint
                    </button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {guidedChoices.map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => runAction(rule.keywords[0] || rule.id)}
                        className="rounded-xl border border-[var(--line)] bg-white/80 px-3 py-3 text-left text-xs font-extrabold leading-5 text-[var(--ink)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
                        data-testid={`button-guided-choice-${rule.id}`}
                      >
                        {guidedActionLabels[rule.id]}
                      </button>
                    ))}
                  </div>
                  {!guidedChoices.length && (
                    <p className="mt-4 text-xs font-semibold text-[var(--teal)]">You have completed every guided action category. Reassess anything you need, then end the case when ready.</p>
                  )}
                </div>
              )}
              <form onSubmit={submitAction} className="mt-6 border-t border-[var(--line)] pt-6">
                <label htmlFor="case-action" className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink)]">
                  <Send size={16} className="text-[var(--teal)]" /> What do you do?
                </label>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <textarea
                    id="case-action"
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                    placeholder="Type an action or ask for information..."
                    rows={3}
                    data-testid="textarea-case-action"
                    className="min-h-[84px] flex-1 resize-y rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--mint)]"
                  />
                  <button type="submit" data-testid="button-submit-case-action" className="inline-flex h-fit items-center justify-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5">
                    Submit action <ArrowRight size={16} />
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                  Use natural clinical wording—the simulator accepts broad phrasing and common action categories. Information appears after a relevant request.
                </p>
              </form>
              <div className="mt-6 flex flex-col justify-between gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center">
                <p className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-soft)]"><Thermometer size={15} /> Vital signs and condition may change after recognised actions.</p>
                <button type="button" onClick={endCase} data-testid="button-end-case" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#c8584b] bg-[#fff4f1] px-4 py-3 text-sm font-extrabold text-[#a6463b] transition-colors hover:bg-[#ffe8e2]">
                  End Case <CheckCircle2 size={16} />
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === 'complete' && dummyCase && feedback && (
          <>
            <CaseFeedback level={level} dummyCase={dummyCase} feedback={feedback} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/done-cases" data-testid="link-case-done-cases" className="inline-flex items-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white">
                View Done Cases <ArrowRight size={16} />
              </Link>
              {remainingCases.length > 0 && (
                <button type="button" onClick={beginAnotherCase} data-testid="button-next-placeholder-case" className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm font-extrabold text-[var(--ink)]">
                  Next case <RefreshCcw size={16} />
                </button>
              )}
            </div>
          </>
        )}

        {phase === 'empty' && (
          <section className="surface-card mt-6 rounded-2xl p-7 text-center md:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--paper-deep)] text-[var(--teal)]">
              <CheckCircle2 size={28} />
            </div>
             <h3 className="mt-5 text-2xl font-extrabold tracking-[-.05em] text-[var(--ink)]">No unfinished case matches this pool.</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--ink-soft)]">
               Try another lecture pool, or return to levels. Completed cases are always excluded from random selection.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
               <button type="button" onClick={() => setPhase('select')} className="inline-flex items-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white">
                 Change lecture pool <SlidersHorizontal size={16} />
               </button>
               <Link href="/done-cases" className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm font-extrabold text-[var(--ink)]">
                 View Done Cases <ArrowRight size={16} />
               </Link>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

export function LecturesPage() {
  const { progress, setLectureStatus } = useDemoProgress();
  const studiedCount = lectureNames.filter((lecture) => progress.lectureStatuses[lecture] === 'Studied').length;
  const revisionCount = lectureNames.filter((lecture) => progress.lectureStatuses[lecture] === 'Needs Revision').length;
  const completionPercent = lectureNames.length ? Math.round((studiedCount / lectureNames.length) * 100) : 0;

  return (
    <AppShell pageTitle="Lectures" pageKicker="Your study map">
      <div className="rise-in">
        <div className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Fifteen lecture threads"
            title="Keep your map honest."
            description="Mark what you have covered, then use the case selector to practise only the lectures that need your attention."
          />
          <Link href="/levels" className="inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-extrabold text-[#f3faf6]">
            Start a case <ArrowRight size={16} />
          </Link>
        </div>
        <PlaceholderNotice>
          Lecture names are the only case tags. Statuses are saved in this browser; they are not a record of validated clinical learning.
        </PlaceholderNotice>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-[var(--ink)] p-5 text-[#eef8f3]">
            <p className="mono-label text-[#9fc9be]">Studied</p>
            <p className="mt-2 text-3xl font-extrabold tracking-[-.06em]">{studiedCount}<span className="ml-1 text-base font-semibold text-[#9fc9be]">/ {lectureNames.length}</span></p>
          </div>
          <div className="surface-card rounded-2xl p-5">
            <p className="mono-label text-[var(--ink-soft)]">Percent complete</p>
            <p className="mt-2 text-3xl font-extrabold tracking-[-.06em] text-[var(--teal)]">{completionPercent}%</p>
          </div>
          <div className="surface-card rounded-2xl p-5">
            <p className="mono-label text-[var(--ink-soft)]">Needs revision</p>
            <p className="mt-2 text-3xl font-extrabold tracking-[-.06em] text-[#a37b1b]">{revisionCount}</p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {lectureNames.map((lecture, index) => {
            const status = progress.lectureStatuses[lecture] || 'Not Studied';
            const statusClass = status === 'Studied'
              ? 'bg-[var(--mint)] text-[var(--teal)]'
              : status === 'Needs Revision'
                ? 'bg-[#fff1c9] text-[#8a6b17]'
                : 'bg-[var(--paper-deep)] text-[var(--ink-soft)]';
            return (
              <article key={lecture} className="surface-card flex items-center gap-4 rounded-2xl p-4 md:p-5">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${statusClass}`}>0{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-extrabold leading-5 text-[var(--ink)]">{lecture}</h2>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold ${statusClass}`}>{status}</span>
                </div>
                <label className="shrink-0">
                  <span className="sr-only">Status for {lecture}</span>
                  <select
                    value={status}
                    onChange={(event) => setLectureStatus(lecture, event.target.value as LectureStatus)}
                    data-testid={`select-lecture-status-${index + 1}`}
                    className="max-w-[132px] rounded-xl border border-[var(--line)] bg-white/80 px-2 py-2 text-xs font-bold text-[var(--ink)] outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--mint)]"
                  >
                    <option>Not Studied</option>
                    <option>Studied</option>
                    <option>Needs Revision</option>
                  </select>
                </label>
              </article>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

export function DoneCasesPage() {
  const { progress } = useDemoProgress();
  const [lectureFilter, setLectureFilter] = useState('All Lectures');
  const filteredCases = lectureFilter === 'All Lectures'
    ? progress.completedCases
    : progress.completedCases.filter((completedCase) => completedCase.lecture === lectureFilter);
  return (
    <AppShell pageTitle="Done cases" pageKicker="Your library">
      <div className="rise-in">
        <SectionHeading
          eyebrow="Completed work"
          title={progress.completedCases.length ? 'Your completed case record.' : 'A clear page, for now.'}
          description="Cases you complete collect here so you can revisit feedback and track your progress."
        />
        <PlaceholderNotice>
          Every patient is fictional and intended for educational practice.
        </PlaceholderNotice>
        <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/55 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-[var(--ink)]">Filter by lecture</p>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">Show completed cases linked to one lecture.</p>
          </div>
          <label>
            <span className="sr-only">Filter done cases by lecture</span>
            <select
              value={lectureFilter}
              onChange={(event) => setLectureFilter(event.target.value)}
              data-testid="select-done-cases-lecture"
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-bold text-[var(--ink)] outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[var(--mint)] sm:w-auto"
            >
              <option>All Lectures</option>
              {lectureNames.map((lecture) => <option key={lecture}>{lecture}</option>)}
            </select>
          </label>
        </div>
        {progress.completedCases.length === 0 ? (
          <div className="surface-card mt-9 flex min-h-[360px] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
            <div className="relative mb-7 flex h-20 w-20 items-center justify-center rounded-[26px] bg-[var(--paper-deep)] text-[var(--teal)]">
              <CheckCircle2 size={34} strokeWidth={1.7} />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--coral)]" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-[-.05em] text-[var(--ink)]">Nothing completed yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--ink-soft)]">When you finish a case, it will appear here with its level and feedback.</p>
            <Link href="/levels" data-testid="link-empty-browse-levels" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[var(--teal)] px-4 py-3 text-sm font-extrabold text-white transition-transform hover:-translate-y-0.5">
              Choose a level <ArrowRight size={16} />
            </Link>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="surface-card mt-9 flex min-h-[260px] flex-col items-center justify-center rounded-2xl px-6 py-12 text-center">
            <BookOpen size={30} className="text-[var(--teal)]" />
            <h2 className="mt-4 text-xl font-extrabold tracking-[-.04em] text-[var(--ink)]">No completed cases for this lecture</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--ink-soft)]">Choose another lecture above, or finish a matching case to build this part of your record.</p>
          </div>
        ) : (
          <div className="mt-9 space-y-4">
            {filteredCases.map((completedCase) => (
              <article key={`${completedCase.levelId}-${completedCase.caseId}`} className="surface-card rounded-2xl p-5 md:p-7">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="eyebrow">{levels[completedCase.levelId].title} · completed case</p>
                    <h2 className="mt-2 text-xl font-extrabold tracking-[-.04em] text-[var(--ink)]">{completedCase.title}</h2>
                    <p className="mt-2 text-xs font-semibold text-[var(--ink-soft)]">Completed in demo mode · {new Date(completedCase.completedAt).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs font-extrabold text-[var(--ink)]">{completedCase.feedback.score}</span>
                </div>
                <div className="mt-5 flex items-center gap-2 border-t border-[var(--line)] pt-5 text-sm font-extrabold text-[var(--teal)]">
                  <BookOpen size={16} /> {completedCase.lecture}
                </div>
                <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 md:grid-cols-2">
                  <div>
                    <p className="mono-label text-[var(--ink-soft)]">Final diagnosis</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink)]">{completedCase.feedback.diagnosis}</p>
                  </div>
                  <div>
                    <p className="mono-label text-[var(--ink-soft)]">Ideal approach</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{completedCase.feedback.idealApproach}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function RevisionPage() {
  const { progress } = useDemoProgress();
  const levelStates = (['guided', 'independent', 'challenge'] as LevelId[]).map((id) => {
    const completed = progress.completedCases.filter((entry) => entry.levelId === id).length;
    return { id, completed, unlocked: allCases.length > 0 && completed === allCases.length };
  });
  const anyUnlocked = levelStates.some((item) => item.unlocked);
  return (
    <AppShell pageTitle="Revision Mode" pageKicker="Consolidate your learning">
      <div className="rise-in">
        <SectionHeading
          eyebrow={anyUnlocked ? 'A level is ready' : 'Locked for now'}
          title={anyUnlocked ? 'Revision is opening up.' : 'Revision will meet you later.'}
          description="Revision Mode unlocks after all uploaded cases in a mode are completed."
        />
        <PlaceholderNotice>
          Completed cases remain available in Done Cases. Unlocked levels can also replay a random case here without changing completion totals.
        </PlaceholderNotice>
        <div className="mt-9 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <section className="rounded-2xl bg-[var(--ink)] p-7 text-[#eaf6f0] md:p-9">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#315a60] text-[var(--mint)]">
              {anyUnlocked ? <CheckCircle2 size={25} /> : <LockKeyhole size={25} />}
            </div>
            <p className="mono-label mt-12 text-[#9fc9be]">Unlock condition</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-.05em]">
              {anyUnlocked ? 'A full level is complete.' : 'Complete a full level.'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#b8d2ca]">
              {anyUnlocked
                ? 'You have completed all uploaded cases in at least one mode.'
                : 'Finish all uploaded cases in Guided, Independent, or Challenge to unlock that mode.'}
            </p>
            <div className="mt-8 h-2 rounded-full bg-[#315a60]">
              <div className="h-full rounded-full bg-[var(--mint)]" style={{ width: `${allCases.length ? Math.max(...levelStates.map((item) => item.completed)) / allCases.length * 100 : 0}%` }} />
            </div>
            <p className="mono-label mt-3 text-[#9fc9be]">Best level progress: {Math.max(...levelStates.map((item) => item.completed))} / {allCases.length}</p>
          </section>
          <section className="surface-card rounded-2xl p-6 md:p-9">
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={18} className="text-[var(--teal)]" />
              <p className="eyebrow">Level access</p>
            </div>
            <div className="mt-7 divide-y divide-[var(--line)]">
              {levelStates.map(({ id, completed, unlocked }) => (
                <div key={id} className="flex items-center gap-4 py-5 first:pt-0 last:pb-0">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${unlocked ? 'bg-[var(--mint)] text-[var(--teal)]' : 'bg-[var(--paper-deep)] text-[var(--ink-soft)]'}`}>
                    {unlocked ? <CheckCircle2 size={19} /> : <LockKeyhole size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-[var(--ink)]">{levels[id].title} revision</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                      {unlocked ? 'Unlocked after completing all uploaded cases.' : `Locked · ${completed} / ${allCases.length} cases complete.`}
                    </p>
                  </div>
                  {unlocked ? (
                    <Link
                      href={`/levels/${id}?revision=1`}
                      className="rounded-full bg-[var(--mint)] px-3 py-1.5 text-[10px] font-extrabold text-[var(--teal)]"
                    >
                      Start revision
                    </Link>
                  ) : (
                    <span className="rounded-full bg-[var(--paper-deep)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--ink-soft)]">
                      Locked
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
        <Link href="/levels" data-testid="link-revision-view-levels" className="mt-6 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--teal)]">
          View your levels <ArrowRight size={16} />
        </Link>
      </div>
    </AppShell>
  );
}

export function ProfilePage() {
  const { progress, resetProgress } = useDemoProgress();
  const [notifications, setNotifications] = useState(true);
  const [compact, setCompact] = useState(false);
  return (
    <AppShell pageTitle="Profile & preferences" pageKicker="Demo account">
      <div className="rise-in">
        <SectionHeading
          eyebrow="Your workspace"
          title="Set the room around your learning."
          description="These preferences and your case progress are saved locally in this browser."
        />
        <div className="mt-9 grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
          <section className="surface-card rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--coral)] text-xl font-extrabold text-[var(--ink)]">DS</span>
              <div>
                <h2 className="text-lg font-extrabold tracking-[-.04em] text-[var(--ink)]">Demo Student</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">Medical student · Demo account</p>
              </div>
            </div>
            <div className="mt-8 border-t border-[var(--line)] pt-5">
              <p className="mono-label text-[var(--ink-soft)]">Cases completed</p>
              <p className="mt-2 text-sm font-bold text-[var(--ink)]">{progress.completedCases.length} completed cases</p>
            </div>
            <div className="mt-5 border-t border-[var(--line)] pt-5">
              <p className="mono-label text-[var(--ink-soft)]">Progress stored</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[var(--teal)]"><Check size={15} /> In this browser</p>
            </div>
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <p className="text-sm font-extrabold text-[var(--ink)]">Progress controls</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">Clear completed cases and reset all lecture statuses and levels.</p>
              <button type="button" onClick={resetProgress} data-testid="button-reset-demo-progress" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#c8584b] bg-[#fff4f1] px-4 py-3 text-sm font-extrabold text-[#a6463b] transition-colors hover:bg-[#ffe8e2]">
                <RotateCcw size={15} /> Reset All Progress
              </button>
            </div>
          </section>
          <section className="surface-card rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-3 border-b border-[var(--line)] pb-5">
              <Settings2 size={19} className="text-[var(--teal)]" />
              <div>
                <h2 className="text-lg font-extrabold tracking-[-.04em] text-[var(--ink)]">Preferences</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">Make the simulator feel like yours.</p>
              </div>
            </div>
            <div className="divide-y divide-[var(--line)]">
              <label className="flex cursor-pointer items-center justify-between gap-5 py-5" data-testid="label-preference-notifications">
                <span>
                  <span className="block text-sm font-extrabold text-[var(--ink)]">Session reminders</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--ink-soft)]">Keep a gentle nudge available for your next session.</span>
                </span>
                <input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} data-testid="input-preference-notifications" className="h-5 w-5 accent-[var(--teal)]" />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-5 py-5" data-testid="label-preference-compact">
                <span>
                  <span className="block text-sm font-extrabold text-[var(--ink)]">Compact case list</span>
                  <span className="mt-1 block text-sm leading-5 text-[var(--ink-soft)]">Use a tighter layout when your case library arrives.</span>
                </span>
                <input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} data-testid="input-preference-compact" className="h-5 w-5 accent-[var(--teal)]" />
              </label>
            </div>
            <div className="mt-2 flex items-start gap-3 rounded-xl bg-[var(--paper-deep)] p-4 text-xs leading-5 text-[var(--ink-soft)]">
              <Info size={15} className="mt-0.5 shrink-0 text-[var(--teal)]" />
               <span>There is no sign-in or synced account. Resetting clears this browser’s case progress and lecture statuses.</span>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
