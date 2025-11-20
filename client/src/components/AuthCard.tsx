import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import logoImg from "@assets/Luca Transparent symbol (3)_1763135780054.png";
import { useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, ShieldCheck, Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);

  // Password validation matching server requirements
  const passwordValid = password.length >= 8;
  const passwordRequirements = [
    { met: password.length >= 8, text: 'At least 8 characters' },
    { met: /[A-Z]/.test(password), text: 'One uppercase letter' },
    { met: /[a-z]/.test(password), text: 'One lowercase letter' },
    { met: /\d/.test(password), text: 'One number' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    
    if (mode === 'register' && !passwordValid) {
      setValidationError("Password must be at least 8 characters long");
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
            
            {/* Helpful tips */}
            {!isLogin && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  💡 <strong>Quick tip:</strong> Use a strong password with at least 8 characters
                </p>
              </div>
            )}
            
            {isLogin && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
                <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                  <p>🧪 <strong>Demo Accounts:</strong></p>
                  <p><code>demo@luca.com</code> / <code>DemoUser123!</code></p>
                  <p><code>admin@luca.com</code> / <code>Admin123!</code> (Admin)</p>
                </div>
              </div>
            )}
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-password"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              
              {!isLogin && password && (
                <div className="mt-2 p-3 bg-muted/50 rounded-md space-y-1">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Password requirements:</p>
                  {passwordRequirements.map((req, index) => (
                    <PasswordRequirement key={index} met={req.met} text={req.text} />
                  ))}
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
