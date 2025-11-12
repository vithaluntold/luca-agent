import { MessageSquare, Sparkles, ListChecks, Network, FileBarChart, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ModeDockRibbonProps {
  chatMode: string;
  onModeChange: (mode: string) => void;
}

const chatModes = [
  { id: 'standard', label: 'Standard', icon: MessageSquare, color: 'text-foreground' },
  { id: 'deep-research', label: 'Research', icon: Sparkles, color: 'text-primary' },
  { id: 'checklist', label: 'Checklist', icon: ListChecks, color: 'text-success' },
  { id: 'workflow', label: 'Workflow', icon: Network, color: 'text-secondary' },
  { id: 'audit-plan', label: 'Audit', icon: FileBarChart, color: 'text-gold' },
  { id: 'calculation', label: 'Calculate', icon: Calculator, color: 'text-accent' },
];

export default function ModeDockRibbon({ chatMode, onModeChange }: ModeDockRibbonProps) {
  return (
    <div className="border-b border-border/50 glass px-4 py-3">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Professional Modes
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Output Pane
          </Badge>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {chatModes.map((mode) => {
            const Icon = mode.icon;
            const isActive = chatMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onModeChange(mode.id)}
                className={`
                  px-4 py-2 rounded-lg font-medium text-sm
                  transition-smooth hover-elevate
                  flex items-center gap-2
                  ${isActive 
                    ? 'glass-heavy border-2 border-primary/50 shadow-lg' 
                    : 'glass border border-border/30 hover:border-primary/30'
                  }
                `}
                data-testid={`mode-dock-${mode.id}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? mode.color : 'text-muted-foreground'}`} />
                <span className={isActive ? mode.color : 'text-foreground/70'}>
                  {mode.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
