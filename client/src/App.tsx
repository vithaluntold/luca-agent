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
