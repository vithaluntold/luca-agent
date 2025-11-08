import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import logoImg from "@assets/Luca Main Logo (1)_1762627933760.png";
import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthCardProps {
  mode: "login" | "register";
  onSubmit: (email: string, password: string, name?: string, mfaToken?: string) => void;
  onToggleMode: () => void;
  requireMfa?: boolean;
  lockoutMessage?: string;
}

export default function AuthCard({ mode, onSubmit, onToggleMode, requireMfa, lockoutMessage }: AuthCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Password strength validation
  const hasMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  const passwordValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    if (mode === 'register' && !passwordValid) {
      setValidationError("Please ensure all password requirements are met");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(email, password, name, requireMfa ? mfaToken : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLogin = mode === "login";
  
  // Sanitize lockout message to avoid leaking security details
  const sanitizedLockoutMessage = lockoutMessage 
    ? "Your account has been temporarily locked due to multiple failed login attempts. Please try again later."
    : undefined;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Card className="w-full max-w-md p-8">
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <img src={logoImg} alt="Luca" className="h-12 w-auto mx-auto mb-4" />
            <h1 className="text-2xl font-semibold">
              {isLogin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLogin 
                ? "Sign in to continue to Luca" 
                : "Get started with Luca for free"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {sanitizedLockoutMessage && (
              <Alert variant="destructive" data-testid="alert-lockout">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{sanitizedLockoutMessage}</AlertDescription>
              </Alert>
            )}
            
            {validationError && (
              <Alert variant="destructive" data-testid="alert-validation-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="input-name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-password"
              />
              
              {!isLogin && (
                <div className="space-y-1.5 text-xs mt-2" data-testid="password-requirements">
                  <p className="text-muted-foreground font-medium">Password must include:</p>
                  <PasswordRequirement 
                    met={hasMinLength} 
                    text="At least 12 characters" 
                  />
                  <PasswordRequirement 
                    met={hasUppercase} 
                    text="One uppercase letter" 
                  />
                  <PasswordRequirement 
                    met={hasLowercase} 
                    text="One lowercase letter" 
                  />
                  <PasswordRequirement 
                    met={hasNumber} 
                    text="One number" 
                  />
                  <PasswordRequirement 
                    met={hasSpecial} 
                    text="One special character (!@#$%^&*...)" 
                  />
                </div>
              )}
            </div>

            {requireMfa && (
              <div className="space-y-2">
                <Label htmlFor="mfaToken" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Two-Factor Code
                </Label>
                <Input
                  id="mfaToken"
                  type="text"
                  placeholder="000000"
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  data-testid="input-mfa-token"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting || !!sanitizedLockoutMessage || (!isLogin && !passwordValid)}
              data-testid="button-auth-submit"
            >
              {isSubmitting ? "Please wait..." : (isLogin ? "Sign In" : "Create Account")}
            </Button>
          </form>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={onToggleMode}
              className="text-primary hover:underline font-medium"
              data-testid="button-toggle-mode"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {met ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
        {text}
      </span>
    </div>
  );
}
