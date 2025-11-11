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
    <footer className="border-t border-border bg-card">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-4">
            <img src={logoImg} alt="Luca" className="h-12 w-auto" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Accounting superintelligence powered by specialized AI models and 
              advanced financial algorithms.
            </p>
            <div className="flex gap-4">
              <div className="flex gap-2">
                <Input 
                  type="email" 
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="max-w-xs"
                  data-testid="input-newsletter-email"
                />
                <Button 
                  size="sm"
                  onClick={handleSubscribe}
                  data-testid="button-newsletter-subscribe"
                >
                  Subscribe
                </Button>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/features"><a className="hover:text-foreground transition-colors" data-testid="link-footer-features">Features</a></Link></li>
              <li><Link href="/pricing"><a className="hover:text-foreground transition-colors" data-testid="link-footer-pricing">Pricing</a></Link></li>
              <li><Link href="/api"><a className="hover:text-foreground transition-colors" data-testid="link-footer-api">API</a></Link></li>
              <li><Link href="/integrations"><a className="hover:text-foreground transition-colors" data-testid="link-footer-integrations">Integrations</a></Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/docs"><a className="hover:text-foreground transition-colors" data-testid="link-footer-docs">Documentation</a></Link></li>
              <li><Link href="/docs"><a className="hover:text-foreground transition-colors" data-testid="link-footer-guides">Guides</a></Link></li>
              <li><Link href="/blog"><a className="hover:text-foreground transition-colors" data-testid="link-footer-blog">Blog</a></Link></li>
              <li><Link href="/support"><a className="hover:text-foreground transition-colors" data-testid="link-footer-support">Support</a></Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about"><a className="hover:text-foreground transition-colors" data-testid="link-footer-about">About</a></Link></li>
              <li><Link href="/careers"><a className="hover:text-foreground transition-colors" data-testid="link-footer-careers">Careers</a></Link></li>
              <li><Link href="/privacy"><a className="hover:text-foreground transition-colors" data-testid="link-footer-privacy">Privacy</a></Link></li>
              <li><Link href="/terms"><a className="hover:text-foreground transition-colors" data-testid="link-footer-terms">Terms</a></Link></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Luca. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
