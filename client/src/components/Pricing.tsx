import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "Perfect for exploring Luca's capabilities",
    features: [
      "100 queries per month",
      "Basic financial calculations",
      "Standard response time",
      "Community support",
      "Export conversations"
    ],
    cta: "Get Started",
    highlighted: false
  },
  {
    name: "Professional",
    price: "$49",
    description: "For accountants and small firms",
    features: [
      "Unlimited queries",
      "Advanced tax calculations",
      "Priority model routing",
      "Multi-jurisdiction support",
      "Document analysis (50/month)",
      "Email support",
      "API access",
      "Custom model preferences"
    ],
    cta: "Start Free Trial",
    highlighted: true
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For large firms and organizations",
    features: [
      "Everything in Professional",
      "Unlimited document analysis",
      "Dedicated support team",
      "Custom model fine-tuning",
      "SSO & advanced security",
      "Audit trail & compliance",
      "Multi-user workspaces",
      "SLA guarantees"
    ],
    cta: "Contact Sales",
    highlighted: false
  }
];

export default function Pricing() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl lg:text-4xl font-semibold">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include access to our 
            intelligent model routing and advanced financial solvers.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`p-8 flex flex-col ${
                plan.highlighted 
                  ? 'border-primary shadow-lg scale-105' 
                  : ''
              }`}
              data-testid={`card-pricing-${plan.name.toLowerCase()}`}
            >
              {plan.highlighted && (
                <div className="mb-4 -mt-4 -mx-4 px-4 py-2 bg-primary/10 text-primary text-sm font-medium text-center rounded-t-md">
                  Most Popular
                </div>
              )}
              
              <div className="space-y-4 mb-6">
                <h3 className="text-2xl font-semibold">{plan.name}</h3>
                <div>
                  <span className="text-4xl font-semibold">{plan.price}</span>
                  {plan.price !== "Custom" && <span className="text-muted-foreground">/month</span>}
                </div>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>
              
              <div className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
              
              <Button 
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                data-testid={`button-${plan.name.toLowerCase()}-cta`}
                onClick={() => console.log(`${plan.name} plan selected`)}
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
