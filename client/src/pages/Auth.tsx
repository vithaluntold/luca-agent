import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import AuthCard from "@/components/AuthCard";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [, setLocation] = useLocation();
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const [requireMfa, setRequireMfa] = useState(false);
  const [lockoutMessage, setLockoutMessage] = useState<string | undefined>();
  const [storedCredentials, setStoredCredentials] = useState<{ email: string; password: string } | null>(null);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const handleSubmit = async (email: string, password: string, name?: string, mfaToken?: string) => {
    try {
      if (mode === 'register') {
        if (!name) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Name is required"
          });
          return;
        }
        
        const { user } = await authApi.register({ email, password, name });
        setUser(user);
        setRequireMfa(false);
        setLockoutMessage(undefined);
        setShouldRedirect(true);
        toast({
          title: "Welcome to Luca!",
          description: "Your account has been created successfully."
        });
      } else {
        // Store credentials for MFA retry if not already stored
        if (!requireMfa) {
          setStoredCredentials({ email, password });
        }
        
        const { user } = await authApi.login({ email, password, mfaToken });
        setUser(user);
        
        // Reset all state on successful login
        setRequireMfa(false);
        setLockoutMessage(undefined);
        setStoredCredentials(null);
        setShouldRedirect(true);
        
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in."
        });
      }
    } catch (error: any) {
      const message = error.message || "Authentication failed";
      
      // For signup, show specific validation errors
      if (mode === 'register') {
        let errorMessage = message;
        
        // Parse Zod validation errors if present
        try {
          if (message.includes('validation') || message.includes('error')) {
            const errorData = JSON.parse(error.message);
            if (Array.isArray(errorData.error)) {
              errorMessage = errorData.error.map((e: any) => e.message).join('. ');
            }
          }
        } catch {
          // Keep original message if parsing fails
        }
        
        toast({
          variant: "destructive",
          title: "Signup Failed",
          description: errorMessage
        });
        return;
      }
      
      // Login-specific error handling below
      // Check for MFA requirement
      if (message.includes("MFA") || message.includes("two-factor") || message.includes("verification")) {
        setRequireMfa(true);
        toast({
          title: "Two-Factor Authentication Required",
          description: "Please enter your 6-digit authentication code"
        });
        return;
      }
      
      // Check for account lockout - sanitize message to avoid information disclosure
      if (message.includes("locked") || message.includes("temporarily") || message.includes("attempt")) {
        const sanitizedMessage = "Your account has been temporarily locked due to multiple failed login attempts. Please try again later.";
        setLockoutMessage(sanitizedMessage);
        toast({
          variant: "destructive",
          title: "Account Locked",
          description: sanitizedMessage
        });
        return;
      }
      
      // Clear lockout on successful credentials but wrong MFA
      if (requireMfa) {
        setLockoutMessage(undefined);
      }
      
      // Display more specific error for login failures
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: message // Now shows specific error messages from server
      });
    }
  };

  // Redirect to appropriate page after successful auth
  useEffect(() => {
    if (shouldRedirect && user) {
      // Redirect admin users to admin panel, regular users to chat
      if (user.isAdmin) {
        console.log('Admin login detected, redirecting to /admin');
        setLocation('/admin');
      } else {
        setLocation('/chat');
      }
    }
  }, [shouldRedirect, user, setLocation]);
  
  // Auto-submit with stored credentials when MFA is required
  useEffect(() => {
    if (requireMfa && storedCredentials && mode === 'login') {
      // Credentials are already filled in the form, user just needs to enter MFA token
      console.log('MFA required - waiting for user to enter token');
    }
  }, [requireMfa, storedCredentials, mode]);

  return (
    <AuthCard 
      mode={mode}
      onSubmit={handleSubmit}
      onToggleMode={() => {
        setMode(mode === 'login' ? 'register' : 'login');
        setRequireMfa(false);
        setLockoutMessage(undefined);
        setStoredCredentials(null);
      }}
      requireMfa={requireMfa}
      lockoutMessage={lockoutMessage}
    />
  );
}
