import { Brain, Calculator, Globe, FileText, TrendingUp, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

const features = [
  {
    icon: Brain,
    title: "Multi-Model Intelligence",
    description: "Intelligent routing to specialized AI models trained for tax, audit, financial reporting, and compliance."
  },
  {
    icon: Calculator,
    title: "Advanced Financial Solvers",
    description: "Precise calculations for NPV, IRR, amortization, depreciation, and complex tax computations."
  },
  {
    icon: Globe,
    title: "Global Tax Compliance",
    description: "Comprehensive coverage of accounting standards and tax regulations across multiple jurisdictions."
  },
  {
    icon: FileText,
    title: "Document Analysis",
    description: "Intelligent parsing and analysis of financial statements, receipts, and tax documents."
  },
  {
    icon: TrendingUp,
    title: "Real-Time Insights",
    description: "Instant financial analysis with industry benchmarks and trend comparisons."
  },
  {
    icon: Shield,
    title: "Audit Trail & Security",
    description: "Enterprise-grade security with complete audit trails for all calculations and recommendations."
  }
];

export default function Features() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl lg:text-4xl font-semibold">
            Intelligence Beyond Basic AI
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Luca doesn't just chat—it calculates, verifies, and provides expert guidance 
            backed by specialized models and proven financial algorithms.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="p-6 hover-elevate transition-all duration-200"
              data-testid={`card-feature-${index}`}
            >
              <div className="flex flex-col gap-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
