import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import logoImg from "@assets/Luca Main Logo (1)_1762627933760.png";
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
              <li><Link href="/features"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-features">Features</a></Link></li>
              <li><Link href="/pricing"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-pricing">Pricing</a></Link></li>
              <li><Link href="/api"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-api">API</a></Link></li>
              <li><Link href="/integrations"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-integrations">Integrations</a></Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-5 text-foreground">Resources</h4>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li><Link href="/docs"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-docs">Documentation</a></Link></li>
              <li><Link href="/docs"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-guides">Guides</a></Link></li>
              <li><Link href="/blog"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-blog">Blog</a></Link></li>
              <li><Link href="/support"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-support">Support</a></Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-5 text-foreground">Company</h4>
            <ul className="space-y-3 text-sm text-foreground/70">
              <li><Link href="/about"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-about">About</a></Link></li>
              <li><Link href="/careers"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-careers">Careers</a></Link></li>
              <li><Link href="/privacy"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-privacy">Privacy</a></Link></li>
              <li><Link href="/terms"><a className="hover:text-foreground hover-elevate transition-smooth" data-testid="link-footer-terms">Terms</a></Link></li>
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
