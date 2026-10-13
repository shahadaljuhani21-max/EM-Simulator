import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { CaseStudioPage } from '@/pages/case-studio';
import { CasePackUploadPage, CasePackPlayerPage } from '@/pages/case-pack-pages';
import { useCasePack, packIdentity } from '@/lib/case-pack-store';
import {
  DashboardPage,
  DoneCasesPage,
  LecturesPage,
  LevelsPage,
  ProfilePage,
  RevisionPage,
  WelcomePage,
} from '@/pages/simulator-pages';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  return <WelcomePage />;
}

function Router() {
  useCasePack();
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary key={packIdentity()}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/levels" component={LevelsPage} />
        <Route path="/levels/:levelId" component={CasePackPlayerPage} />
        <Route path="/case-packs" component={CasePackUploadPage} />
        <Route path="/lectures" component={LecturesPage} />
        <Route path="/done-cases" component={DoneCasesPage} />
        <Route path="/revision" component={RevisionPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/case-studio" component={CaseStudioPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
