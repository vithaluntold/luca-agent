import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Check, Sparkles, Zap, Building2, Infinity, Loader2, Tag, X } from "lucide-react";
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

interface CouponValidation {
  valid: boolean;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  description?: string;
}

export default function Pricing() {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [isRazorpayLoaded, setIsRazorpayLoaded] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponValidation, setCouponValidation] = useState<CouponValidation | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
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
      setIsRazorpayLoaded(false);
    };
    document.body.appendChild(script);

    return () => {
      // Only remove if script exists
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const { data: pricingData, isLoading } = useQuery<PricingData>({
    queryKey: ['/api/pricing', currency],
    enabled: true
  });

  const { data: subscriptionData } = useQuery<{ subscription: { plan: string } }>({
    queryKey: ['/api/subscription'],
    enabled: !!user
  });

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponValidation(null);
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const response = await fetch(`/api/coupons/pre-validate?code=${encodeURIComponent(couponCode)}&currency=${currency}`, {
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || 'Invalid coupon code');
      }

      setCouponValidation({
        valid: data.valid,
        discountType: data.discountType,
        discountValue: data.discountValue,
        description: data.description
      });

      if (data.valid) {
        toast({
          title: "Coupon applied!",
          description: data.description || "Your discount will be applied at checkout"
        });
      }
    } catch (error: any) {
      setCouponValidation({ valid: false });
      toast({
        title: "Invalid coupon",
        description: error.message || "This coupon code is not valid",
        variant: "destructive"
      });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCouponCode('');
    setCouponValidation(null);
  };

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
        title: "Payment system unavailable",
        description: "Razorpay payment gateway is not configured. Please contact support.",
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
        body: JSON.stringify({ 
          plan, 
          billingCycle, 
          currency, 
          couponCode: couponValidation?.valid ? couponCode : undefined 
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create payment order';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use default message
        }
        throw new Error(errorMessage);
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
        {/* Payment System Notice */}
        {!isRazorpayLoaded && (
          <Card className="mb-8 border-amber-500/50 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-500 text-xs">!</span>
                </div>
                <div>
                  <h3 className="font-semibold text-amber-500 mb-1">Demo Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    Payment processing is not yet configured. You can view pricing information, but payment processing will be enabled once Razorpay API keys are added by the administrator.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
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

          {/* Coupon Code Input */}
          <div className="mt-6 flex justify-center">
            <div className="w-full max-w-md">
              {!couponValidation?.valid ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && validateCoupon()}
                      className="pl-9"
                      data-testid="input-coupon-code"
                    />
                  </div>
                  <Button
                    onClick={validateCoupon}
                    disabled={!couponCode.trim() || isValidatingCoupon}
                    data-testid="button-apply-coupon"
                  >
                    {isValidatingCoupon ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      'Apply'
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-500">
                        Coupon Applied: {couponCode}
                      </p>
                      {couponValidation.description && (
                        <p className="text-xs text-muted-foreground">
                          {couponValidation.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={removeCoupon}
                    data-testid="button-remove-coupon"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
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
                disabled={!isRazorpayLoaded || currentPlan === 'plus' || processingPlan === 'plus'}
                data-testid="button-select-plus"
              >
                {processingPlan === 'plus' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {!isRazorpayLoaded ? 'Payment Unavailable' : currentPlan === 'plus' ? 'Current Plan' : processingPlan === 'plus' ? 'Processing...' : 'Upgrade to Plus'}
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
                disabled={!isRazorpayLoaded || currentPlan === 'professional' || processingPlan === 'professional'}
                data-testid="button-select-professional"
              >
                {processingPlan === 'professional' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {!isRazorpayLoaded ? 'Payment Unavailable' : currentPlan === 'professional' ? 'Current Plan' : processingPlan === 'professional' ? 'Processing...' : 'Upgrade to Professional'}
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
                disabled={!isRazorpayLoaded || currentPlan === 'enterprise' || processingPlan === 'enterprise'}
                data-testid="button-select-enterprise"
              >
                {processingPlan === 'enterprise' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {!isRazorpayLoaded ? 'Payment Unavailable' : currentPlan === 'enterprise' ? 'Current Plan' : processingPlan === 'enterprise' ? 'Processing...' : 'Upgrade to Enterprise'}
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
