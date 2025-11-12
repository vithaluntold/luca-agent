import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import logoImg from "@assets/Luca Main Logo (1)_1762627933760.png";

export default function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" data-testid="link-nav-home">
            <img src={logoImg} alt="Luca" className="h-8 w-auto cursor-pointer" />
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            <Link 
              href="/features" 
              className="text-sm font-medium hover:text-primary transition-colors" 
              data-testid="link-nav-features"
            >
              Features
            </Link>
            <Link 
              href="/pricing" 
              className="text-sm font-medium hover:text-primary transition-colors" 
              data-testid="link-nav-pricing"
            >
              Pricing
            </Link>
            <Link 
              href="/docs" 
              className="text-sm font-medium hover:text-primary transition-colors" 
              data-testid="link-nav-docs"
            >
              Docs
            </Link>
            <Link 
              href="/blog" 
              className="text-sm font-medium hover:text-primary transition-colors" 
              data-testid="link-nav-blog"
            >
              Blog
            </Link>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            asChild
            variant="ghost" 
            size="sm"
          >
            <Link href="/auth" data-testid="button-sign-in">
              Sign In
            </Link>
          </Button>
          <Button 
            asChild
            size="sm"
          >
            <Link href="/auth" data-testid="button-get-started">
              Get Started
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
