import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import chatDashboardImg from "@assets/generated_images/Chat_interface_dashboard_screenshot_b7283c51.png";

export default function Hero() {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      
      <div className="relative max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Accounting Superintelligence</span>
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-semibold leading-tight">
              Transform Your Accounting with{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                AI Intelligence
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Luca combines multiple specialized AI models with advanced financial solvers 
              to deliver expert accounting, tax, and compliance guidance across global jurisdictions.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <Link href="/auth">
                <Button 
                  size="lg" 
                  className="gap-2"
                  data-testid="button-start-trial"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/chat">
                <Button 
                  size="lg" 
                  variant="outline"
                  data-testid="button-see-demo"
                >
                  See Demo
                </Button>
              </Link>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Trusted by 5,000+ accounting professionals worldwide
            </p>
          </div>
          
          <div className="relative">
            <div className="relative rounded-lg overflow-hidden border border-border shadow-xl">
              <img 
                src={chatDashboardImg} 
                alt="Luca chat interface" 
                className="w-full h-auto"
              />
            </div>
            <div className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/20 to-accent/20 blur-3xl transform translate-x-12 translate-y-12" />
          </div>
        </div>
      </div>
    </section>
  );
}
