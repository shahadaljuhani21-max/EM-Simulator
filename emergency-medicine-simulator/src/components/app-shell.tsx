import { type ReactNode } from 'react';
import { Activity, BookOpen, CheckCircle2, Home, Layers3, LockKeyhole, Stethoscope, UserRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useCasePack } from '@/lib/case-pack-store';

type AppShellProps = {
  children: ReactNode;
  pageTitle: string;
  pageKicker?: string;
};

const navigation = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
  { href: '/levels', label: 'Levels', shortLabel: 'Levels', icon: Layers3 },
  { href: '/lectures', label: 'Lectures', shortLabel: 'Lectures', icon: BookOpen },
  { href: '/done-cases', label: 'Done Cases', shortLabel: 'Done', icon: CheckCircle2 },
  { href: '/revision', label: 'Revision Mode', shortLabel: 'Revision', icon: LockKeyhole },
  { href: '/profile', label: 'Profile', shortLabel: 'Profile', icon: UserRound },
];

function BrandMark() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mint)] text-[var(--ink)] shadow-sm">
      <Activity size={21} strokeWidth={2.5} />
    </span>
  );
}

export function AppShell({ children, pageTitle, pageKicker = 'Clinical simulator' }: AppShellProps) {
  const [location] = useLocation();
  const { pack, error } = useCasePack();

  return (
    <div className="app-shell flex min-h-[100dvh]">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-[var(--ink)] px-5 py-6 text-[var(--sidebar-foreground)] md:flex">
        <Link href="/dashboard" className="mb-12 flex items-center gap-3" data-testid="link-brand-dashboard">
          <BrandMark />
          <span>
            <span className="block text-[15px] font-extrabold tracking-[-.04em] text-[#f1faf5]">EMC Simulator</span>
            <span className="mono-label mt-1 block text-[#9fc9be]">Learn under pressure</span>
          </span>
        </Link>
        <p className="mono-label mb-3 px-3 text-[#7da79f]">Workspace</p>
        <nav className="space-y-1" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/dashboard'
              ? location === '/dashboard'
              : location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${
                  active
                    ? 'bg-[#315a60] text-[#f4fbf6] shadow-[inset_3px_0_0_var(--mint)]'
                    : 'text-[#aacbc3] hover:bg-[#254b54] hover:text-[#f4fbf6]'
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span>{item.label}</span>
                {item.href === '/revision' && <span className="ml-auto rounded-full bg-[#24434e] px-2 py-0.5 text-[10px] font-bold text-[#9fc9be]">Soon</span>}
              </Link>
            );
          })}
        </nav>
        <Link href="/case-packs" className="my-4 rounded-xl border border-[#7da79f] px-3 py-3 text-sm font-bold text-[#eaf6f0] hover:bg-[#315a60]">
          Upload Case Pack
        </Link>
        <div className="mt-auto rounded-2xl border border-[#3a6064] bg-[#214650] p-4">
          <div className="mb-3 flex items-center gap-2 text-[#b9e3d1]">
            <Stethoscope size={16} />
            <span className="mono-label">Demo workspace</span>
          </div>
          <p className="text-sm leading-5 text-[#d2e7df]">A quiet place to build clinical confidence.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] items-center justify-between border-b border-[var(--line)] bg-[rgba(242,248,245,.78)] px-5 backdrop-blur md:px-10">
          <div>
            <p className="eyebrow">{pageKicker}</p>
            <h1 className="mt-1 text-lg font-extrabold tracking-[-.04em] text-[var(--ink)] md:text-xl">{pageTitle}</h1>
          </div>
          <Link href="/case-packs" className="ml-auto mr-3 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--teal)] md:hidden">Upload Case Pack</Link>
          <Link href="/profile" className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-white" data-testid="link-header-profile">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--coral)] text-sm font-extrabold text-[var(--ink)]">DS</span>
            <span className="hidden text-left sm:block">
              <span className="block text-xs font-bold text-[var(--ink)]">Demo Student</span>
              <span className="mono-label mt-0.5 block text-[var(--ink-soft)]">Demo account</span>
            </span>
          </Link>
        </header>
        <main className="w-full flex-1 px-5 pb-28 pt-7 md:px-10 md:pb-10 md:pt-9">
          <div className="mx-auto w-full max-w-[1180px]">
            {location !== '/case-packs' && (!pack || error) && (
              <div className="mb-6 rounded-xl border border-[var(--line)] bg-white/70 p-4 text-sm" role="status">
                {error || 'No case pack loaded. Upload a JSON case pack to populate the lectures and cases.'}
                {' '}<Link href="/case-packs" className="font-bold text-[var(--teal)] underline">Upload Case Pack</Link>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-[var(--line)] bg-[rgba(250,253,251,.94)] px-1 pt-2 shadow-[0_-8px_28px_rgba(27,64,74,.08)] backdrop-blur md:hidden" aria-label="Mobile navigation">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/dashboard'
            ? location === '/dashboard'
            : location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`link-mobile-${item.shortLabel.toLowerCase()}`}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center text-[10px] font-bold transition-colors ${
                active ? 'text-[var(--teal)]' : 'text-[var(--ink-soft)]'
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 1.8} />
              <span className="truncate">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
