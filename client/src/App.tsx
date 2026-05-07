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
import TrendsDashboard from "@/pages/trends-dashboard";
import SocialHub from "@/pages/social-hub";
import SocialCalendar from "@/pages/social-calendar";
import SocialNewPost from "@/pages/social-new-post";
import SocialAccounts from "@/pages/social-accounts";
import ApiTesting from "@/pages/api-testing";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import BillingPage from "@/pages/billing";
import BillingTransactionsPage from "@/pages/billing-transactions";
import PricingPage from "@/pages/pricing";
import FeaturesPage from "@/pages/features";
import AIModelsPage from "@/pages/ai-models";
import ContactSalesPage from "@/pages/contact-sales";
import AppLayout from "@/components/layout/app-layout";
import AdminDashboard from "@/pages/admin/admin-dashboard";
import AdminUsers from "@/pages/admin/admin-users";
import AdminProjects from "@/pages/admin/admin-projects";
import AdminCosts from "@/pages/admin/admin-costs";
import AdminActivity from "@/pages/admin/admin-activity";

function AccessDenied() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center p-8">
        <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Access Denied</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>You don't have permission to access this page.</p>
      </div>
    </div>
  );
}

function AdminGuard({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <AppLayout>
        <AccessDenied />
      </AppLayout>
    );
  }
  return <Component />;
}

function InlineAdminGuard({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <AccessDenied />;
  return <Component />;
}

function AuthenticatedApp() {
  return (
    <Switch>
      <Route path="/admin" component={() => <AdminGuard component={AdminDashboard} />} />
      <Route path="/admin/users" component={() => <AdminGuard component={AdminUsers} />} />
      <Route path="/admin/projects" component={() => <AdminGuard component={AdminProjects} />} />
      <Route path="/admin/costs" component={() => <AdminGuard component={AdminCosts} />} />
      <Route path="/admin/activity" component={() => <AdminGuard component={AdminActivity} />} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/ai-models" component={AIModelsPage} />
      <Route path="/contact-sales" component={ContactSalesPage} />
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/projects" component={Projects} />
            <Route path="/projects/new" component={NewProject} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/assets" component={AssetLibrary} />
            <Route path="/brand" component={BrandSettings} />
            <Route path="/trends" component={TrendsDashboard} />
            <Route path="/social" component={SocialHub} />
            <Route path="/social/calendar" component={SocialCalendar} />
            <Route path="/social/accounts" component={SocialAccounts} />
            <Route path="/social/new" component={SocialNewPost} />
            <Route path="/render-queue" component={RenderQueue} />
            <Route path="/providers" component={() => <InlineAdminGuard component={Providers} />} />
            <Route path="/api-testing" component={() => <InlineAdminGuard component={ApiTesting} />} />
            <Route path="/profile" component={Profile} />
            <Route path="/billing" component={BillingPage} />
            <Route path="/billing/transactions" component={BillingTransactionsPage} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function UnauthenticatedApp() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/ai-models" component={AIModelsPage} />
      <Route path="/contact-sales" component={ContactSalesPage} />
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
