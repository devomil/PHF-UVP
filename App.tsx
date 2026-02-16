import { Router, Route, Switch } from "wouter";
import { useAuth, AuthProvider } from "@/hooks/use-auth";
import { useFontLoader } from "@/hooks/use-font-loader";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/protected-route";

function AuthenticatedApp() {
  return (
    <Switch>
      <Route path="/" component={() => <div>Video Production Dashboard</div>} />
      <Route path="/dashboard" component={() => <div>Video Production Dashboard</div>} />
      <Route path="/projects" component={() => <div>Projects List</div>} />
      <Route path="/settings" component={() => <div>Settings</div>} />
      <Route component={() => <div>Page not found</div>} />
    </Switch>
  );
}

function UnauthenticatedApp() {
  return (
    <Switch>
      <Route path="/" component={() => <div>Welcome to Video Production Platform</div>} />
      <Route component={() => <div>Page not found</div>} />
    </Switch>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();

  useFontLoader();

  if (import.meta.env.DEV) console.log('Auth state:', { isAuthenticated, isLoading });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV) console.log('Rendering:', isAuthenticated ? 'AuthenticatedApp' : 'UnauthenticatedApp');

  if (isAuthenticated) {
    return <AuthenticatedApp />;
  } else {
    return <UnauthenticatedApp />;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppRouter />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
