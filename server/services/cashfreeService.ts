/**
 * Cashfree Payment Gateway Integration
 * Handles subscription payments for LucaAgent
 */

import crypto from 'crypto';

// Cashfree SDK types (v5.x uses different pattern)
let Cashfree: any;
let cashfreeInitialized = false;

async function initCashfree() {
  if (cashfreeInitialized) return;
  
  try {
    const cashfreePg = await import('cashfree-pg');
    Cashfree = cashfreePg.Cashfree;
    
    // Configure Cashfree SDK
    Cashfree.XClientId = process.env.CASHFREE_APP_ID || '';
    Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY || '';
    Cashfree.XEnvironment = process.env.NODE_ENV === 'production' 
      ? Cashfree.Environment.PRODUCTION 
      : Cashfree.Environment.SANDBOX;
    
    cashfreeInitialized = true;
  } catch (error) {
    console.error('[Cashfree] Failed to initialize:', error);
  }
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration: number; // in days
  features: string[];
  tier: 'free' | 'professional' | 'enterprise';
}

// Subscription plans configuration
export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  professional_monthly: {
    id: 'professional_monthly',
    name: 'Professional',
    price: 2999, // ₹29.99 (in paise)
    currency: 'INR',
    duration: 30,
    tier: 'professional',
    features: [
      'Advanced AI analysis',
      'Unlimited queries',
      'Document uploads (10 MB)',
      'Excel generation',
      'Priority support',
      'All professional modes'
    ]
  },
  professional_annual: {
    id: 'professional_annual',
    name: 'Professional Annual',
    price: 29990, // ₹299.90 (save 17%)
    currency: 'INR',
    duration: 365,
    tier: 'professional',
    features: [
      'All Professional features',
      '2 months free',
      'Annual billing discount'
    ]
  },
  enterprise_monthly: {
    id: 'enterprise_monthly',
    name: 'Enterprise',
    price: 9999, // ₹99.99
    currency: 'INR',
    duration: 30,
    tier: 'enterprise',
    features: [
      'Everything in Professional',
      'Multi-jurisdiction expertise',
      'Custom integrations',
      'Dedicated account manager',
      'API access',
      'White-label options',
      'Advanced audit tools'
    ]
  },
  enterprise_annual: {
    id: 'enterprise_annual',
    name: 'Enterprise Annual',
    price: 99990, // ₹999.90 (save 17%)
    currency: 'INR',
    duration: 365,
    tier: 'enterprise',
    features: [
      'All Enterprise features',
      '2 months free',
      'Annual billing discount',
      'Priority implementation'
    ]
  }
};

export interface CreateOrderParams {
  userId: string;
  planId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface PaymentOrder {
  orderId: string;
  orderToken: string;
  paymentSessionId: string;
  orderAmount: number;
  orderCurrency: string;
}

class CashfreeService {
  /**
   * Create a payment order for subscription
   */
  async createPaymentOrder(params: CreateOrderParams): Promise<PaymentOrder> {
    await initCashfree();
    
    const plan = SUBSCRIPTION_PLANS[params.planId];
    
    if (!plan) {
      throw new Error(`Invalid plan ID: ${params.planId}`);
    }

    const orderId = `order_${params.userId}_${Date.now()}`;
    
    const request = {
      order_id: orderId,
      order_amount: plan.price / 100, // Convert paise to rupees
      order_currency: plan.currency,
      customer_details: {
        customer_id: params.userId,
        customer_name: params.customerName,
        customer_email: params.customerEmail,
        customer_phone: params.customerPhone,
      },
      order_meta: {
        return_url: `${process.env.APP_URL}/payment/success?order_id={order_id}`,
        notify_url: `${process.env.APP_URL}/api/payments/webhook`,
      },
      order_note: `LucaAgent ${plan.name} Subscription`,
      order_tags: {
        plan_id: params.planId,
        user_id: params.userId,
        tier: plan.tier,
        duration: plan.duration.toString(),
      },
    };

    const response = await Cashfree.PGCreateOrder('2023-08-01', request);

    return {
      orderId: response.data.order_id,
      orderToken: response.data.order_token,
      paymentSessionId: response.data.payment_session_id,
      orderAmount: response.data.order_amount,
      orderCurrency: response.data.order_currency,
    };
  }

  /**
   * Verify payment after customer completes checkout
   */
  async verifyPayment(orderId: string): Promise<{
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    amount: number;
    currency: string;
    paymentDetails: any;
  }> {
    await initCashfree();
    
    const response = await Cashfree.PGOrderFetchPayments('2023-08-01', orderId);
    
    const payment = response.data[0];
    
    return {
      status: payment.payment_status,
      amount: payment.payment_amount,
      currency: payment.payment_currency,
      paymentDetails: payment,
    };
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    timestamp: string
  ): boolean {
    const signatureData = `${timestamp}${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY!)
      .update(signatureData)
      .digest('base64');
    
    return signature === expectedSignature;
  }

  /**
   * Handle webhook notifications
   */
  async handleWebhook(webhookData: any): Promise<{
    orderId: string;
    userId: string;
    planId: string;
    status: string;
    shouldUpgradeTier: boolean;
    newTier?: 'professional' | 'enterprise';
    expiresAt?: Date;
  }> {
    const { order_id, order_status, order_tags } = webhookData.data;
    
    const planId = order_tags?.plan_id;
    const userId = order_tags?.user_id;
    const tier = order_tags?.tier as 'professional' | 'enterprise';
    const duration = parseInt(order_tags?.duration || '30');
    
    let shouldUpgradeTier = false;
    let expiresAt: Date | undefined;
    
    if (order_status === 'PAID') {
      shouldUpgradeTier = true;
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + duration);
    }
    
    return {
      orderId: order_id,
      userId,
      planId,
      status: order_status,
      shouldUpgradeTier,
      newTier: shouldUpgradeTier ? tier : undefined,
      expiresAt,
    };
  }

  /**
   * Get plan details
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return SUBSCRIPTION_PLANS[planId];
  }

  /**
   * Get all available plans
   */
  getAllPlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }
}

export const cashfreeService = new CashfreeService();
