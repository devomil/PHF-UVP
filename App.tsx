import { Router, Route, Switch } from "wouter";
import { useAuth, AuthProvider } from "@/hooks/use-auth";
import { useFontLoader } from "@/hooks/use-font-loader";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/protected-route";
import AuthPage from "@/pages/auth-page";
import HomeDashboard from "@/pages/home-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import Documents from "@/pages/documents";
import EmployeeDocuments from "@/pages/employee-documents";
import LogosPage from "@/pages/admin/logos";
import AdminEmployeesPage from "@/pages/admin/employees";
import AdminEmployeePurchases from "@/pages/admin/admin-employee-purchases";
import AdminEmployeeContentPage from "@/pages/admin/employee-content";
import CommunicationsPage from "@/pages/communications";
import Calendar from "@/pages/calendar";
import Employees from "@/pages/employees";
import TimeManagement from "@/pages/time-management";
import ShiftScheduling from "@/pages/shift-scheduling";
import ShiftSwapMarketplace from "@/pages/shift-swap-marketplace";
import Training from "@/pages/training";
import TrainingModule from "@/pages/training-module";
import AdminTraining from "@/pages/admin-training";
import AdminTrainingCollections from "@/pages/admin-training-collections";
import TrainingReports from "@/pages/training-reports";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import Notifications from "@/pages/notifications";
import TimeClock from "@/pages/time-clock";
import Schedule from "@/pages/schedule";
import TimeOff from "@/pages/time-off";
import ShiftCoverage from "@/pages/shift-coverage";
import SystemSupport from "@/pages/system-support";
import EmployeeSupport from "@/pages/employee-support";
import UserManagement from "@/pages/user-management";
import AccountingDashboard from "@/pages/accounting-dashboard";
import IntegrationsPage from "@/pages/integrations-page";
import MarketingPage from "@/pages/marketing-page";
import InventoryPage from "@/pages/inventory";
import OrdersPage from "@/pages/orders";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import EmergencyContactPage from "@/pages/emergency-contact";
import EmployeePurchases from "@/pages/employee-purchases";
import Tasks from "@/pages/tasks";
import Goals from "@/pages/goals";
import PurchasingPage from "@/pages/purchasing";
import MarketplacePage from "@/pages/marketplace";
import OrderFulfillmentPage from "@/pages/order-fulfillment";
import PractitionerDashboard from "@/pages/practitioner-dashboard";

function AuthenticatedApp() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  
  return (
    <Switch>
      <Route path="/" component={isAdmin ? AdminDashboard : HomeDashboard} />
      <Route path="/dashboard" component={HomeDashboard} />
      
      {/* Admin/Manager Only Routes */}
      <Route path="/admin-dashboard">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/dashboard">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/employees">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminEmployeesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/employees/purchases">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminEmployeePurchases />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/employee-content">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminEmployeeContentPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/training">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminTraining />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/training/collections">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AdminTrainingCollections />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/training-reports">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <TrainingReports />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/logos">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <LogosPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/accounting">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AccountingDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/integrations">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <IntegrationsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/marketing">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <MarketingPage />
        </ProtectedRoute>
      </Route>
      <Route path="/shift-scheduling">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <ShiftScheduling />
        </ProtectedRoute>
      </Route>
      <Route path="/time-management">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <TimeManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/employees">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Employees />
        </ProtectedRoute>
      </Route>
      <Route path="/reports">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Reports />
        </ProtectedRoute>
      </Route>
      <Route path="/system-support">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <SystemSupport />
        </ProtectedRoute>
      </Route>
      <Route path="/user-management">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <UserManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/accounting">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AccountingDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/inventory">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <InventoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/orders">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <OrdersPage />
        </ProtectedRoute>
      </Route>
      <Route path="/purchasing">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <PurchasingPage />
        </ProtectedRoute>
      </Route>
      <Route path="/integrations">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <IntegrationsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/marketplace">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <MarketplacePage />
        </ProtectedRoute>
      </Route>
      <Route path="/marketplace/orders/:id/fulfill">
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <OrderFulfillmentPage />
        </ProtectedRoute>
      </Route>
      
      {/* Practitioner Dashboard - All Roles */}
      <Route path="/practitioner" component={PractitionerDashboard} />
      <Route path="/practitioner-dashboard" component={PractitionerDashboard} />
      
      {/* Employee & Shared Routes */}
      <Route path="/calendar" component={Calendar} />
      <Route path="/shift-swaps" component={ShiftSwapMarketplace} />
      <Route path="/communication" component={CommunicationsPage} />
      <Route path="/employee/documents" component={EmployeeDocuments} />
      <Route path="/training" component={Training} />
      <Route path="/training/module/:id" component={TrainingModule} />
      <Route path="/profile" component={Profile} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/documents" component={Documents} />
      <Route path="/announcements" component={CommunicationsPage} />
      <Route path="/communications" component={CommunicationsPage} />
      <Route path="/time-clock" component={TimeClock} />
      <Route path="/schedule" component={Schedule} />
      <Route path="/time-off" component={TimeOff} />
      <Route path="/shift-coverage" component={ShiftCoverage} />
      <Route path="/team-communication" component={CommunicationsPage} />
      <Route path="/support" component={EmployeeSupport} />
      <Route path="/employee-purchases" component={EmployeePurchases} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/goals" component={Goals} />
      <Route path="/emergency-contact" component={EmergencyContactPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UnauthenticatedApp() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/emergency-contact" component={EmergencyContactPage} />
      <Route component={Landing} />
    </Switch>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // Initialize font loading for consistent branding
  useFontLoader();

  if (import.meta.env.DEV) console.log('Auth state:', { isAuthenticated, isLoading, user });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV) console.log('Rendering:', isAuthenticated ? 'AuthenticatedApp' : 'UnauthenticatedApp');
  
  if (isAuthenticated && user) {
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
