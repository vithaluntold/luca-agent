import finaceverseLogo from "@assets/FinACEverse Transparent symbol (1)_1761717040611-DUjk4bpq_1762638462621.png";

export default function FinACEverseBadge() {
  return (
    <div 
      className="w-full flex items-center justify-center gap-2 py-3 bg-background/80 backdrop-blur-sm border-t border-border"
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
