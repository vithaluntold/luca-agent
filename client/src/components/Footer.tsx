import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
              <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
              <li><a href="#api" className="hover:text-foreground transition-colors">API</a></li>
              <li><a href="#integrations" className="hover:text-foreground transition-colors">Integrations</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#docs" className="hover:text-foreground transition-colors">Documentation</a></li>
              <li><a href="#guides" className="hover:text-foreground transition-colors">Guides</a></li>
              <li><a href="#blog" className="hover:text-foreground transition-colors">Blog</a></li>
              <li><a href="#support" className="hover:text-foreground transition-colors">Support</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#about" className="hover:text-foreground transition-colors">About</a></li>
              <li><a href="#careers" className="hover:text-foreground transition-colors">Careers</a></li>
              <li><a href="#privacy" className="hover:text-foreground transition-colors">Privacy</a></li>
              <li><a href="#terms" className="hover:text-foreground transition-colors">Terms</a></li>
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
