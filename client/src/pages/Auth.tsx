import { useState } from "react";
import { useLocation } from "wouter";
import AuthCard from "@/components/AuthCard";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (email: string, password: string, name?: string) => {
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
        toast({
          title: "Welcome to Luca!",
          description: "Your account has been created successfully."
        });
        setLocation('/chat');
      } else {
        const { user } = await authApi.login({ email, password });
        setUser(user);
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in."
        });
        setLocation('/chat');
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Authentication failed"
      });
    }
  };

  return (
    <AuthCard 
      mode={mode}
      onSubmit={handleSubmit}
      onToggleMode={() => setMode(mode === 'login' ? 'register' : 'login')}
    />
  );
}
