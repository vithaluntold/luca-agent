import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import logoImg from "@assets/Luca Transparent symbol (3)_1763135780054.png";
import { useState } from "react";

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = () => {
    console.log('Newsletter subscribe:', email);
    setEmail("");
  };

  return (
    <footer className="relative border-t border-border/50 bg-gradient-to-b from-background to-card/50">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
          <div className="lg:col-span-2 space-y-6">
            <img src={logoImg} alt="Luca" className="h-14 w-auto" />
            <p className="text-sm text-foreground/70 max-w-sm leading-relaxed">
              Accounting superintelligence powered by specialized AI models and 
              advanced financial algorithms. Built for professionals.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground/90 uppercase tracking-wide">
                Subscribe to updates
              </p>
              <div className="flex gap-2 max-w-md">
                <Input 
                  type="email" 
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-background/50 border-border/50 focus:border-primary/50"
                  data-testid="input-newsletter-email"
                />
                <Button 
                  onClick={handleSubscribe}
                  className="bg-accent hover:bg-accent/90"
                  data-testid="button-newsletter-subscribe"
                >
                  Subscribe
                </Button>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold mb-5 text-foreground">Product</h4>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li><Link href="/features" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-features">Features</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-pricing">Pricing</Link></li>
              <li><Link href="/api" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-api">API</Link></li>
              <li><Link href="/integrations" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-integrations">Integrations</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-5 text-foreground">Resources</h4>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li><Link href="/docs" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-docs">Documentation</Link></li>
              <li><Link href="/docs" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-guides">Guides</Link></li>
              <li><Link href="/blog" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-blog">Blog</Link></li>
              <li><Link href="/support" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-support">Support</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-5 text-foreground">Company</h4>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li><Link href="/about" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-about">About</Link></li>
              <li><Link href="/careers" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-careers">Careers</Link></li>
              <li><Link href="/privacy" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-privacy">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-terms">Terms</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-10 border-t border-border/30 text-center">
          <p className="text-sm font-semibold text-foreground/80">
            &copy; 2025 LUCA. ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </footer>
  );
}
