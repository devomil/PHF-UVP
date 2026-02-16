import { Router, Route, Switch } from "wouter";
import { useAuth, AuthProvider } from "@/hooks/use-auth";
import { useFontLoader } from "@/hooks/use-font-loader";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import AssetLibrary from "@/pages/asset-library";
import BrandSettings from "@/pages/brand-settings";
import RenderQueue from "@/pages/render-queue";
import Providers from "@/pages/providers";
import Profile from "@/pages/profile";
import NewProject from "@/pages/new-project";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/layout/app-layout";

function AuthenticatedApp() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/projects" component={Projects} />
        <Route path="/projects/new" component={NewProject} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/assets" component={AssetLibrary} />
        <Route path="/brand" component={BrandSettings} />
        <Route path="/render-queue" component={RenderQueue} />
        <Route path="/providers" component={Providers} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function UnauthenticatedApp() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route component={Landing} />
    </Switch>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  useFontLoader();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "var(--app-bg)" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <AuthenticatedApp /> : <UnauthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <AppRouter />
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
