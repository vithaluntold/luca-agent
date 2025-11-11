import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Sparkles, Zap, Building2, Infinity, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";

type Currency = 'USD' | 'INR' | 'AED' | 'CAD' | 'IDR' | 'TRY';
type BillingCycle = 'monthly' | 'annual';

interface PlanPricing {
  monthly: Record<Currency, number>;
  annual: Record<Currency, number>;
}

interface Plan {
  name: string;
  queriesLimit: number;
  documentsLimit: number;
  profilesLimit: number;
  scenariosLimit: number;
  deliverablesLimit: number;
  features: string[];
  pricing: PlanPricing;
}

interface PricingData {
  free: Plan;
  payAsYouGo: { name: string; pricing: Record<Currency, number> };
  plus: Plan;
  professional: Plan;
  enterprise: Plan;
}

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  INR: '₹',
  AED: 'AED',
  CAD: 'C$',
  IDR: 'Rp',
  TRY: '₺'
};

const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'United States (USD)',
  INR: 'India (INR)',
  AED: 'United Arab Emirates (AED)',
  CAD: 'Canada (CAD)',
  IDR: 'Indonesia (IDR)',
  TRY: 'Turkey (TRY)'
};

function formatPrice(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  const value = amount / 100;
  
  // Use locale-aware formatting for better readability
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
  
  return `${symbol}${formatted}`;
}

export default function Pricing() {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [isRazorpayLoaded, setIsRazorpayLoaded] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setIsRazorpayLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay SDK');
      toast({
        title: "Payment system unavailable",
        description: "Please refresh the page and try again",
        variant: "destructive"
      });
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [toast]);

  const { data: pricingData, isLoading } = useQuery<PricingData>({
    queryKey: ['/api/pricing', currency],
    enabled: true
  });

  const { data: subscriptionData } = useQuery<{ subscription: { plan: string } }>({
    queryKey: ['/api/subscription'],
    enabled: !!user
  });

  const handleUpgrade = async (plan: 'plus' | 'professional' | 'enterprise') => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to upgrade your plan",
        variant: "destructive"
      });
      return;
    }

    if (!isRazorpayLoaded) {
      toast({
        title: "Payment system loading",
        description: "Please wait a moment and try again",
        variant: "destructive"
      });
      return;
    }

    setProcessingPlan(plan);

    try {
      const response = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan, billingCycle, currency })
      });

      if (!response.ok) {
        throw new Error('Failed to create payment order');
      }

      const orderData = await response.json();

      const options = {
        key: orderData.razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Luca - Accounting Superintelligence',
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
        order_id: orderData.orderId,
        handler: async function (razorpayResponse: any) {
          try {
            const verifyResponse = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                razorpay_order_id: razorpayResponse.razorpay_order_id,
                razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                razorpay_signature: razorpayResponse.razorpay_signature
              })
            });

            if (!verifyResponse.ok) {
              throw new Error('Payment verification failed');
            }

            toast({
              title: "Payment successful!",
              description: "Your subscription has been activated"
            });

            queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
            setProcessingPlan(null);
          } catch (error) {
            toast({
              title: "Payment verification failed",
              description: "Please contact support",
              variant: "destructive"
            });
            setProcessingPlan(null);
          }
        },
        prefill: {
          email: user.email
        },
        theme: {
          color: '#8B5CF6'
        },
        modal: {
          ondismiss: function() {
            setProcessingPlan(null);
          }
        }
      };

      const razorpay = new (window as any).Razorpay(options);
      razorpay.open();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate payment",
        variant: "destructive"
      });
      setProcessingPlan(null);
    }
  };

  if (isLoading || !pricingData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading pricing...</p>
        </div>
      </div>
    );
  }

  const currentPlan = subscriptionData?.subscription?.plan || 'free';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Pan-global accounting superintelligence at your fingertips
          </p>

          {/* Currency Selector */}
          <div className="flex justify-center mb-6">
            <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
              <SelectTrigger className="w-64" data-testid="select-currency">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Billing Cycle Toggle */}
          <Tabs value={billingCycle} onValueChange={(value) => setBillingCycle(value as BillingCycle)} className="inline-block">
            <TabsList data-testid="tabs-billing-cycle">
              <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly</TabsTrigger>
              <TabsTrigger value="annual" data-testid="tab-annual">
                Annual
                <Badge variant="secondary" className="ml-2">Save 25%</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {/* Free Plan */}
          <Card data-testid="card-plan-free">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Free
                {currentPlan === 'free' && <Badge>Current</Badge>}
              </CardTitle>
              <CardDescription>For individuals getting started</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-bold">{CURRENCY_SYMBOLS[currency]}0</div>
                <div className="text-sm text-muted-foreground">forever</div>
              </div>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">500 queries/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">3 document uploads</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">1 profile</span>
                </li>
                {pricingData.free.features.slice(0, 3).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant="outline" disabled data-testid="button-select-free">
                Current Plan
              </Button>
            </CardFooter>
          </Card>

          {/* Plus Plan */}
          <Card data-testid="card-plan-plus" className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Plus
                {currentPlan === 'plus' && <Badge>Current</Badge>}
              </CardTitle>
              <CardDescription>For active professionals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-bold">
                  {formatPrice(pricingData.plus.pricing[billingCycle][currency], currency)}
                </div>
                <div className="text-sm text-muted-foreground">
                  per {billingCycle === 'monthly' ? 'month' : 'year'}
                </div>
              </div>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">2,500 queries/month</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">25 document uploads</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">3 profiles</span>
                </li>
                {pricingData.plus.features.slice(0, 4).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={() => handleUpgrade('plus')}
                disabled={currentPlan === 'plus' || processingPlan === 'plus'}
                data-testid="button-select-plus"
              >
                {processingPlan === 'plus' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {currentPlan === 'plus' ? 'Current Plan' : processingPlan === 'plus' ? 'Processing...' : 'Upgrade to Plus'}
              </Button>
            </CardFooter>
          </Card>

          {/* Professional Plan */}
          <Card data-testid="card-plan-professional" className="border-purple-500 shadow-lg relative">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-purple-600">
              Most Popular
            </Badge>
            <CardHeader className="pt-8">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                Professional
                {currentPlan === 'professional' && <Badge>Current</Badge>}
              </CardTitle>
              <CardDescription>For serious practices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-bold">
                  {formatPrice(pricingData.professional.pricing[billingCycle][currency], currency)}
                </div>
                <div className="text-sm text-muted-foreground">
                  per {billingCycle === 'monthly' ? 'month' : 'year'}
                </div>
              </div>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Infinity className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited queries</span>
                </li>
                <li className="flex items-start gap-2">
                  <Infinity className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited documents</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">10 profiles</span>
                </li>
                {pricingData.professional.features.slice(0, 5).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full bg-gradient-to-r from-pink-500 to-purple-600" 
                onClick={() => handleUpgrade('professional')}
                disabled={currentPlan === 'professional' || processingPlan === 'professional'}
                data-testid="button-select-professional"
              >
                {processingPlan === 'professional' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {currentPlan === 'professional' ? 'Current Plan' : processingPlan === 'professional' ? 'Processing...' : 'Upgrade to Professional'}
              </Button>
            </CardFooter>
          </Card>

          {/* Enterprise Plan */}
          <Card data-testid="card-plan-enterprise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Enterprise
                {currentPlan === 'enterprise' && <Badge>Current</Badge>}
              </CardTitle>
              <CardDescription>For large organizations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="text-3xl font-bold">
                  {formatPrice(pricingData.enterprise.pricing[billingCycle][currency], currency)}
                </div>
                <div className="text-sm text-muted-foreground">
                  per {billingCycle === 'monthly' ? 'month' : 'year'}
                </div>
              </div>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <Infinity className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm font-medium">Everything unlimited</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">Multi-user accounts (6+)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">SSO / SAML authentication</span>
                </li>
                {pricingData.enterprise.features.slice(0, 5).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={() => handleUpgrade('enterprise')}
                disabled={currentPlan === 'enterprise' || processingPlan === 'enterprise'}
                data-testid="button-select-enterprise"
              >
                {processingPlan === 'enterprise' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {currentPlan === 'enterprise' ? 'Current Plan' : processingPlan === 'enterprise' ? 'Processing...' : 'Upgrade to Enterprise'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Pay-as-you-go */}
        <Card className="max-w-2xl mx-auto" data-testid="card-pay-as-you-go">
          <CardHeader>
            <CardTitle>Pay-as-you-go</CardTitle>
            <CardDescription>
              No subscription required - pay only for what you use
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {formatPrice(pricingData.payAsYouGo.pricing[currency], currency)}
                </div>
                <div className="text-sm text-muted-foreground">per 100 queries</div>
              </div>
              <Button variant="outline" data-testid="button-pay-as-you-go">
                Buy Credits
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
