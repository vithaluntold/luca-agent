import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LandingNav from "@/components/LandingNav";
import Footer from "@/components/Footer";
import { Check, Globe2, TrendingDown, Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Region = "usa" | "canada" | "india" | "uae" | "indonesia" | "turkey";

interface RegionalPlan {
  name: string;
  currency: string;
  symbol: string;
  monthly: number;
  annual: number;
  discount: number;
  payAsYouGo: number;
  localPayment: string;
}

const regionalPlans: Record<Region, RegionalPlan> = {
  usa: {
    name: "United States",
    currency: "USD",
    symbol: "$",
    monthly: 29,
    annual: 290,
    discount: 0,
    payAsYouGo: 20,
    localPayment: "Credit Card, PayPal"
  },
  canada: {
    name: "Canada",
    currency: "CAD",
    symbol: "C$",
    monthly: 39,
    annual: 390,
    discount: 0,
    payAsYouGo: 27,
    localPayment: "Credit Card, PayPal, Interac"
  },
  india: {
    name: "India",
    currency: "INR",
    symbol: "₹",
    monthly: 1999,
    annual: 19990,
    discount: 70,
    payAsYouGo: 1400,
    localPayment: "Credit Card, UPI, Net Banking, Wallets"
  },
  uae: {
    name: "United Arab Emirates",
    currency: "AED",
    symbol: "AED",
    monthly: 89,
    annual: 890,
    discount: 0,
    payAsYouGo: 62,
    localPayment: "Credit Card, PayPal"
  },
  indonesia: {
    name: "Indonesia",
    currency: "IDR",
    symbol: "Rp",
    monthly: 429000,
    annual: 4290000,
    discount: 70,
    payAsYouGo: 300000,
    localPayment: "Credit Card, GoPay, OVO, Bank Transfer"
  },
  turkey: {
    name: "Turkey",
    currency: "TRY",
    symbol: "₺",
    monthly: 899,
    annual: 8990,
    discount: 0,
    payAsYouGo: 629,
    localPayment: "Credit Card, Bank Transfer"
  }
};

const tiers = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for trying out Luca",
    queries: "100 queries/month",
    features: [
      "100 queries per month",
      "Standard chat mode",
      "Document upload (up to 5MB)",
      "Basic export (TXT, CSV)",
      "Community support"
    ]
  },
  {
    id: "plus",
    name: "Plus",
    description: "For regular users",
    queries: "10,000 queries/month",
    features: [
      "10,000 queries per month",
      "All professional modes",
      "Document upload (up to 50MB)",
      "All export formats (6 formats)",
      "Priority email support",
      "Advanced visualizations",
      "Multi-profile support"
    ],
    popular: true
  },
  {
    id: "professional",
    name: "Professional",
    description: "For power users",
    queries: "Unlimited queries",
    features: [
      "Unlimited queries",
      "All professional modes",
      "Unlimited document uploads",
      "All export formats",
      "Priority support (24/7)",
      "Advanced visualizations",
      "Unlimited profiles",
      "API access",
      "Custom integrations"
    ]
  }
];

export default function RegionalPricing() {
  const [selectedRegion, setSelectedRegion] = useState<Region>("usa");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  
  const plan = regionalPlans[selectedRegion];
  const annualSavings = Math.round((1 - (plan.annual / 12) / plan.monthly) * 100);

  return (
    <div className="min-h-screen">
      <LandingNav />
      
      <main className="relative pt-24 pb-16">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-chart-2/10 -z-10" />
        
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4" data-testid="badge-regional-pricing">
              <Globe2 className="w-4 h-4 mr-2" />
              Regional Pricing
            </Badge>
            <h1 className="text-5xl font-bold mb-4" data-testid="heading-regional-pricing">
              Fair Pricing for{" "}
              <span className="gradient-text">Every Market</span>
            </h1>
            <p className="text-xl text-foreground/70 max-w-3xl mx-auto">
              Purchasing power parity (PPP) adjusted pricing across 6 global markets. 
              Pay what's fair for your region with local payment methods.
            </p>
          </div>

          {/* Region Selector */}
          <Tabs value={selectedRegion} onValueChange={(value) => setSelectedRegion(value as Region)} className="mb-8">
            <TabsList className="grid grid-cols-3 md:grid-cols-6 gap-2 h-auto p-2 bg-muted/50" data-testid="tabs-region-selector">
              <TabsTrigger value="usa" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-usa">
                🇺🇸 USA
              </TabsTrigger>
              <TabsTrigger value="canada" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-canada">
                🇨🇦 Canada
              </TabsTrigger>
              <TabsTrigger value="india" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-india">
                🇮🇳 India
              </TabsTrigger>
              <TabsTrigger value="uae" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-uae">
                🇦🇪 UAE
              </TabsTrigger>
              <TabsTrigger value="indonesia" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-indonesia">
                🇮🇩 Indonesia
              </TabsTrigger>
              <TabsTrigger value="turkey" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid="tab-turkey">
                🇹🇷 Turkey
              </TabsTrigger>
            </TabsList>

            {Object.keys(regionalPlans).map((region) => (
              <TabsContent key={region} value={region} className="mt-8">
                {/* PPP Discount Banner */}
                {regionalPlans[region as Region].discount > 0 && (
                  <Card className="mb-8 border-success bg-success/5" data-testid="card-ppp-discount">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <TrendingDown className="w-6 h-6 text-success" />
                        <div>
                          <CardTitle className="text-success">
                            {regionalPlans[region as Region].discount}% PPP Discount Applied
                          </CardTitle>
                          <CardDescription>
                            Special pricing adjusted for {regionalPlans[region as Region].name} market purchasing power
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                )}

                {/* Billing Cycle Toggle */}
                <div className="flex justify-center mb-8">
                  <div className="inline-flex items-center gap-4 p-1.5 rounded-full bg-muted" data-testid="toggle-billing-cycle">
                    <Button
                      variant={billingCycle === "monthly" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setBillingCycle("monthly")}
                      className="rounded-full"
                      data-testid="button-monthly"
                    >
                      Monthly
                    </Button>
                    <Button
                      variant={billingCycle === "annual" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setBillingCycle("annual")}
                      className="rounded-full"
                      data-testid="button-annual"
                    >
                      Annual
                      <Badge variant="secondary" className="ml-2">Save {annualSavings}%</Badge>
                    </Button>
                  </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid md:grid-cols-3 gap-8 mb-12">
                  {tiers.map((tier) => (
                    <Card 
                      key={tier.id} 
                      className={`relative ${tier.popular ? 'border-primary shadow-lg shadow-primary/20' : ''}`}
                      data-testid={`card-tier-${tier.id}`}
                    >
                      {tier.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                        </div>
                      )}
                      <CardHeader>
                        <CardTitle>{tier.name}</CardTitle>
                        <CardDescription>{tier.description}</CardDescription>
                        <div className="mt-4">
                          {tier.id === "free" ? (
                            <div className="text-4xl font-bold">
                              {plan.symbol}0
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-bold">
                                {plan.symbol}
                                {billingCycle === "monthly" 
                                  ? tier.id === "plus" ? plan.monthly : plan.monthly * 1.69
                                  : tier.id === "plus" ? Math.round(plan.annual / 12) : Math.round(plan.annual * 1.69 / 12)
                                }
                              </span>
                              <span className="text-foreground/60">/month</span>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground mt-2">{tier.queries}</p>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          className="w-full mb-6" 
                          variant={tier.popular ? "default" : "outline"}
                          data-testid={`button-select-${tier.id}`}
                        >
                          {tier.id === "free" ? "Get Started Free" : "Subscribe Now"}
                        </Button>
                        <div className="space-y-3">
                          {tier.features.map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                              <span className="text-sm">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pay-as-you-go */}
                <Card className="mb-12 bg-muted/30" data-testid="card-payg">
                  <CardHeader>
                    <CardTitle>Pay-as-you-go</CardTitle>
                    <CardDescription>
                      No commitment, pay only for what you use
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-3xl font-bold">
                        {plan.symbol}{plan.payAsYouGo}
                      </span>
                      <span className="text-foreground/60">per 100 queries</span>
                    </div>
                    <Button variant="outline" data-testid="button-payg">Purchase Credits</Button>
                  </CardContent>
                </Card>

                {/* Local Payment Methods */}
                <Card data-testid="card-payment-methods">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Info className="w-5 h-5 text-primary" />
                      <CardTitle>Local Payment Methods</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground/70">
                      We support the following payment methods in {regionalPlans[region as Region].name}:
                    </p>
                    <p className="font-semibold mt-2">{regionalPlans[region as Region].localPayment}</p>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* FAQ */}
          <div className="mt-16">
            <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="max-w-3xl mx-auto">
              <AccordionItem value="item-1">
                <AccordionTrigger>Why does pricing vary by region?</AccordionTrigger>
                <AccordionContent>
                  We use purchasing power parity (PPP) adjustments to ensure fair pricing across different markets. 
                  This means pricing reflects local economic conditions and purchasing power, making Luca accessible 
                  to professionals worldwide while maintaining sustainable business operations.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Can I change my billing region later?</AccordionTrigger>
                <AccordionContent>
                  Your billing region is determined by your account's primary location. If you relocate permanently, 
                  you can contact support to update your region. Pricing will adjust to reflect your new location 
                  at the next billing cycle.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Do you offer refunds?</AccordionTrigger>
                <AccordionContent>
                  Yes, we offer a 14-day money-back guarantee on all paid plans. If you're not satisfied, contact 
                  our support team for a full refund within 14 days of purchase. See our refund policy for details.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger>How is currency conversion handled?</AccordionTrigger>
                <AccordionContent>
                  Pricing is displayed and charged in your local currency. No conversion fees are applied for supported 
                  currencies. For unsupported currencies, your bank may apply standard conversion rates.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
