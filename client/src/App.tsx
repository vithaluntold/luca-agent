import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import FinACEverseBadge from "@/components/FinACEverseBadge";
import Landing from "@/pages/Landing";
import Chat from "@/pages/Chat";
import Auth from "@/pages/Auth";
import Settings from "@/pages/Settings";
import Integrations from "@/pages/Integrations";
import ScenarioSimulator from "@/pages/ScenarioSimulator";
import DeliverableComposer from "@/pages/DeliverableComposer";
import ForensicIntelligence from "@/pages/ForensicIntelligence";
import Pricing from "@/pages/Pricing";
import Features from "@/pages/Features";
import About from "@/pages/About";
import Support from "@/pages/Support";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import API from "@/pages/API";
import Docs from "@/pages/Docs";
import Blog from "@/pages/Blog";
import Careers from "@/pages/Careers";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminCoupons from "@/pages/admin/Coupons";
import AdminLayout from "@/components/AdminLayout";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/chat" component={Chat} />
      <Route path="/auth" component={Auth} />
      <Route path="/settings" component={Settings} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/scenarios" component={ScenarioSimulator} />
      <Route path="/deliverables" component={DeliverableComposer} />
      <Route path="/forensics" component={ForensicIntelligence} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/features" component={Features} />
      <Route path="/about" component={About} />
      <Route path="/support" component={Support} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/api" component={API} />
      <Route path="/docs" component={Docs} />
      <Route path="/blog" component={Blog} />
      <Route path="/careers" component={Careers} />
      <Route path="/admin">
        <AdminLayout>
          <AdminDashboard />
        </AdminLayout>
      </Route>
      <Route path="/admin/coupons">
        <AdminLayout>
          <AdminCoupons />
        </AdminLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <FinACEverseBadge />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
