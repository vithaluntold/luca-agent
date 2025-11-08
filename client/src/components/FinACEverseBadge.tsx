import finaceverseLogo from "@assets/FinACEverse Transparent symbol (1)_1761717040611-DUjk4bpq_1762638462621.png";

export default function FinACEverseBadge() {
  return (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-full px-4 py-2 shadow-lg transition-all duration-200"
      data-testid="finaceverse-badge"
    >
      <span className="text-sm text-muted-foreground font-medium">
        Powered by
      </span>
      <img 
        src={finaceverseLogo} 
        alt="FinACEverse" 
        className="h-6 w-6"
      />
      <span className="text-sm font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
        FinACEverse
      </span>
    </div>
  );
}
