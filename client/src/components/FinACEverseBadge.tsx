import finaceverseLogo from "@assets/FinACEverse Transparent symbol (1)_1761717040611-DUjk4bpq_1762638462621.png";

export default function FinACEverseBadge() {
  return (
    <div 
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 glass-heavy border border-primary/20 rounded-full px-4 py-2 shadow-lg transition-smooth hover-elevate"
      data-testid="badge-finaceverse"
    >
      <span className="text-xs text-muted-foreground font-medium">
        Powered by
      </span>
      <img 
        src={finaceverseLogo} 
        alt="FinACEverse" 
        className="h-5 w-5"
      />
      <span className="text-xs font-bold gradient-text">
        FinACEverse
      </span>
    </div>
  );
}
