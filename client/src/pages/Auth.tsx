import { useState } from "react";
import AuthCard from "@/components/AuthCard";

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const handleSubmit = (email: string, password: string, name?: string) => {
    console.log('Auth submit:', { mode, email, password, name });
  };

  return (
    <AuthCard 
      mode={mode}
      onSubmit={handleSubmit}
      onToggleMode={() => setMode(mode === 'login' ? 'register' : 'login')}
    />
  );
}
