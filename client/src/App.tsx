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
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function AuthenticatedApp() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/assets" component={AssetLibrary} />
      <Route path="/brand" component={BrandSettings} />
      <Route path="/render-queue" component={RenderQueue} />
      <Route path="/providers" component={Providers} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
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
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
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
