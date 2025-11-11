import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImg from "@assets/Luca Main Logo (1)_1762627933760.png";

export default function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/">
            <a data-testid="link-nav-home">
              <img src={logoImg} alt="Luca" className="h-8 w-auto cursor-pointer" />
            </a>
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            <Link href="/features">
              <a className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-nav-features">
                Features
              </a>
            </Link>
            <Link href="/pricing">
              <a className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-nav-pricing">
                Pricing
              </a>
            </Link>
            <Link href="/docs">
              <a className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-nav-docs">
                Docs
              </a>
            </Link>
            <Link href="/blog">
              <a className="text-sm font-medium hover:text-primary transition-colors" data-testid="link-nav-blog">
                Blog
              </a>
            </Link>
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
