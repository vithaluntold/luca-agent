import { PanelsTopLeft, Layers, FileSearch, BarChart4, FileDown, Users, CheckCircle2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const richFeatures = [
  {
    icon: PanelsTopLeft,
    title: "3-Pane Resizable Workspace",
    description: "Left: session history with profile filters. Center: chat with streaming. Right: output pane with visualizations, exports, and search.",
    perplexity: false,
    badge: "Premium Layout"
  },
  {
    icon: Layers,
    title: "Professional Modes",
    description: "Deep Research, Checklist, Workflow, Audit Plan, Calculation modes. Each displayed in dedicated Output Pane with specialized formatting.",
    perplexity: false,
    badge: "5 Modes"
  },
  {
    icon: FileSearch,
    title: "Document Intelligence",
    description: "Azure Document Intelligence for structured data extraction from PDFs, receipts, tax forms. Automatic fallback for text-only parsing.",
    perplexity: false,
    badge: "AI-Powered"
  },
  {
    icon: BarChart4,
    title: "Interactive Visualizations",
    description: "Recharts for line, bar, pie, area charts. ReactFlow for workflow diagrams. All embedded in Output Pane with responsive theming.",
    perplexity: false,
    badge: "Live Charts"
  },
  {
    icon: FileDown,
    title: "Export to 6 Formats",
    description: "TXT, CSV, DOCX, PDF, PPTX, XLSX. Exports include both markdown content and chart data as formatted tables. One-click download.",
    perplexity: false,
    badge: "6 Formats"
  },
  {
    icon: Users,
    title: "Multi-Profile System",
    description: "Business, personal, family accounting contexts. Profile-aware conversations with context inheritance and filtering in sidebar.",
    perplexity: false,
    badge: "Contexts"
  }
];

export default function Features() {
  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-6 mb-20">
          <Badge variant="outline" className="px-4 py-2 text-sm font-semibold border-primary/30">
            Why Luca Beats Perplexity
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold">
            Functionality{" "}
            <span className="gradient-text">Richness</span>
          </h2>
          <p className="text-xl text-foreground/70 max-w-3xl mx-auto leading-relaxed">
            Perplexity provides chat. Luca provides a complete professional workspace with 
            specialized modes, document analysis, interactive visualizations, and export capabilities.
          </p>
        </div>
        
        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {richFeatures.map((feature, index) => (
            <Card 
              key={index} 
              className="p-8 glass border-primary/20 hover-elevate transition-smooth group"
              data-testid={`card-feature-${index}`}
            >
              <div className="flex flex-col gap-6">
                {/* Icon + Badge */}
                <div className="flex items-start justify-between">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-chart-2/20 flex items-center justify-center group-hover:glow-primary transition-smooth">
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {feature.badge}
                  </Badge>
                </div>
                
                {/* Content */}
                <div className="space-y-3">
                  <h3 className="text-xl font-bold leading-tight">{feature.title}</h3>
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
                
                {/* Perplexity Comparison */}
                <div className="pt-4 border-t border-border/50 flex items-center gap-2 text-xs">
                  {feature.perplexity ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Also in Perplexity</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-primary">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span className="font-semibold">Luca Exclusive</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
        
        {/* CTA Section */}
        <div className="mt-20 text-center glass-heavy rounded-2xl p-12 border border-primary/20">
          <h3 className="text-2xl font-bold mb-4">
            Experience the Full Professional Workspace
          </h3>
          <p className="text-foreground/70 mb-8 max-w-2xl mx-auto">
            Luca isn't just another AI chat interface. It's a comprehensive accounting intelligence platform 
            designed for professionals who need more than conversation.
          </p>
          <div className="flex justify-center gap-4">
            <a href="/auth">
              <button className="px-6 py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover-elevate transition-smooth glow-accent">
                Start Free Trial
              </button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
