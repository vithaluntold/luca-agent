import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ArrowRight, Sparkles, CheckCircle2, PanelsTopLeft, FileText, BarChart3 } from "lucide-react";
import chatDashboardImg from "@assets/generated_images/Chat_interface_dashboard_screenshot_b7283c51.png";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-24">
      {/* Sophisticated gradient mesh background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-chart-2/10" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-chart-2/20 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      
      <div className="relative max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Copy & CTAs */}
          <div className="space-y-8 lg:space-y-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass border-primary/30">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold gradient-text">Accounting Superintelligence</span>
            </div>
            
            {/* Headline */}
            <h1 className="text-5xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
              Beyond Chat.{" "}
              <span className="gradient-text">
                True Intelligence.
              </span>
            </h1>
            
            {/* Subheadline */}
            <p className="text-xl text-foreground/80 leading-relaxed max-w-xl">
              3-pane workspace • Professional modes • Document analysis • Interactive visualizations • Export to 6 formats
            </p>
            
            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="px-4 py-2 gap-2">
                <PanelsTopLeft className="w-4 h-4" />
                Resizable 3-Pane Layout
              </Badge>
              <Badge variant="secondary" className="px-4 py-2 gap-2">
                <FileText className="w-4 h-4" />
                Document Intelligence
              </Badge>
              <Badge variant="secondary" className="px-4 py-2 gap-2">
                <BarChart3 className="w-4 h-4" />
                Live Visualizations
              </Badge>
            </div>
            
            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link href="/auth">
                <Button 
                  size="lg" 
                  className="gap-2 h-12 px-8 text-base bg-accent hover:bg-accent/90 glow-accent transition-smooth"
                  data-testid="button-start-trial"
                >
                  Start Free Trial
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Link href="/chat">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="h-12 px-8 text-base border-2 hover-elevate transition-smooth"
                  data-testid="button-see-demo"
                >
                  Explore Demo
                </Button>
              </Link>
            </div>
            
            {/* Trust Indicator */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span>Trusted by 5,000+ accounting professionals across 6 countries</span>
            </div>
          </div>
          
          {/* Right Column - 3-Pane Interface Preview */}
          <div className="relative">
            {/* Floating 3-pane mockup */}
            <div className="relative glass-heavy rounded-2xl overflow-hidden border-2 border-primary/20 float-card transition-slow">
              <img 
                src={chatDashboardImg} 
                alt="Luca 3-pane interface with conversations, chat, and output pane" 
                className="w-full h-auto"
              />
              
              {/* Annotation callouts */}
              <div className="absolute top-4 left-4 glass px-3 py-2 rounded-lg border border-primary/30">
                <p className="text-xs font-semibold text-primary">Sessions</p>
              </div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 glass px-3 py-2 rounded-lg border border-chart-2/30">
                <p className="text-xs font-semibold text-chart-2">Chat + Modes</p>
              </div>
              <div className="absolute top-4 right-4 glass px-3 py-2 rounded-lg border border-success/30">
                <p className="text-xs font-semibold text-success">Output Pane</p>
              </div>
            </div>
            
            {/* Glow effects */}
            <div className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/30 to-chart-2/30 blur-[80px] transform translate-x-12 translate-y-12" />
            <div className="absolute -z-10 -bottom-20 -right-20 w-80 h-80 bg-accent/20 rounded-full blur-[100px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
