import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImg from "@assets/Luca Main Logo (1)_1762627933760.png";

export default function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/">
            <img src={logoImg} alt="Luca" className="h-8 w-auto cursor-pointer" />
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">
              Features
            </a>
            <a href="#architecture" className="text-sm font-medium hover:text-primary transition-colors">
              Architecture
            </a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">
              Pricing
            </a>
            <a href="#docs" className="text-sm font-medium hover:text-primary transition-colors">
              Docs
            </a>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/auth">
            <Button 
              variant="ghost" 
              size="sm"
              data-testid="button-sign-in"
            >
              Sign In
            </Button>
          </Link>
          <Link href="/auth">
            <Button 
              size="sm"
              data-testid="button-get-started"
            >
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
