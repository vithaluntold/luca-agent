import { db } from '../db';
import { subscriptions, payments, usageQuotas, users } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Plan configurations with regional pricing
export const PLAN_CONFIGS = {
  free: {
    name: 'Free',
    queriesLimit: 500,
    documentsLimit: 10,
    profilesLimit: 1,
    scenariosLimit: 0,
    deliverablesLimit: 0,
    features: [
      '500 queries per month',
      'Basic document analysis (10/month)',
      '1 profile',
      'Export to TXT, CSV',
      'Community support'
    ],
    pricing: {
      USD: 0,
      INR: 0,
      AED: 0,
      CAD: 0,
      IDR: 0,
      TRY: 0
    }
  },
  plus: {
    name: 'Plus',
    queriesLimit: 3000,
    documentsLimit: -1, // unlimited
    profilesLimit: 5,
    scenariosLimit: 10,
    deliverablesLimit: 10,
    features: [
      '3,000 queries per month',
      'Unlimited document analysis',
      '5 profiles',
      'Export to all 6 formats',
      'Regulatory Scenario Simulator (10/month)',
      'Client Deliverable Composer (10/month)',
      'Priority email support'
    ],
    pricing: {
      monthly: {
        USD: 2900, // $29.00
        INR: 79900, // ₹799
        AED: 9900, // AED 99
        CAD: 3500, // CAD $35
        IDR: 149000, // Rp 149,000
        TRY: 89900 // ₺899
      },
      annual: {
        USD: 26100, // $261/year (save 25%)
        INR: 719900, // ₹7,199/year
        AED: 89100, // AED 891/year
        CAD: 31500, // CAD $315/year
        IDR: 1341000, // Rp 1,341,000/year
        TRY: 809100 // ₺8,091/year
      }
    }
  },
  professional: {
    name: 'Professional',
    queriesLimit: -1, // unlimited
    documentsLimit: -1,
    profilesLimit: -1,
    scenariosLimit: -1,
    deliverablesLimit: -1,
    features: [
      'Unlimited queries',
      'Unlimited document analysis',
      'Unlimited profiles',
      'API access',
      'Regulatory Scenario Simulator (unlimited)',
      'Client Deliverable Composer (unlimited)',
      'Forensic Document Intelligence',
      'Priority 24/7 chat support',
      'Early access to new features',
      'White-label reports'
    ],
    pricing: {
      monthly: {
        USD: 4900, // $49.00
        INR: 149900, // ₹1,499
        AED: 17900, // AED 179
        CAD: 5900, // CAD $59
        IDR: 249000, // Rp 249,000
        TRY: 149900 // ₺1,499
      },
      annual: {
        USD: 44100, // $441/year (save 25%)
        INR: 1349900, // ₹13,499/year
        AED: 161100, // AED 1,611/year
        CAD: 53100, // CAD $531/year
        IDR: 2241000, // Rp 2,241,000/year
        TRY: 1349100 // ₺13,491/year
      }
    }
  },
  enterprise: {
    name: 'Enterprise',
    queriesLimit: -1,
    documentsLimit: -1,
    profilesLimit: -1,
    scenariosLimit: -1,
    deliverablesLimit: -1,
    features: [
      'Everything in Professional',
      'Multi-user accounts (6+ users)',
      'SSO / SAML authentication',
      'Dedicated account manager',
      'Custom AI model training',
      'SLA guarantee (99.9% uptime)',
      'Dedicated support channel',
      'On-premise deployment option',
      'Custom export templates',
      'Usage analytics dashboard'
    ],
    pricing: {
      monthly: {
        USD: 49900, // $499 starting
        INR: 1499900,
        AED: 179900,
        CAD: 59900,
        IDR: 2490000,
        TRY: 1499900
      },
      annual: {
        USD: 449100, // $4,491/year (save 25%)
        INR: 13499100,
        AED: 1619100,
        CAD: 539100,
        IDR: 22410000,
        TRY: 13491100
      }
    }
  }
};

export class SubscriptionService {
  private razorpay: Razorpay | null = null;

  constructor() {
    // Initialize Razorpay only if credentials are available
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      this.razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
      });
    }
  }

  /**
   * Get or create usage quota for a user
   */
  async getOrCreateUsageQuota(userId: string) {
    let [quota] = await db.select()
      .from(usageQuotas)
      .where(eq(usageQuotas.userId, userId));

    if (!quota) {
      // Create default free tier quota
      const [newQuota] = await db.insert(usageQuotas).values({
        userId,
        plan: 'free',
        queriesLimit: PLAN_CONFIGS.free.queriesLimit,
        queriesUsed: 0,
        documentsLimit: PLAN_CONFIGS.free.documentsLimit,
        documentsUsed: 0,
        profilesLimit: PLAN_CONFIGS.free.profilesLimit,
        scenariosLimit: PLAN_CONFIGS.free.scenariosLimit,
        scenariosUsed: 0,
        deliverablesLimit: PLAN_CONFIGS.free.deliverablesLimit,
        deliverablesUsed: 0,
        resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1) // First day of next month
      }).returning();
      quota = newQuota;
    }

    return quota;
  }

  /**
   * Check if user has available quota for a feature
   */
  async checkQuota(userId: string, feature: 'queries' | 'documents' | 'scenarios' | 'deliverables'): Promise<boolean> {
    const quota = await this.getOrCreateUsageQuota(userId);
    
    switch (feature) {
      case 'queries':
        return quota.queriesLimit === -1 || quota.queriesUsed < quota.queriesLimit;
      case 'documents':
        return quota.documentsLimit === -1 || quota.documentsUsed < quota.documentsLimit;
      case 'scenarios':
        return quota.scenariosLimit === -1 || (quota.scenariosLimit > 0 && quota.scenariosUsed < quota.scenariosLimit);
      case 'deliverables':
        return quota.deliverablesLimit === -1 || (quota.deliverablesLimit > 0 && quota.deliverablesUsed < quota.deliverablesLimit);
      default:
        return false;
    }
  }

  /**
   * Increment usage for a feature
   */
  async incrementUsage(userId: string, feature: 'queries' | 'documents' | 'scenarios' | 'deliverables') {
    const quota = await this.getOrCreateUsageQuota(userId);
    
    const updates: any = {};
    switch (feature) {
      case 'queries':
        updates.queriesUsed = quota.queriesUsed + 1;
        break;
      case 'documents':
        updates.documentsUsed = quota.documentsUsed + 1;
        break;
      case 'scenarios':
        updates.scenariosUsed = quota.scenariosUsed + 1;
        break;
      case 'deliverables':
        updates.deliverablesUsed = quota.deliverablesUsed + 1;
        break;
    }

    await db.update(usageQuotas)
      .set(updates)
      .where(eq(usageQuotas.userId, userId));
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: string) {
    const [subscription] = await db.select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      )
      .orderBy(subscriptions.createdAt)
      .limit(1);

    return subscription;
  }

  /**
   * Create a Razorpay order for subscription payment
   */
  async createPaymentOrder(
    userId: string,
    plan: 'plus' | 'professional' | 'enterprise',
    billingCycle: 'monthly' | 'annual',
    currency: 'USD' | 'INR' | 'AED' | 'CAD' | 'IDR' | 'TRY'
  ) {
    if (!this.razorpay) {
      throw new Error('Razorpay is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to environment variables.');
    }

    const planConfig = PLAN_CONFIGS[plan];
    const pricing = planConfig.pricing as any;
    const amount = pricing[billingCycle][currency];

    // Create Razorpay order
    const order = await this.razorpay.orders.create({
      amount,
      currency,
      receipt: `order_${userId}_${Date.now()}`,
      notes: {
        userId,
        plan,
        billingCycle
      }
    });

    // Store payment record
    await db.insert(payments).values({
      userId,
      amount,
      currency,
      status: 'pending',
      razorpayOrderId: order.id,
      metadata: {
        plan,
        billingCycle
      }
    });

    return order;
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_SECRET not configured');
    }

    const text = orderId + '|' + paymentId;
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    return generated_signature === signature;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      throw new Error('RAZORPAY_WEBHOOK_SECRET not configured');
    }

    const expected_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    return expected_signature === signature;
  }

  /**
   * Handle successful payment and activate subscription
   * Idempotent: safe to call multiple times for the same payment
   */
  async activateSubscription(paymentId: string) {
    // Get payment record
    const [payment] = await db.select()
      .from(payments)
      .where(eq(payments.razorpayPaymentId, paymentId));

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Idempotency check - already processed
    if (payment.status === 'successful') {
      console.log('[Payment] Already processed:', paymentId);
      return; // Already processed, safe to return
    }

    const { plan, billingCycle } = payment.metadata as any;
    const planConfig = PLAN_CONFIGS[plan as keyof typeof PLAN_CONFIGS];

    // Calculate subscription period
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // Cancel any existing active subscriptions
    await db.update(subscriptions)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(
        and(
          eq(subscriptions.userId, payment.userId),
          eq(subscriptions.status, 'active')
        )
      );

    // Create new subscription
    await db.insert(subscriptions).values({
      userId: payment.userId,
      plan,
      status: 'active',
      billingCycle,
      amount: payment.amount,
      currency: payment.currency,
      razorpaySubscriptionId: null, // Can be updated later if using Razorpay subscriptions
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd
    });

    // Update payment status
    await db.update(payments)
      .set({ 
        status: 'successful',
        updatedAt: now
      })
      .where(eq(payments.id, payment.id));

    // Update usage quota
    await db.update(usageQuotas)
      .set({
        plan,
        queriesLimit: planConfig.queriesLimit,
        queriesUsed: 0,
        documentsLimit: planConfig.documentsLimit,
        documentsUsed: 0,
        profilesLimit: planConfig.profilesLimit,
        scenariosLimit: planConfig.scenariosLimit,
        scenariosUsed: 0,
        deliverablesLimit: planConfig.deliverablesLimit,
        deliverablesUsed: 0,
        resetAt: periodEnd
      })
      .where(eq(usageQuotas.userId, payment.userId));

    // Update user subscription tier
    await db.update(users)
      .set({ subscriptionTier: plan })
      .where(eq(users.id, payment.userId));
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string) {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    await db.update(subscriptions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelAt: subscription.currentPeriodEnd // Allow access until end of period
      })
      .where(eq(subscriptions.id, subscription.id));

    return subscription;
  }

  /**
   * Get pricing for a specific region
   */
  getPricing(currency: 'USD' | 'INR' | 'AED' | 'CAD' | 'IDR' | 'TRY') {
    return {
      free: PLAN_CONFIGS.free,
      plus: {
        ...PLAN_CONFIGS.plus,
        monthlyPrice: PLAN_CONFIGS.plus.pricing.monthly[currency],
        annualPrice: PLAN_CONFIGS.plus.pricing.annual[currency]
      },
      professional: {
        ...PLAN_CONFIGS.professional,
        monthlyPrice: PLAN_CONFIGS.professional.pricing.monthly[currency],
        annualPrice: PLAN_CONFIGS.professional.pricing.annual[currency]
      },
      enterprise: {
        ...PLAN_CONFIGS.enterprise,
        monthlyPrice: PLAN_CONFIGS.enterprise.pricing.monthly[currency]
      }
    };
  }
}

export const subscriptionService = new SubscriptionService();
